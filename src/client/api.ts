/**
 * The browser half's side of the Host contract.
 *
 * One module owns the two routes so the paths, the long-poll parameters and the
 * failure shape are stated once. The Host answers a described failure as
 * `{"error": "..."}`; everything else is surfaced with its status so the dock
 * can say something true instead of showing an empty list.
 *
 * @module dsh-task-notice/client/api
 */

import { CLEAR_PATH, STATE_PATH, type NoticeSnapshot } from '../types.ts'

/** A request that failed, carrying the Host's own words when it had any. */
export class HostError extends Error {
  /** HTTP status, when the failure had one. */
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'HostError'
  }
}

/** Read a JSON response or describe its failure. */
async function readBody<T>(response: Response): Promise<T> {
  if (response.ok) return await response.json() as T
  let detail = ''
  try {
    const body: unknown = await response.json()
    if (typeof body === 'object' && body !== null) {
      const message = (body as { error?: unknown }).error
      if (typeof message === 'string') detail = message
    }
  } catch {
    detail = ''
  }
  throw new HostError(detail.length > 0 ? detail : `HTTP ${String(response.status)}`, response.status)
}

/**
 * Ask for the current snapshot, optionally holding the request open.
 * @param since - revision the browser already has.
 * @param waitMs - how long the Host may hold the request.
 * @param signal - aborts the poll.
 * @returns the snapshot.
 */
export async function fetchSnapshot(since: number, waitMs: number, signal: AbortSignal): Promise<NoticeSnapshot> {
  const url = new URL(STATE_PATH, window.location.origin)
  url.searchParams.set('since', String(since))
  url.searchParams.set('wait', String(waitMs))
  const response = await fetch(url, { credentials: 'include', signal })
  return await readBody<NoticeSnapshot>(response)
}

/** Clear the finished-turn history on the Host. */
export async function clearHistory(): Promise<void> {
  const response = await fetch(new URL(CLEAR_PATH, window.location.origin), {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
  await readBody<{ ok: boolean }>(response)
}
