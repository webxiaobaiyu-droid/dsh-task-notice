/**
 * The rules the widget applies to a snapshot, kept out of the component.
 *
 * Three of them are the ones a notification surface gets wrong quietly:
 *
 * - **A record is new by its own sequence, not by the poll's revision.** Title
 *   updates bump the revision after a record exists; treating any revision bump
 *   as news would announce the same finished turn twice.
 * - **The conversation already on screen does not need a toast.** Its answer is
 *   being rendered in front of the person. This only holds while the window is
 *   focused: a background window showing that conversation still needs telling.
 * - **Unread is a timestamp, not a counter.** The counter would drift across
 *   reloads and tabs; `endedAt > seenAt` is derivable from data the host already
 *   sends, and it survives a restart.
 *
 * @module dsh-task-notice/client/model
 */

import type { CompletionRecord, PendingDecision } from '../types.ts'
import { daysBefore, dayKey, sameDay } from './format.ts'

/** The subset of settings the alert decision needs. */
export interface AlertPolicy {
  /** Whether the session already open in the centre column is announced too. */
  readonly always: boolean
  /** The session bound to the main column, if any. */
  readonly currentSessionId: string | undefined
  /** Whether the document is hidden or another application has focus. */
  readonly background: boolean
}

/**
 * Whether one finished turn deserves a toast and a chime.
 * @param record - a newly arrived record.
 * @param policy - what the window is showing right now.
 * @returns whether to interrupt.
 */
export function shouldAlert(record: CompletionRecord, policy: AlertPolicy): boolean {
  if (record.subagent) return false
  if (policy.always) return true
  if (policy.background) return true
  return record.sessionId !== policy.currentSessionId
}

/**
 * Whether a pending question deserves a toast and a chime.
 *
 * A decision is not a finished turn, but it has the same attention rule: a
 * question in the conversation already on screen is visible there, while a
 * question in another project is exactly what this widget exists to surface.
 *
 * @param decision - a newly arrived pending decision.
 * @param policy - what the window is showing right now.
 * @returns whether to interrupt.
 */
export function shouldAlertDecision(decision: PendingDecision, policy: AlertPolicy): boolean {
  if (decision.subagent) return false
  if (policy.always) return true
  if (policy.background) return true
  return decision.sessionId !== policy.currentSessionId
}

/**
 * Records newer than the browser's cursor.
 * @param records - snapshot records, newest first.
 * @param lastSeq - highest record sequence already seen.
 * @returns the new records in the order they finished.
 */
export function newRecords(records: readonly CompletionRecord[], lastSeq: number): readonly CompletionRecord[] {
  return records
    .filter(record => record.seq > lastSeq)
    .slice()
    .sort((a, b) => a.seq - b.seq)
}

/** Highest record sequence in a snapshot, or 0 when it has none. */
export function highestSeq(records: readonly CompletionRecord[]): number {
  let highest = 0
  for (const record of records) highest = Math.max(highest, record.seq)
  return highest
}

/**
 * Unread records: those that finished after the person last looked.
 * @param records - snapshot records, newest first.
 * @param seenAt - epoch milliseconds of the last look.
 * @returns the unread records.
 */
export function unreadRecords(records: readonly CompletionRecord[], seenAt: number): readonly CompletionRecord[] {
  return records.filter(record => !record.subagent && record.endedAt > seenAt)
}

/**
 * Records still worth listing: every record whose notice has not been entered.
 *
 * Entering a notice is stronger than reading it. A read record stays in the
 * ledger as history; one the person clicked through to its session should stop
 * asking for attention and leave this surface entirely.
 *
 * @param records - snapshot records, newest first.
 * @param entered - ids whose session was already opened from a notice.
 * @returns records with entered notices removed.
 */
export function visibleRecords(
  records: readonly CompletionRecord[],
  entered: ReadonlySet<string>,
): readonly CompletionRecord[] {
  if (entered.size === 0) return records
  return records.filter(record => !entered.has(record.id))
}

/** One day's records, with the label to print above them. */
export interface DayGroup {
  /** Calendar key, stable across renders. */
  readonly key: string
  /** `today`, `yesterday`, or `other` — the component localizes it. */
  readonly label: 'today' | 'yesterday' | 'other'
  /** The day's records, newest first. */
  readonly records: readonly CompletionRecord[]
}

/**
 * Group records by the local day they finished on.
 * @param records - snapshot records, newest first.
 * @param now - current epoch milliseconds for the relative labels.
 * @returns groups newest day first.
 */
export function groupByDay(records: readonly CompletionRecord[], now: number): readonly DayGroup[] {
  const groups: DayGroup[] = []
  let current: { key: string; records: CompletionRecord[] } | undefined
  for (const record of records) {
    const key = dayKey(record.endedAt)
    if (current === undefined || current.key !== key) {
      current = { key, records: [] }
      groups.push({ key, label: labelFor(key, now), records: current.records })
    }
    current.records.push(record)
  }
  return groups
}

/** Label one calendar day relative to today. */
function labelFor(key: string, now: number): 'today' | 'yesterday' | 'other' {
  if (key === dayKey(now)) return 'today'
  if (key === daysBefore(now, 1)) return 'yesterday'
  return 'other'
}

/** A day key as `10月28日` / `Oct 28`. */
export function dayTitle(key: string, locale: string): string {
  const [year, month, day] = key.split('-').map(Number)
  if (year === undefined || month === undefined || day === undefined) return key
  const date = new Date(year, month - 1, day)
  if (Number.isNaN(date.getTime())) return key
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(date)
}

/**
 * Whether a session title says anything the prompt does not already say.
 *
 * A deterministic fallback title is the prompt's opening words, and the first
 * generated title is often the same words with punctuation trimmed. Printing
 * that line under the prompt repeats the question in a slightly worse way; the
 * title earns its line only once it is actually a title.
 *
 * @param title - the record's title.
 * @param prompt - the question asked.
 * @returns whether the title should be shown separately.
 */
export function titleAddsContext(title: string, prompt: string): boolean {
  if (title === '' || prompt === '') return title !== ''
  const normalize = (value: string): string => value
    .replace(/[\s，。！？、,.!?…—:：;；"'“”‘’()（）\[\]]/gu, '')
    .toLowerCase()
  const left = normalize(title)
  const right = normalize(prompt)
  if (left === '' || right === '') return false
  return !(right.startsWith(left) || left.startsWith(right))
}

/** Whether a record's session is the one on screen. */
export function isCurrent(record: CompletionRecord, currentSessionId: string | undefined): boolean {
  return currentSessionId !== undefined && record.sessionId === currentSessionId
}

/** Sort running tasks newest first, tolerating a host that already did. */
export function runningTasks<T extends { readonly startedAt: number }>(tasks: readonly T[]): readonly T[] {
  return [...tasks].sort((a, b) => b.startedAt - a.startedAt)
}

/** Whether a timestamp falls on the same local day as now. */
export { sameDay }
