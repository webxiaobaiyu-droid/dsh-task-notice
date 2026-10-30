/**
 * The optional system-notification layer.
 *
 * The in-window cards are the primary surface; a system notification exists for
 * the one case cards cannot cover — the window is behind another application.
 * It is off by default because it is the only surface that leaves this window.
 *
 * The notification is deliberately silent: the chime already plays from the page,
 * and two sounds for one event is worse than none. Clicking it focuses the
 * window and opens the finished session, the same action as clicking its card.
 *
 * @module dsh-task-notice/client/notify
 */

/** What the browser says about permission. */
export type SystemPermission = 'granted' | 'denied' | 'default' | 'unsupported'

/** Read the current permission without prompting. */
export function systemPermission(): SystemPermission {
  if (typeof window === 'undefined' || typeof window.Notification !== 'function') return 'unsupported'
  switch (window.Notification.permission) {
    case 'granted': return 'granted'
    case 'denied': return 'denied'
    default: return 'default'
  }
}

/**
 * Ask for permission. Must be called from a user gesture.
 * @returns whether notifications may be shown afterwards.
 */
export async function requestSystemPermission(): Promise<boolean> {
  if (systemPermission() === 'unsupported') return false
  if (window.Notification.permission === 'granted') return true
  if (window.Notification.permission === 'denied') return false
  try {
    const permission = await window.Notification.requestPermission()
    return permission === 'granted'
  } catch {
    return false
  }
}

/** One notification's words, decided by the component. */
export interface SystemNotice {
  /** First line, usually project and outcome. */
  readonly title: string
  /** Second and third lines: session title and question. */
  readonly body: string
  /** Stable tag so a repeated turn replaces rather than stacks. */
  readonly tag: string
  /** Invoked when the notification is clicked. */
  readonly onClick: () => void
}

/**
 * Show one system notification if permitted.
 * @param notice - the words and the click action.
 * @returns whether one was shown.
 */
export function showSystemNotice(notice: SystemNotice): boolean {
  if (systemPermission() !== 'granted') return false
  try {
    const notification = new window.Notification(notice.title, {
      body: notice.body,
      tag: notice.tag,
      silent: true,
      requireInteraction: false,
    })
    notification.onclick = () => {
      window.focus()
      notice.onClick()
      notification.close()
    }
    return true
  } catch {
    return false
  }
}
