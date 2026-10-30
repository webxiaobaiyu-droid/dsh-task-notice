/**
 * Task completion notice, browser half: where the widget sits and how it
 * reaches the rest of the page.
 *
 * One cell in the frame-wide overlay, because the whole point is that it is
 * present whichever project or panel is open. The cell carries the dock, the
 * ledger, the settings and the completion cards; see `NoticeWidget` for why
 * those four are one component.
 *
 * The browser half owns three things the Host cannot: this browser's
 * preferences, the audio context (which must be created from a user gesture),
 * and the one navigation action that opens a finished session.
 *
 * @module dsh-task-notice/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the SlotMap and locale namespace merges this plugin uses.
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { en, zh, type TaskNoticeLocaleKey } from './locales.ts'
import { NoticeWidget, type NoticeWidgetInjected } from './NoticeWidget.tsx'
import { createEnteredStore, createSeenStore, createSettingsStore } from './settings.ts'
import { disposeAudio, unlockAudio } from './sound.ts'
import { createNoticeStore } from './state.ts'
import { STYLE_ID, styles } from './styles.ts'

export type { NoticeWidgetInjected, NoticeWidgetProps } from './NoticeWidget.tsx'
export type { TaskNoticeLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Completion notice copy. */
    'taskNotice': TaskNoticeLocaleKey
  }
}

/** Dictionary namespace owned by this widget. */
export const NS = 'taskNotice'

/**
 * Services required by the slot registration and the navigation action.
 *
 * `sessions` is read but not injected: the widget has to keep working in a
 * deployment without the session list, where it simply cannot tell which
 * conversation is on screen and therefore errs on the side of telling.
 */
export const inject = ['slots', 'locale', 'layout']

/** One session as the session list publishes it. */
interface SessionSnapshotRow {
  readonly retainedBy: Readonly<Record<string, number>>
}

/** The session list service, when this deployment has one. */
interface SessionList {
  readonly list: {
    getSnapshot(): { readonly byId: Readonly<Record<string, SessionSnapshotRow>> }
  }
}

/** Read the session service without declaring a dependency on it. */
function sessionsOf(ctx: ClientContext): SessionList | undefined {
  const candidate = ctx.get('sessions') as SessionList | undefined
  return candidate !== undefined && typeof candidate.list?.getSnapshot === 'function'
    ? candidate
    : undefined
}

/**
 * The session currently open in the centre column.
 *
 * The product's own derivation: the main column retains exactly one session,
 * and that is the one a composer would be bound to. There is no selected-session
 * field to read, so the retention count is the contract first-party callers use
 * too.
 *
 * @param ctx - client context.
 * @returns the open session's id, or `undefined` when none is bound.
 */
function currentSessionId(ctx: ClientContext): string | undefined {
  const sessions = sessionsOf(ctx)
  if (sessions === undefined) return undefined
  return Object.entries(sessions.list.getSnapshot().byId)
    .find(([, row]) => (row.retainedBy['mainView'] ?? 0) > 0)?.[0]
}

/** Whether the client still lists a session. */
function sessionExists(ctx: ClientContext, sessionId: string): boolean {
  const sessions = sessionsOf(ctx)
  if (sessions === undefined) return true
  return sessions.list.getSnapshot().byId[sessionId] !== undefined
}

/**
 * Bring a finished session back on screen.
 * @param ctx - client context.
 * @param sessionId - the session to open.
 * @returns whether the session was opened.
 */
function openSession(ctx: ClientContext, sessionId: string): boolean {
  if (!sessionExists(ctx, sessionId)) return false
  const workspace = ctx.get('uiWorkspace') as { openSession?: (id: string) => void } | undefined
  if (workspace?.openSession === undefined) return false
  try {
    workspace.openSession(sessionId)
  } catch {
    return false
  }
  // A plugin panel may be covering the centre column; opening a session from
  // the notice should land on the conversation, not behind the panel.
  ctx.layout.selectPanel(null)
  return true
}

/**
 * Inject this plugin's stylesheet once.
 *
 * A plugin served outside the product's build has to carry and inject its own
 * sheet; the tag is keyed so a reload replaces rather than accumulates.
 *
 * @returns the disposer that removes the tag this call installed.
 */
function injectStyles(): () => void {
  const existing = document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`)
  if (existing !== null) return () => {}
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-task-notice'
  tag.dataset.pluginCss = STYLE_ID
  tag.textContent = styles
  document.head.appendChild(tag)
  return () => {
    tag.remove()
  }
}

/**
 * Contribute the completion dock to the frame-wide overlay.
 * @param ctx - Client plugin context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-task-notice: dictionaries')
  ctx.effect(() => injectStyles(), 'dsh-task-notice: stylesheet')

  const store = createNoticeStore()
  ctx.effect(() => store.start(), 'dsh-task-notice: feed')

  const settings = createSettingsStore()
  const seen = createSeenStore()
  const entered = createEnteredStore()
  const face: NoticeWidgetInjected = {
    store,
    settings,
    seen,
    entered,
    currentSessionId: () => currentSessionId(ctx),
    openSession: sessionId => openSession(ctx, sessionId),
  }

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'task-notice.widget',
    order: 40,
    locale: NS,
    inject: () => face,
  }, NoticeWidget))

  // Browsers only start audio from a gesture. Listening once on the document
  // means the first click anywhere — opening a project, sending a message —
  // is enough to arm the chime for the rest of the page's life.
  ctx.effect(() => {
    const unlock = (): void => { unlockAudio() }
    document.addEventListener('pointerdown', unlock, { capture: true })
    document.addEventListener('keydown', unlock, { capture: true })
    return () => {
      document.removeEventListener('pointerdown', unlock, { capture: true })
      document.removeEventListener('keydown', unlock, { capture: true })
      disposeAudio()
    }
  }, 'dsh-task-notice: audio unlock')
}
