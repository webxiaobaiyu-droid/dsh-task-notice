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
import type {
  CompletionRecord,
  DecisionQuestion,
  NoticeStatus,
  PendingDecision,
  RunningTask,
} from './types.ts'

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

/** Bounds for the words a pending decision carries through the snapshot. */
const MAX_QUESTION_CHARS = 300
const MAX_DECISION_DETAIL_CHARS = 500
const MAX_OPTION_CHARS = 80
const MAX_OPTION_DESCRIPTION_CHARS = 200

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

/** Whether a parsed JSON value is a plain object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** One bounded, whitespace-collapsed string from an unknown field. */
function textOf(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = oneLine(value, max)
  return text === '' ? undefined : text
}

/**
 * Read the questions out of an `ask_user_question` tool call's raw arguments.
 *
 * The call is the only durable signal that a turn is waiting on a person; the
 * tool result settles it later. Malformed arguments never reach a card, so this
 * returns `undefined` rather than inventing a question.
 *
 * @param argumentsText - raw JSON arguments recorded on `tool/call`.
 * @returns the bounded questions, or `undefined` when the payload is unusable.
 */
export function decisionQuestionsOf(argumentsText: string): readonly DecisionQuestion[] | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(argumentsText)
  } catch {
    return undefined
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.questions)) return undefined
  const questions: DecisionQuestion[] = []
  for (const item of parsed.questions) {
    if (!isRecord(item)) continue
    const id = textOf(item.id, MAX_OPTION_CHARS)
    const question = textOf(item.question, MAX_QUESTION_CHARS)
    if (id === undefined || question === undefined) continue
    const header = textOf(item.header, MAX_OPTION_CHARS)
    const detail = textOf(item.detail, MAX_DECISION_DETAIL_CHARS)
    const options: { readonly label: string; readonly description?: string }[] = []
    if (Array.isArray(item.options)) {
      for (const option of item.options) {
        if (!isRecord(option)) continue
        const label = textOf(option.label, MAX_OPTION_CHARS)
        if (label === undefined) continue
        const description = textOf(option.description, MAX_OPTION_DESCRIPTION_CHARS)
        options.push(description === undefined ? { label } : { label, description })
      }
    }
    const multiSelect = typeof item.multi_select === 'boolean'
      ? item.multi_select
      : typeof item.multiSelect === 'boolean' ? item.multiSelect : undefined
    questions.push({
      id,
      question,
      ...header === undefined ? {} : { header },
      ...detail === undefined ? {} : { detail },
      ...options.length === 0 ? {} : { options },
      ...multiSelect === undefined ? {} : { multiSelect },
    })
  }
  return questions.length === 0 ? undefined : questions
}

/**
 * Whether a tool result is the timed tool's `{ pending: true }` payload.
 *
 * That payload means the foreground wait ended but the question is still
 * answerable as `continued`; it is not an answer and must not clear the notice.
 *
 * @param message - the recorded tool result message.
 * @returns whether the question remains answerable.
 */
function isPendingToolResult(message: {
  readonly isError?: boolean
  readonly content: readonly { readonly type: string; readonly text?: string }[]
}): boolean {
  if (message.isError === true) return false
  const block = message.content.find(item => item.type === 'text')
  if (block?.text === undefined) return false
  try {
    const parsed: unknown = JSON.parse(block.text)
    return isRecord(parsed) && parsed.pending === true
  } catch {
    return false
  }
}

/** One live question call and whether its turn is still holding the tool open. */
interface DecisionState {
  record: PendingDecision
  state: 'open' | 'continued'
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
  private readonly decisions = new Map<string, DecisionState>()
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

  /** Questions still waiting for a person, newest first. */
  pendingDecisions(): readonly PendingDecision[] {
    return [...this.decisions.values()]
      .map(item => item.record)
      .sort((a, b) => b.createdAt - a.createdAt)
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
      case 'tool/call': {
        if (event.data.name !== 'ask_user_question') return 'none'
        const questions = decisionQuestionsOf(event.data.arguments)
        if (questions === undefined) return 'none'
        const callId = String(event.data.callId)
        const id = `${facts.id}:${callId}`
        if (this.decisions.has(id)) return 'none'
        const turn = this.turns.get(facts.id)
        const prompt = turn?.prompt ?? this.pending.get(facts.id) ?? ''
        const record: PendingDecision = {
          id,
          sessionId: facts.id,
          turn: event.data.turn,
          title: this.titleOf(facts.id, prompt),
          prompt,
          project: projectOf(facts.cwd),
          ...facts.cwd === undefined ? {} : { cwd: facts.cwd },
          questions,
          createdAt: event.time,
          subagent: facts.subagent,
        }
        this.decisions.set(id, { record, state: 'open' })
        this.rev += 1
        return 'updated'
      }
      case 'tool/result': {
        const id = `${facts.id}:${String(event.data.message.toolCallId)}`
        const decision = this.decisions.get(id)
        if (decision === undefined) return 'none'
        // A timed wait that returned pending, and a call resumed after a crash,
        // both leave the question answerable even though a tool result exists.
        if (event.data.error?.code === 'TOOL_OUTCOME_UNKNOWN' || isPendingToolResult(event.data.message)) {
          if (decision.state === 'continued') return 'none'
          decision.state = 'continued'
          this.rev += 1
          return 'updated'
        }
        this.decisions.delete(id)
        this.rev += 1
        return 'updated'
      }
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
        const source = event.data.source as { readonly kind?: string; readonly callId?: unknown }
        if (source.kind === 'user-question-reply' && typeof source.callId === 'string') {
          if (this.decisions.delete(`${facts.id}:${source.callId}`)) this.rev += 1
          return 'none'
        }
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
        for (const item of this.decisions.values()) {
          if (item.record.sessionId !== facts.id || item.record.title === title) continue
          item.record = { ...item.record, title }
          changed = true
        }
        if (changed) this.rev += 1
        return changed ? 'updated' : 'none'
      }
      case 'turn/end': {
        // A question whose turn ends without a continued wait is no longer
        // answerable; a timed wait that returned pending survives the turn.
        const settled = event.data.reason.kind === 'completed' || event.data.reason.kind === 'max-tokens'
        for (const [id, item] of this.decisions) {
          if (item.record.sessionId !== facts.id || item.record.turn !== event.data.turn) continue
          if (settled && item.state === 'continued') continue
          this.decisions.delete(id)
        }
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
    let hadDecision = false
    for (const [id, item] of this.decisions) {
      if (item.record.sessionId !== sessionId) continue
      this.decisions.delete(id)
      hadDecision = true
    }
    if (hadTurn || hadPending || hadDecision) this.rev += 1
  }

  /** A title to print: the latest logged one, else the prompt's opening words. */
  private titleOf(sessionId: string, prompt: string): string {
    const known = this.titles.get(sessionId)
    if (known !== undefined) return known
    return prompt === '' ? '' : oneLine(prompt, FALLBACK_TITLE_CHARS)
  }
}
