/**
 * The long-poll store behind every surface.
 *
 * One loop serves the dock, the badge, the list and the cards, because they are
 * four readings of one snapshot and four loops would be four chances to disagree
 * about what just finished.
 *
 * The poll is a long-poll rather than a timer for a practical reason: a hidden
 * browser tab throttles its timers to about once a minute, and a notice that
 * arrives a minute late is a notice that arrives after the person has switched
 * away — exactly the case this plugin exists for. A request the Host holds open
 * resolves as an ordinary network callback, which background tabs do not
 * throttle.
 *
 * @module dsh-task-notice/client/state
 */

import { MAX_WAIT_MS, type CompletionRecord, type NoticeSnapshot, type PendingDecision } from '../types.ts'
import { clearHistory, fetchSnapshot } from './api.ts'
import { highestSeq, newRecords } from './model.ts'

/** What the widget can render from. */
export interface NoticeState {
  /** `loading` before the first answer, `error` while the feed is down. */
  readonly status: 'loading' | 'ready' | 'error'
  /** Latest snapshot, when one has arrived. */
  readonly snapshot: NoticeSnapshot | undefined
  /** One line describing the last failure. */
  readonly error: string | undefined
}

/** Longest a single poll may stay on the wire before the client gives up. */
const REQUEST_TIMEOUT_MS = MAX_WAIT_MS + 15_000

/** How long to wait after a failed poll. */
const RETRY_MS = 1_500

/** One live feed. */
export class NoticeStore {
  private state: NoticeState = { status: 'loading', snapshot: undefined, error: undefined }
  private readonly listeners = new Set<() => void>()
  private readonly completions = new Set<(records: readonly CompletionRecord[]) => void>()
  private readonly decisions = new Set<(decisions: readonly PendingDecision[]) => void>()
  private decisionIds = new Set<string>()
  private controller: AbortController | undefined
  private lastSeq = -1
  private revision = 0
  private bootId: string | undefined

  /** Stable reader for `useSyncExternalStore`. */
  readonly getState = (): NoticeState => this.state

  /** Subscribe to snapshot changes. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Subscribe to turns that finished after the first snapshot.
   * @param listener - receives new records in completion order.
   * @returns the unsubscriber.
   */
  onCompletions(listener: (records: readonly CompletionRecord[]) => void): () => void {
    this.completions.add(listener)
    return () => {
      this.completions.delete(listener)
    }
  }

  /**
   * Subscribe to questions that newly became pending.
   * @param listener - receives decisions not present in the previous snapshot.
   * @returns the unsubscriber.
   */
  onDecisions(listener: (decisions: readonly PendingDecision[]) => void): () => void {
    this.decisions.add(listener)
    return () => {
      this.decisions.delete(listener)
    }
  }

  /** Start the loop. Safe to call once per plugin activation. */
  start(): () => void {
    if (this.controller !== undefined) return () => {}
    const controller = new AbortController()
    this.controller = controller
    void this.loop(controller.signal)
    return () => {
      controller.abort()
      if (this.controller === controller) this.controller = undefined
    }
  }

  /** Clear the Host history and refresh immediately. */
  async clear(): Promise<void> {
    await clearHistory()
    this.lastSeq = -1
    this.revision = 0
    this.controller?.abort()
    this.controller = undefined
    this.start()
  }

  /** Replace the rendered state and notify React. */
  private publish(next: NoticeState): void {
    this.state = next
    for (const listener of [...this.listeners]) listener()
  }

  /** Fold one snapshot into state, emitting only genuinely new records. */
  private apply(snapshot: NoticeSnapshot): void {
    const restarted = this.bootId !== undefined && this.bootId !== snapshot.bootId
    const first = this.lastSeq < 0 || restarted
    const fresh = first ? [] : newRecords(snapshot.records, this.lastSeq)
    const decisionList = snapshot.decisions ?? []
    const freshDecisions = first ? [] : decisionList.filter(item => !this.decisionIds.has(item.id))
    this.decisionIds = new Set(decisionList.map(item => item.id))
    this.bootId = snapshot.bootId
    // A new Host process starts its sequence at the persisted high-water mark,
    // which can be below this page's cursor if that history was cleared. Taking
    // the maximum across the restart would suppress every record until the new
    // process caught up; a restart rebases the cursor instead.
    this.lastSeq = restarted ? highestSeq(snapshot.records) : Math.max(this.lastSeq, highestSeq(snapshot.records))
    this.revision = snapshot.revision
    this.publish({ status: 'ready', snapshot, error: undefined })
    if (fresh.length > 0) {
      for (const listener of [...this.completions]) listener(fresh)
    }
    if (freshDecisions.length > 0) {
      for (const listener of [...this.decisions]) listener(freshDecisions)
    }
  }

  /** Poll forever, backing off between failures. */
  private async loop(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      const request = new AbortController()
      const stop = (): void => {
        request.abort()
      }
      signal.addEventListener('abort', stop, { once: true })
      const timer = setTimeout(stop, REQUEST_TIMEOUT_MS)
      try {
        const snapshot = await fetchSnapshot(this.revision, MAX_WAIT_MS, request.signal)
        this.apply(snapshot)
      } catch (error: unknown) {
        if (signal.aborted) break
        const message = error instanceof Error ? error.message : String(error)
        this.publish({
          status: 'error',
          snapshot: this.state.snapshot,
          error: message,
        })
        await new Promise<void>((resolve) => {
          const handle = setTimeout(resolve, RETRY_MS)
          signal.addEventListener('abort', () => {
            clearTimeout(handle)
            resolve()
          }, { once: true })
        })
      } finally {
        clearTimeout(timer)
        signal.removeEventListener('abort', stop)
      }
    }
  }
}

/** Build the one store this plugin uses. */
export function createNoticeStore(): NoticeStore {
  return new NoticeStore()
}
