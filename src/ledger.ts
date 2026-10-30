/**
 * The completion ledger: every session's turn lifecycle folded into one list.
 *
 * The fold is deliberately a plain class over plain event objects rather than a
 * Cordis service. That is what makes the interesting rules testable without a
 * running harness: which turn a prompt belongs to, what a cancelled or failed
 * turn is called, when a title arrives too late to be part of the record, and
 * which sessions are working right now.
 *
 * Two ordering facts drive the design:
 *
 * - `turn/start` is appended before the user message it will answer, so a
 *   prompt seen while a turn is open belongs to that turn, and a prompt seen
 *   while none is open is held for the next one.
 * - `session/title` may arrive after `turn/end` — title generation is a
 *   separate, slower provider call. A record is therefore allowed to be updated
 *   after it was appended, and that update bumps `revision` without changing
 *   the record's own `seq`.
 *
 * @module dsh-task-notice/ledger
 */

import type { SessionEvent, TurnEndReason } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-title'
import type { CompletionRecord, NoticeStatus, RunningTask } from './types.ts'

/** The slice of a Session the ledger needs, read at event time. */
export interface SessionFacts {
  /** Session identity. */
  readonly id: string
  /** Absolute working directory, when the session recorded one. */
  readonly cwd?: string
  /** Whether this session is a subagent's private workspace. */
  readonly subagent: boolean
}

/** One open turn. */
interface TurnState {
  readonly facts: SessionFacts
  readonly turn: number
  readonly startedAt: number
  prompt: string
}

/** What one observed event changed. */
export type ObserveResult = 'new' | 'updated' | 'none'

/** Longest prompt text kept in one record. */
export const MAX_PROMPT_CHARS = 500

/** Longest title fallback derived from a prompt. */
const FALLBACK_TITLE_CHARS = 40

/** Longest error or cancellation detail kept. */
const MAX_DETAIL_CHARS = 180

/**
 * Collapse whitespace and bound a string.
 * @param text - raw text.
 * @param max - maximum characters before the ellipsis.
 * @returns one line, never longer than `max`.
 */
export function oneLine(text: string, max: number): string {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  const characters = [...collapsed]
  return characters.length <= max ? collapsed : `${characters.slice(0, Math.max(0, max - 1)).join('')}…`
}

/**
 * Display name of a project directory.
 * @param cwd - absolute directory, when known.
 * @returns its last path segment, or a stable placeholder.
 */
export function projectOf(cwd: string | undefined): string {
  if (cwd === undefined || cwd === '') return ''
  const trimmed = cwd.replace(/[\\/]+$/u, '')
  const segment = trimmed.split(/[\\/]/u).at(-1)
  return segment === undefined || segment === '' ? cwd : segment
}

/**
 * The user-visible text of a user message, including markers for attachments.
 * @param content - the message's content blocks.
 * @returns the collapsed prompt text.
 */
export function promptText(content: readonly { readonly type: string; readonly text?: string }[]): string {
  const parts: string[] = []
  let images = 0
  let files = 0
  for (const block of content) {
    if (block.type === 'text' && typeof block.text === 'string') {
      const text = block.text.trim()
      if (text !== '') parts.push(text)
    } else if (block.type === 'image') {
      images += 1
    } else if (block.type === 'file') {
      files += 1
    }
  }
  if (images > 0) parts.push(images === 1 ? '[图片]' : `[${String(images)} 张图片]`)
  if (files > 0) parts.push(files === 1 ? '[文件]' : `[${String(files)} 个文件]`)
  return oneLine(parts.join(' '), MAX_PROMPT_CHARS)
}

/**
 * Reduce a turn's end reason to a notice status.
 * @param reason - the durable reason.
 * @returns the status and optional detail, or `undefined` for closers that are
 *   bookkeeping rather than a finished piece of work.
 */
export function statusOf(reason: TurnEndReason): { readonly status: NoticeStatus; readonly detail?: string } | undefined {
  switch (reason.kind) {
    case 'completed':
      return { status: 'done' }
    case 'max-tokens':
      return { status: 'done', detail: '达到输出上限' }
    case 'aborted': {
      const detail = reason.reason.kind === 'user'
        ? '你停止了它'
        : reason.reason.kind === 'parent'
          ? '父任务停止了它'
          : reason.reason.kind === 'disposed'
            ? '会话已关闭'
            : reason.reason.kind === 'hook'
              ? oneLine(reason.reason.reason, MAX_DETAIL_CHARS)
              : undefined
      return detail === undefined ? { status: 'stopped' } : { status: 'stopped', detail }
    }
    case 'blocked':
      return { status: 'blocked' }
    case 'error':
      return { status: 'failed', detail: oneLine(reason.error.message, MAX_DETAIL_CHARS) }
    case 'interrupted':
    case 'forked':
      // A crash-orphaned closer or a fork boundary is not work that just
      // finished; telling someone about it would be a false alarm.
      return undefined
    default:
      return undefined
  }
}

/** One finished-turn ledger plus the sessions still working. */
export class NoticeLedger {
  private readonly records: CompletionRecord[] = []
  private readonly turns = new Map<string, TurnState>()
  private readonly pending = new Map<string, string>()
  private readonly titles = new Map<string, string>()
  private readonly maxRecords: number
  private readonly includeSubagents: boolean
  private nextRecordSeq = 1
  private rev = 0

  /**
   * @param options - history bound and whether subagent sessions count.
   */
  constructor(options: { readonly maxRecords: number; readonly includeSubagents: boolean }) {
    this.maxRecords = Math.max(1, Math.floor(options.maxRecords))
    this.includeSubagents = options.includeSubagents
  }

  /** Monotonic change counter for long-poll wakeups. */
  get revision(): number {
    return this.rev
  }

  /** The next record's sequence number, also one past the newest record. */
  get seq(): number {
    return this.nextRecordSeq
  }

  /** Every kept record, newest first. */
  list(): readonly CompletionRecord[] {
    return this.records
  }

  /** Sessions working right now, newest turn first. */
  running(): readonly RunningTask[] {
    return [...this.turns.values()]
      .sort((a, b) => b.startedAt - a.startedAt)
      .map(turn => ({
        sessionId: turn.facts.id,
        turn: turn.turn,
        title: this.titleOf(turn.facts.id, turn.prompt),
        prompt: turn.prompt,
        project: projectOf(turn.facts.cwd),
        ...turn.facts.cwd === undefined ? {} : { cwd: turn.facts.cwd },
        startedAt: turn.startedAt,
      }))
  }

  /**
   * Load persisted records before the Host starts observing.
   *
   * Records arrive newest first. Their `seq` values are preserved so a browser
   * that was already open does not read the whole history as new; the next
   * record continues above the highest loaded value.
   *
   * @param records - previously persisted records.
   */
  seed(records: readonly CompletionRecord[]): void {
    for (const record of [...records].sort((a, b) => b.seq - a.seq).slice(0, this.maxRecords)) {
      this.records.push(record)
      this.nextRecordSeq = Math.max(this.nextRecordSeq, record.seq + 1)
    }
    if (this.records.length > 0) this.rev += 1
  }

  /** Drop every finished-turn record, keeping the running turns. */
  clear(): void {
    if (this.records.length === 0) return
    this.records.length = 0
    this.rev += 1
  }

  /**
   * Observe one committed session event.
   *
   * @param facts - the session's identity and working directory.
   * @param event - the appended event.
   * @returns whether the snapshot changed, and whether a record is new.
   */
  observe(facts: SessionFacts, event: SessionEvent): ObserveResult {
    if (facts.subagent && !this.includeSubagents) return 'none'
    switch (event.type) {
      case 'turn/start': {
        const pending = this.pending.get(facts.id) ?? ''
        this.pending.delete(facts.id)
        this.turns.set(facts.id, {
          facts,
          turn: event.data.turn,
          startedAt: event.time,
          prompt: pending,
        })
        this.rev += 1
        return 'updated'
      }
      case 'user/message': {
        const text = promptText(event.data.content)
        if (text === '') return 'none'
        this.pending.set(facts.id, text)
        const turn = this.turns.get(facts.id)
        if (turn !== undefined && turn.prompt === '') {
          turn.prompt = text
          this.rev += 1
          return 'updated'
        }
        return 'none'
      }
      case 'session/title': {
        const title = oneLine(event.data.title, 120)
        if (title === '') return 'none'
        this.titles.set(facts.id, title)
        let changed = false
        for (const record of this.records) {
          if (record.sessionId !== facts.id || record.title === title) continue
          ;(record as { title: string }).title = title
          changed = true
        }
        if (changed) this.rev += 1
        return changed ? 'updated' : 'none'
      }
      case 'turn/end': {
        const turn = this.turns.get(facts.id)
        this.turns.delete(facts.id)
        const prompt = turn?.prompt ?? this.pending.get(facts.id) ?? ''
        this.pending.delete(facts.id)
        const status = statusOf(event.data.reason)
        if (status === undefined) {
          this.rev += 1
          return 'updated'
        }
        const startedAt = turn?.startedAt ?? event.time
        const record: CompletionRecord = {
          id: `${facts.id}:${String(event.data.turn)}`,
          seq: this.nextRecordSeq,
          sessionId: facts.id,
          turn: event.data.turn,
          title: this.titleOf(facts.id, prompt),
          prompt,
          project: projectOf(facts.cwd),
          ...facts.cwd === undefined ? {} : { cwd: facts.cwd },
          status: status.status,
          ...status.detail === undefined ? {} : { detail: status.detail },
          startedAt,
          endedAt: event.time,
          durationMs: Math.max(0, event.time - startedAt),
          subagent: facts.subagent,
        }
        this.nextRecordSeq += 1
        this.records.unshift(record)
        if (this.records.length > this.maxRecords) this.records.length = this.maxRecords
        this.rev += 1
        return 'new'
      }
      default:
        return 'none'
    }
  }

  /**
   * Drop a disposed session's live state.
   * @param sessionId - the session that left the store.
   */
  forget(sessionId: string): void {
    const hadTurn = this.turns.delete(sessionId)
    const hadPending = this.pending.delete(sessionId)
    if (hadTurn || hadPending) this.rev += 1
  }

  /** A title to print: the latest logged one, else the prompt's opening words. */
  private titleOf(sessionId: string, prompt: string): string {
    const known = this.titles.get(sessionId)
    if (known !== undefined) return known
    return prompt === '' ? '' : oneLine(prompt, FALLBACK_TITLE_CHARS)
  }
}
