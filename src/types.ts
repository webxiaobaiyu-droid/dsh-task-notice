/**
 * The wire contract between the Host half and the browser half.
 *
 * Everything here is plain JSON: it crosses the Fetch carrier, is compared in
 * tests, and is written to disk as the plugin's own small history file. No
 * service types, no DOM types, no Node types.
 *
 * @module dsh-task-notice/types
 */

/** How one turn ended, reduced to the four cases a notice distinguishes. */
export type NoticeStatus = 'done' | 'failed' | 'stopped' | 'blocked'

/** One finished turn, as the widget lists it. */
export interface CompletionRecord {
  /** Stable per turn: session id + turn number. */
  readonly id: string
  /** Monotonic across records, used by the browser to tell new from old. */
  readonly seq: number
  /** Session that finished. */
  readonly sessionId: string
  /** Turn number inside that session. */
  readonly turn: number
  /** Latest known session title, or the first line of the prompt when none exists. */
  readonly title: string
  /** What the person asked, whitespace-collapsed and bounded. */
  readonly prompt: string
  /** Display name of the project: the working directory's basename. */
  readonly project: string
  /** Absolute project directory, when the session recorded one. */
  readonly cwd?: string
  /** How the turn ended. */
  readonly status: NoticeStatus
  /** Provider or cancellation words when the turn did not simply complete. */
  readonly detail?: string
  /** When the turn opened; equals `endedAt` when the host missed its start. */
  readonly startedAt: number
  /** When the turn closed. */
  readonly endedAt: number
  /** Wall-clock length of the turn. */
  readonly durationMs: number
  /** Whether a subagent ran this session rather than a person. */
  readonly subagent: boolean
}

/** One session working right now. */
export interface RunningTask {
  /** Session doing the work. */
  readonly sessionId: string
  /** Turn number in progress. */
  readonly turn: number
  /** Latest known title, or the first line of the prompt. */
  readonly title: string
  /** What was asked. */
  readonly prompt: string
  /** Project display name. */
  readonly project: string
  /** Absolute project directory, when recorded. */
  readonly cwd?: string
  /** When the turn opened. */
  readonly startedAt: number
}

/** Everything one poll returns. */
export interface NoticeSnapshot {
  /** Changes on every Host restart; a stale browser cursor resets against it. */
  readonly bootId: string
  /** Bumped whenever any record or running task changes. */
  readonly revision: number
  /** Newest first. */
  readonly records: readonly CompletionRecord[]
  /** Sessions working right now, newest turn first. */
  readonly running: readonly RunningTask[]
  /** Host clock when the snapshot was taken. */
  readonly now: number
}

/** Host configuration, all optional because every field has a default. */
export interface NoticeConfig {
  /** How many finished turns the host keeps and persists. @default 100 */
  readonly maxRecords?: number
  /** Whether subagent sessions are recorded too. @default false */
  readonly includeSubagents?: boolean
  /** Whether the history survives a Host restart. @default true */
  readonly persist?: boolean
}

/** Path the browser long-polls for the current snapshot. */
export const STATE_PATH = '/api/dsh-task-notice/state'

/** Path that clears the finished-turn history. */
export const CLEAR_PATH = '/api/dsh-task-notice/clear'

/** Longest single long-poll wait the host allows, in milliseconds. */
export const MAX_WAIT_MS = 25_000

/** Version tag inside the persisted history file. */
export const HISTORY_VERSION = 1

/** The persisted history file's shape. */
export interface PersistedHistory {
  readonly version: typeof HISTORY_VERSION
  readonly savedAt: number
  readonly records: readonly CompletionRecord[]
}
