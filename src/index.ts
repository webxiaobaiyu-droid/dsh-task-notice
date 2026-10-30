/**
 * Task completion notice, Host half.
 *
 * One job: watch every session's durable event feed — not just the one on
 * screen — and keep a small ledger of turns that just finished. The browser half
 * long-polls this ledger and does the telling.
 *
 * Why the Host owns this: the page only receives events for the session it is
 * showing. A notice that fired only there would be a notice for the conversation
 * the user is already looking at, which is the one case that needs no notice at
 * all. Every open session appends through this process, so the process is the
 * only place where "some other project finished" is knowable.
 *
 * The ledger itself is a plain class (see `ledger.ts`); this module is only the
 * wiring: Cordis events in, JSON history on disk, one long-poll route out.
 *
 * @module dsh-task-notice
 */

import type { Context } from '@deepseek-ai/cordis'
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { NoticeLedger, type SessionFacts } from './ledger.ts'
import {
  CLEAR_PATH,
  HISTORY_VERSION,
  MAX_WAIT_MS,
  STATE_PATH,
  type CompletionRecord,
  type NoticeConfig,
  type NoticeSnapshot,
  type NoticeStatus,
  type PersistedHistory,
} from './types.ts'

export type * from './types.ts'
export { NoticeLedger, oneLine, projectOf, promptText, statusOf } from './ledger.ts'
export type { ObserveResult, SessionFacts } from './ledger.ts'

/** Plugin name the loader row addresses. */
export const name = 'dsh-task-notice'

/** Services this plugin cannot work without: the Fetch carrier's route table. */
export const inject = ['connection']

/** Default number of finished turns kept and persisted. */
const DEFAULT_MAX_RECORDS = 100

/** Longest accepted history size, so one bad config cannot grow without bound. */
const MAX_RECORDS_LIMIT = 500

/** How long a history write waits for more changes, in milliseconds. */
const SAVE_DEBOUNCE_MS = 400

/** Resolved configuration; every field is present. */
interface ResolvedConfig {
  readonly maxRecords: number
  readonly includeSubagents: boolean
  readonly persist: boolean
}

/**
 * Turn loose loader configuration into the three facts this plugin uses.
 * @param raw - the row's `config`, possibly absent or hand-edited.
 * @returns resolved configuration.
 */
export function resolveConfig(raw: NoticeConfig | undefined): ResolvedConfig {
  const value = raw ?? {}
  const maxRecords = value.maxRecords
  return {
    maxRecords: typeof maxRecords === 'number' && Number.isFinite(maxRecords)
      ? Math.min(MAX_RECORDS_LIMIT, Math.max(1, Math.floor(maxRecords)))
      : DEFAULT_MAX_RECORDS,
    includeSubagents: value.includeSubagents === true,
    persist: value.persist !== false,
  }
}

/** The route-registration face of `ctx.connection` (see the harness carrier). */
interface NoticeConnection {
  readonly fetch: {
    register(route: {
      readonly path: string
      readonly methods: readonly ('GET' | 'HEAD' | 'POST')[]
      readonly requestBody: 'buffered' | 'streaming'
      readonly fetch: (request: Request) => Promise<Response>
    }): () => Promise<void>
  }
}

/** JSON response with no cache, the shape every route here uses. */
function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
}

/** The harness home: `$DSH_HOME` when set, else `~/.dsh`. */
function resolveDshHome(env: NodeJS.ProcessEnv = process.env, home: string = homedir()): string {
  const configured = env.DSH_HOME?.trim()
  return configured !== undefined && configured.length > 0 ? configured : join(home, '.dsh')
}

/** Whether a value is a valid status tag. */
function isStatus(value: unknown): value is NoticeStatus {
  return value === 'done' || value === 'failed' || value === 'stopped' || value === 'blocked'
}

/**
 * Accept one persisted record, dropping anything this build cannot trust.
 * @param value - parsed JSON.
 * @returns the record, or `undefined`.
 */
function sanitizeRecord(value: unknown): CompletionRecord | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || record.id === '') return undefined
  if (typeof record.seq !== 'number' || !Number.isSafeInteger(record.seq) || record.seq < 1) return undefined
  if (typeof record.sessionId !== 'string' || record.sessionId === '') return undefined
  if (typeof record.turn !== 'number' || !Number.isSafeInteger(record.turn)) return undefined
  if (typeof record.title !== 'string' || typeof record.prompt !== 'string') return undefined
  if (typeof record.project !== 'string') return undefined
  if (!isStatus(record.status)) return undefined
  if (typeof record.startedAt !== 'number' || typeof record.endedAt !== 'number') return undefined
  if (typeof record.durationMs !== 'number') return undefined
  return {
    id: record.id,
    seq: record.seq,
    sessionId: record.sessionId,
    turn: record.turn,
    title: record.title,
    prompt: record.prompt,
    project: record.project,
    ...typeof record.cwd === 'string' ? { cwd: record.cwd } : {},
    status: record.status,
    ...typeof record.detail === 'string' ? { detail: record.detail } : {},
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    durationMs: record.durationMs,
    subagent: record.subagent === true,
  }
}

/** Read the small history file, tolerating a missing or damaged one. */
function loadHistory(path: string): readonly CompletionRecord[] {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (typeof parsed !== 'object' || parsed === null) return []
    const file = parsed as Partial<PersistedHistory>
    if (file.version !== HISTORY_VERSION || !Array.isArray(file.records)) return []
    return file.records.map(sanitizeRecord).filter((record): record is CompletionRecord => record !== undefined)
  } catch {
    return []
  }
}

/** One ledger plus the routes and persistence around it. */
class NoticeHost {
  readonly bootId = randomUUID()
  readonly config: ResolvedConfig
  readonly ledger: NoticeLedger
  private readonly historyPath: string
  private readonly waiters = new Set<() => void>()
  private saveTimer: ReturnType<typeof setTimeout> | undefined

  /**
   * @param config - resolved plugin configuration.
   */
  constructor(config: ResolvedConfig) {
    this.config = config
    this.ledger = new NoticeLedger({
      maxRecords: config.maxRecords,
      includeSubagents: config.includeSubagents,
    })
    this.historyPath = join(resolveDshHome(), 'task-notice', 'history.json')
    if (!config.persist) return
    mkdirSync(join(resolveDshHome(), 'task-notice'), { recursive: true })
    this.ledger.seed(loadHistory(this.historyPath))
  }

  /** The current snapshot, the only shape the browser knows. */
  snapshot(): NoticeSnapshot {
    return {
      bootId: this.bootId,
      revision: this.ledger.revision,
      records: this.ledger.list(),
      running: this.ledger.running(),
      now: Date.now(),
    }
  }

  /** Wake every long-poll waiting on an older revision. */
  notify(): void {
    for (const wake of [...this.waiters]) wake()
  }

  /**
   * Hold a poll until the ledger changes or the wait expires.
   * @param since - the revision the caller already has.
   * @param waitMs - longest hold, bounded by {@link MAX_WAIT_MS}.
   * @param signal - caller's disconnect signal.
   */
  async waitForChange(since: number, waitMs: number, signal: AbortSignal): Promise<void> {
    if (this.ledger.revision > since || waitMs <= 0) return
    await new Promise<void>((resolve) => {
      let settled = false
      const finish = (): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        signal.removeEventListener('abort', finish)
        this.waiters.delete(finish)
        resolve()
      }
      const timer = setTimeout(finish, Math.min(waitMs, MAX_WAIT_MS))
      signal.addEventListener('abort', finish, { once: true })
      this.waiters.add(finish)
    })
  }

  /** Schedule a debounced history write. */
  scheduleSave(): void {
    if (!this.config.persist) return
    if (this.saveTimer !== undefined) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined
      void this.save()
    }, SAVE_DEBOUNCE_MS)
  }

  /** Write the ledger now, atomically enough for a single writer. */
  async save(): Promise<void> {
    if (!this.config.persist) return
    const body: PersistedHistory = {
      version: HISTORY_VERSION,
      savedAt: Date.now(),
      records: this.ledger.list(),
    }
    try {
      await mkdir(join(resolveDshHome(), 'task-notice'), { recursive: true })
      const temporary = `${this.historyPath}.tmp`
      await writeFile(temporary, `${JSON.stringify(body, undefined, 2)}\n`, 'utf8')
      await rename(temporary, this.historyPath)
    } catch (error: unknown) {
      // A failed history write is a missing convenience, not a reason to break
      // the live feed; the next completion tries again.
      console.warn('[dsh-task-notice] history write failed:', error instanceof Error ? error.message : error)
    }
  }

  /** Flush synchronously during plugin disposal, where promises no longer run. */
  flush(): void {
    if (this.saveTimer !== undefined) {
      clearTimeout(this.saveTimer)
      this.saveTimer = undefined
    }
    if (!this.config.persist) return
    try {
      const body: PersistedHistory = {
        version: HISTORY_VERSION,
        savedAt: Date.now(),
        records: this.ledger.list(),
      }
      writeFileSync(this.historyPath, `${JSON.stringify(body, undefined, 2)}\n`, 'utf8')
    } catch {
      // Disposal cannot report anywhere useful.
    }
  }

  /** Clear finished turns, keep running ones, and persist immediately. */
  clear(): void {
    this.ledger.clear()
    this.notify()
    void this.save()
  }
}

/** Facts the ledger needs from a live session. */
function factsOf(session: { readonly id: string; readonly header: { readonly cwd?: string; readonly origin?: string } }): SessionFacts {
  return {
    id: session.id,
    ...session.header.cwd === undefined ? {} : { cwd: session.header.cwd },
    subagent: session.header.origin === 'subagent',
  }
}

/**
 * Mount the completion ledger, its history, and its two routes.
 * @param ctx - Host plugin context.
 * @param config - the loader row's configuration.
 */
export function apply(ctx: Context, config: NoticeConfig = {}): void {
  const host = new NoticeHost(resolveConfig(config))

  ctx.on('session/event', (session, event) => {
    const before = host.ledger.revision
    host.ledger.observe(factsOf(session), event)
    if (host.ledger.revision === before) return
    host.notify()
    host.scheduleSave()
  })

  ctx.on('session/disposed', (session) => {
    const before = host.ledger.revision
    host.ledger.forget(session.id)
    if (host.ledger.revision === before) return
    host.notify()
  })

  const connection = Reflect.get(ctx, 'connection') as NoticeConnection | undefined
  if (connection === undefined) throw new Error('dsh-task-notice requires the connection service')

  ctx.effect(
    () => connection.fetch.register({
      path: STATE_PATH,
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: async (request) => {
        const url = new URL(request.url)
        const since = Number(url.searchParams.get('since') ?? '')
        const wait = Number(url.searchParams.get('wait') ?? '0')
        if (Number.isFinite(since) && Number.isFinite(wait) && wait > 0) {
          await host.waitForChange(since, wait, request.signal)
        }
        return jsonResponse(host.snapshot())
      },
    }),
    'dsh-task-notice: state route',
  )

  ctx.effect(
    () => connection.fetch.register({
      path: CLEAR_PATH,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async () => {
        host.clear()
        return jsonResponse({ ok: true })
      },
    }),
    'dsh-task-notice: clear route',
  )

  ctx.effect(() => () => {
    host.flush()
  }, 'dsh-task-notice: flush history')
}
