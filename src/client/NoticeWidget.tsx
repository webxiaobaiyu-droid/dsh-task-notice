/**
 * The one global surface: a dock, its ledger, its settings, and the cards that
 * arrive when something finishes.
 *
 * All four are one cell rather than four because they share one piece of state —
 * what the person has already seen. A separate badge cell and list cell would
 * each have to guess at the other's watermark, and the two guesses would
 * eventually disagree.
 *
 * The component owns presentation and the alert decision; the Host owns the
 * facts, and `state.ts` owns the feed. Everything that can be decided without a
 * DOM lives in `model.ts` so it can be tested.
 *
 * @module dsh-task-notice/client/NoticeWidget
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { CompletionRecord } from '../types.ts'
import { BackIcon, BellIcon, BlockedIcon, CheckIcon, CloseIcon, CrossIcon, GearIcon, StopIcon } from './icons.tsx'
import { clip, durationParts, formatClock } from './format.ts'
import { dayTitle, groupByDay, shouldAlert, titleAddsContext, unreadRecords, visibleRecords } from './model.ts'
import { requestSystemPermission, showSystemNotice, systemPermission } from './notify.ts'
import {
  clearPosition,
  clampPosition,
  defaultPosition,
  placePopover,
  readPosition,
  savePosition,
  type ViewportSize,
  type WidgetPosition,
} from './position.ts'
import type { EnteredStore, SeenStore, SettingsStore } from './settings.ts'
import { playChime, soundSupported, testChime, unlockAudio } from './sound.ts'
import type { NoticeStore } from './state.ts'

/** Registration-side face the widget reads and acts through. */
export interface NoticeWidgetInjected {
  /** The shared long-poll feed. */
  readonly store: NoticeStore
  /** Browser-local preferences. */
  readonly settings: SettingsStore
  /** Last-look watermark. */
  readonly seen: SeenStore
  /** Notices already entered; these stay out of the ledger and badge. */
  readonly entered: EnteredStore
  /** The session bound to the centre column, read at event time. */
  readonly currentSessionId: () => string | undefined
  /** Open a finished session; false when it no longer exists. */
  readonly openSession: (sessionId: string) => boolean
}

/** Full component props assembled by the overlay renderer. */
export type NoticeWidgetProps =
  PropsRuntime<'shell.overlay'>
  & PropsLocale<'taskNotice'>
  & InjectFace<NoticeWidgetInjected>

/** How long a completion card stays before it folds back into the ledger. */
const CARD_HOLD_MS = 9_000

/** How long the "clear" button stays armed. */
const CLEAR_ARM_MS = 3_000

/** Most cards on screen at once; the rest are already in the ledger. */
const MAX_CARDS = 3

/** Pixels the pointer must travel before a press becomes a drag instead of a click. */
const DRAG_THRESHOLD = 4

/** Arrow-key nudge, and the larger step with Shift held. */
const KEYBOARD_STEP = 8
const KEYBOARD_STEP_LARGE = 32

/** One transient sentence inside the panel. */
interface InlineNote {
  readonly text: string
  readonly tone: 'info' | 'error'
}

/** The pointer press currently deciding between a click and a drag. */
interface DragSession {
  readonly pointerId: number
  readonly startX: number
  readonly startY: number
  readonly startRight: number
  readonly startTop: number
  latest: WidgetPosition
  moved: boolean
}

/** The current viewport, read only in the browser. */
function currentViewport(): ViewportSize {
  if (typeof window === 'undefined') return { width: 1280, height: 800 }
  return { width: window.innerWidth, height: window.innerHeight }
}

/**
 * The global completion widget.
 * @param props - slot props, locale seat, and the injected face.
 */
export function NoticeWidget(props: NoticeWidgetProps): ReactNode {
  const { t, store, settings, seen, entered, currentSessionId, openSession } = props
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
  const prefs = useSyncExternalStore(settings.subscribe, settings.get, settings.get)
  const seenAt = useSyncExternalStore(seen.subscribe, seen.get, seen.get)
  const enteredIds = useSyncExternalStore(entered.subscribe, entered.get, entered.get)

  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'list' | 'settings'>('list')
  const [cards, setCards] = useState<readonly CompletionRecord[]>([])
  const [fresh, setFresh] = useState(false)
  const [clearArmed, setClearArmed] = useState(false)
  const [note, setNote] = useState<InlineNote | undefined>(undefined)
  const [viewport, setViewport] = useState<ViewportSize>(currentViewport)
  const [position, setPosition] = useState<WidgetPosition | undefined>(() => {
    const stored = readPosition()
    return stored === undefined ? undefined : clampPosition(stored, currentViewport())
  })
  const [dragging, setDragging] = useState(false)

  const rootRef = useRef<HTMLDivElement | null>(null)
  const openRef = useRef(open)
  const prefsRef = useRef(prefs)
  const tRef = useRef(t)
  const dragRef = useRef<DragSession | null>(null)
  const suppressClickRef = useRef(false)
  const viewportRef = useRef(viewport)
  openRef.current = open
  prefsRef.current = prefs
  tRef.current = t
  viewportRef.current = viewport

  const placed = position ?? defaultPosition(viewport.width)
  const layout = placePopover(placed, viewport)

  const records = state.snapshot?.records ?? []
  const running = state.snapshot?.running ?? []
  const now = state.snapshot?.now ?? Date.now()
  const visible = useMemo(() => visibleRecords(records, enteredIds), [records, enteredIds])
  const unread = unreadRecords(visible, seenAt)
  const groups = useMemo(() => groupByDay(visible, now), [visible, now])

  const openRecord = useCallback((record: CompletionRecord): void => {
    if (!openSession(record.sessionId)) {
      setOpen(true)
      setView('list')
      setNote({ text: tRef.current('gone'), tone: 'error' })
      return
    }
    // A notice that has brought the person back to its session has done its
    // job. Remember that before the panel closes so it stays gone next time.
    entered.add(record.id)
    setCards(previous => previous.filter(item => item.id !== record.id))
    setOpen(false)
  }, [entered, openSession])

  /** Track the viewport so a dragged dock never strands its panel off-screen. */
  useEffect(() => {
    const onResize = (): void => { setViewport(currentViewport()) }
    window.addEventListener('resize', onResize)
    window.visualViewport?.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.visualViewport?.removeEventListener('resize', onResize)
    }
  }, [])

  /** Re-clamp an existing position after the window shrinks. */
  useEffect(() => {
    setPosition((current) => {
      if (current === undefined) return current
      const next = clampPosition(current, viewport)
      return next.right === current.right && next.top === current.top ? current : next
    })
  }, [viewport])

  /**
   * A press on the dock, the panel head, or a card becomes a drag only after
   * the pointer clears a small threshold; below it the press stays a click.
   * The listeners live on the window so a fast drag keeps tracking outside
   * the widget and does not need pointer capture, which would eat the click.
   */
  useEffect(() => {
    const move = (event: PointerEvent): void => {
      const session = dragRef.current
      if (session === null || event.pointerId !== session.pointerId) return
      const dx = event.clientX - session.startX
      const dy = event.clientY - session.startY
      if (!session.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      if (!session.moved) {
        session.moved = true
        setDragging(true)
      }
      if (event.cancelable) event.preventDefault()
      const next = clampPosition({
        right: session.startRight - dx,
        top: session.startTop + dy,
      }, viewportRef.current)
      session.latest = next
      setPosition(next)
    }
    const end = (event: PointerEvent): void => {
      const session = dragRef.current
      if (session === null || event.pointerId !== session.pointerId) return
      dragRef.current = null
      if (!session.moved) return
      setDragging(false)
      savePosition(session.latest)
      // The click that follows this pointerup belongs to the drag, not to the
      // dock's toggle or the card's "open session".
      suppressClickRef.current = true
      window.setTimeout(() => { suppressClickRef.current = false }, 0)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [])

  const startDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || !event.isPrimary) return
    const target = event.target
    if (!(target instanceof Element)) return
    const handle = target.closest<HTMLElement>('[data-drag-handle]')
    if (handle === null) return
    // A button inside the header keeps its own click; only the head itself drags.
    if (handle.dataset.dragHandle === 'panel'
      && target.closest('button, input, select, textarea, a') !== null) return
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startRight: placed.right,
      startTop: placed.top,
      latest: placed,
      moved: false,
    }
  }, [placed.right, placed.top])

  const guardClick = useCallback((event: ReactMouseEvent<HTMLDivElement>): void => {
    if (!suppressClickRef.current) return
    suppressClickRef.current = false
    event.preventDefault()
    event.stopPropagation()
  }, [])

  const moveWithKeyboard = useCallback((event: ReactKeyboardEvent<HTMLButtonElement>): void => {
    const step = event.shiftKey ? KEYBOARD_STEP_LARGE : KEYBOARD_STEP
    let dx = 0
    let dy = 0
    switch (event.key) {
      case 'ArrowLeft': dx = -step; break
      case 'ArrowRight': dx = step; break
      case 'ArrowUp': dy = -step; break
      case 'ArrowDown': dy = step; break
      default: return
    }
    event.preventDefault()
    const next = clampPosition({ right: placed.right - dx, top: placed.top + dy }, viewport)
    if (next.right === placed.right && next.top === placed.top) return
    setPosition(next)
    savePosition(next)
  }, [placed.right, placed.top, viewport])

  const resetPosition = useCallback((): void => {
    clearPosition()
    setPosition(undefined)
  }, [])

  /** A finished turn arrived: decide whether it may interrupt, then tell. */
  useEffect(() => store.onCompletions((arrived) => {
    const policy = {
      always: prefsRef.current.always,
      currentSessionId: currentSessionId(),
      background: document.hidden || !document.hasFocus(),
    }
    const wanted = arrived.filter(record => shouldAlert(record, policy))
    if (wanted.length === 0) return
    const current = tRef.current
    const tone = wanted.every(record => record.status !== 'done') ? 'failed' as const : 'done' as const
    if (prefsRef.current.sound) playChime(tone, prefsRef.current.volume)
    if (prefsRef.current.system && document.hidden) {
      for (const record of wanted) {
        showSystemNotice({
          title: current(record.status === 'done' ? 'systemTitleDone' : 'systemTitleFailed', {
            project: record.project === '' ? current('unknownProject') : record.project,
          }),
          body: current('systemBody', {
            title: record.title === '' ? current('untitled') : record.title,
            prompt: record.prompt,
          }),
          tag: record.id,
          onClick: () => {
            openRecord(record)
          },
        })
      }
    }
    if (!openRef.current) {
      setCards(previous => [...wanted.slice(-MAX_CARDS).reverse(), ...previous].slice(0, MAX_CARDS))
    }
    setFresh(true)
    window.setTimeout(() => { setFresh(false) }, 700)
  }), [store, currentSessionId, openRecord])

  /** Looking at the ledger counts as reading it, including while it is open. */
  useEffect(() => {
    if (!open || view !== 'list') return
    seen.set(Date.now())
  }, [open, view, seen, records.length])

  /** Escape and an outside press close the panel. */
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    const onPointer = (event: PointerEvent): void => {
      if (rootRef.current?.contains(event.target as Node) === true) return
      setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer, true)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer, true)
    }
  }, [open])

  /** Disarm "clear" and clear the transient note after a while. */
  useEffect(() => {
    if (!clearArmed) return
    const handle = window.setTimeout(() => { setClearArmed(false) }, CLEAR_ARM_MS)
    return () => { window.clearTimeout(handle) }
  }, [clearArmed])

  useEffect(() => {
    if (note === undefined) return
    const handle = window.setTimeout(() => { setNote(undefined) }, 5_000)
    return () => { window.clearTimeout(handle) }
  }, [note])

  const dismiss = useCallback((id: string): void => {
    setCards(previous => previous.filter(record => record.id !== id))
  }, [])

  const toggle = useCallback((): void => {
    setOpen(current => {
      if (!current) {
        setView('list')
        setCards([])
      }
      return !current
    })
  }, [])

  const markAllRead = useCallback((): void => {
    seen.set(Date.now())
  }, [seen])

  const clear = useCallback((): void => {
    if (!clearArmed) {
      setClearArmed(true)
      return
    }
    setClearArmed(false)
    void store.clear().then(() => {
      entered.clear()
    }).catch((error: unknown) => {
      setNote({ text: error instanceof Error ? error.message : String(error), tone: 'error' })
    })
  }, [clearArmed, entered, store])

  const grantSystem = useCallback(async (next: boolean): Promise<void> => {
    if (!next) {
      settings.set({ system: false })
      return
    }
    const granted = await requestSystemPermission()
    if (!granted) {
      settings.set({ system: false })
      setNote({
        text: tRef.current(systemPermission() === 'unsupported' ? 'systemUnsupported' : 'systemDenied'),
        tone: 'error',
      })
      return
    }
    settings.set({ system: true })
  }, [settings])

  const trySound = useCallback((): void => {
    unlockAudio()
    if (!soundSupported() || !testChime(prefsRef.current.volume)) {
      setNote({ text: tRef.current('soundBlocked'), tone: 'error' })
    }
  }, [])

  return (
    <div
      className="dtn-root"
      ref={rootRef}
      data-dragging={dragging ? 'true' : 'false'}
      data-flip={layout.side === 'above' ? 'true' : 'false'}
      data-halign={layout.align}
      style={{ insetBlockStart: `${placed.top}px`, insetInlineEnd: `${placed.right}px` }}
      onPointerDown={startDrag}
      onClickCapture={guardClick}
    >
      <button
        type="button"
        className="dtn-dock"
        data-open={open ? 'true' : 'false'}
        data-fresh={fresh ? 'true' : 'false'}
        data-drag-handle="dock"
        aria-expanded={open}
        aria-label={t('dock')}
        title={t('dockHint')}
        onClick={toggle}
        onKeyDown={moveWithKeyboard}
      >
        <span className="dtn-dockIcon"><BellIcon size={19} /></span>
        {unread.length > 0 ? (
          <span className="dtn-badge">{unread.length > 99 ? '99+' : unread.length}</span>
        ) : null}
        {running.length > 0 ? <span className="dtn-live" aria-hidden="true" /> : null}
      </button>
      {open ? (
        <section
          className="dtn-panel"
          role="dialog"
          aria-label={t('title')}
          style={{ maxBlockSize: `${layout.maxHeight}px` }}
        >
          <header className="dtn-head" data-drag-handle="panel" title={t('dragHint')}>
            {view === 'settings' ? (
              <button
                type="button"
                className="dtn-iconBtn"
                aria-label={t('back')}
                onClick={() => { setView('list') }}
              >
                <BackIcon />
              </button>
            ) : null}
            <div className="dtn-headText">
              <h2 className="dtn-title">{view === 'settings' ? t('settingsTitle') : t('title')}</h2>
              <p className="dtn-sub" data-tone={view === 'list' && unread.length > 0 ? 'unread' : 'normal'}>
                {view === 'settings'
                  ? t('settingsSub')
                  : unread.length > 0
                    ? unread.length === 1 ? t('unreadOne') : t('unread', { count: unread.length })
                    : t('subtitle')}
              </p>
            </div>
            {view === 'list' && unread.length > 0 ? (
              <button type="button" className="dtn-markRead" onClick={markAllRead}>{t('markAllRead')}</button>
            ) : null}
            {view === 'list' ? (
              <div className="dtn-actions">
                <button
                  type="button"
                  className="dtn-iconBtn"
                  aria-label={t('settings')}
                  onClick={() => { setView('settings') }}
                >
                  <GearIcon />
                </button>
                <button
                  type="button"
                  className="dtn-iconBtn"
                  aria-label={t('close')}
                  onClick={() => { setOpen(false) }}
                >
                  <CloseIcon />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="dtn-iconBtn"
                aria-label={t('close')}
                onClick={() => { setOpen(false) }}
              >
                <CloseIcon />
              </button>
            )}
          </header>

          {view === 'settings' ? (
            <div className="dtn-settings">
              <div className="dtn-setting">
                <div className="dtn-settingText">
                  <div className="dtn-settingLabel">{t('sound')}</div>
                  <div className="dtn-settingHint">{t('soundHint')}</div>
                  <div className="dtn-volume">
                    <input
                      className="dtn-range"
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={Math.round(prefs.volume * 100)}
                      aria-label={t('volume')}
                      onChange={(event) => { settings.set({ volume: Number(event.target.value) / 100 }) }}
                    />
                    <button type="button" className="dtn-testBtn" onClick={trySound}>{t('test')}</button>
                  </div>
                </div>
                <Toggle
                  checked={prefs.sound}
                  label={t('sound')}
                  onChange={(next) => { settings.set({ sound: next }) }}
                />
              </div>

              <div className="dtn-setting">
                <div className="dtn-settingText">
                  <div className="dtn-settingLabel">{t('system')}</div>
                  <div className="dtn-settingHint">{t('systemHint')}</div>
                </div>
                <Toggle
                  checked={prefs.system}
                  label={t('system')}
                  onChange={(next) => { void grantSystem(next) }}
                />
              </div>

              <div className="dtn-setting">
                <div className="dtn-settingText">
                  <div className="dtn-settingLabel">{t('always')}</div>
                  <div className="dtn-settingHint">{t('alwaysHint')}</div>
                </div>
                <Toggle
                  checked={prefs.always}
                  label={t('always')}
                  onChange={(next) => { settings.set({ always: next }) }}
                />
              </div>

              <div className="dtn-setting">
                <div className="dtn-settingText">
                  <div className="dtn-settingLabel">{t('position')}</div>
                  <div className="dtn-settingHint">{t('positionHint')}</div>
                </div>
                <button
                  type="button"
                  className="dtn-testBtn"
                  disabled={position === undefined}
                  onClick={resetPosition}
                >
                  {t('resetPosition')}
                </button>
              </div>

              {note !== undefined ? (
                <div className="dtn-inlineNote" data-tone={note.tone}>{note.text}</div>
              ) : null}
            </div>
          ) : (
            <>
              {state.status === 'error' ? (
                <div className="dtn-error">{state.error ?? ''}</div>
              ) : null}
              {note !== undefined ? (
                <div className="dtn-inlineNote" data-tone={note.tone}>{note.text}</div>
              ) : null}
              {running.length > 0 ? <RunningStrip label={runningLabel(running.length, t)} /> : null}
              <div className="dtn-list">
                {groups.length === 0 ? (
                  <div className="dtn-empty">
                    <div className="dtn-emptyIcon"><BellIcon size={21} /></div>
                    <p className="dtn-emptyTitle">{t(records.length === 0 ? 'emptyTitle' : 'emptyEnteredTitle')}</p>
                    <p className="dtn-emptyBody">{t(records.length === 0 ? 'emptyBody' : 'emptyEnteredBody')}</p>
                  </div>
                ) : groups.map(group => (
                  <section key={group.key}>
                    <div className="dtn-day">{dayLabel(group.label, group.key, t)}</div>
                    {group.records.map(record => (
                      <RecordRow
                        key={record.id}
                        record={record}
                        t={t}
                        unread={record.endedAt > seenAt}
                        onOpen={() => { openRecord(record) }}
                      />
                    ))}
                  </section>
                ))}
              </div>
              {records.length > 0 ? (
                <footer className="dtn-foot">
                  <span className="dtn-footNote">
                    {visible.length === 0 ? t('allEntered') : t('recent', { count: visible.length })}
                  </span>
                  <button
                    type="button"
                    className="dtn-linkBtn"
                    data-danger={clearArmed ? 'true' : 'false'}
                    title={t('clearHint')}
                    onClick={clear}
                  >
                    {clearArmed ? t('clearConfirm') : t('clear')}
                  </button>
                </footer>
              ) : null}
            </>
          )}
        </section>
      ) : cards.length > 0 ? (
        <div className="dtn-cards">
          {cards.map(record => (
            <CompletionCard
              key={record.id}
              record={record}
              t={t}
              dragging={dragging}
              onOpen={() => { openRecord(record) }}
              onDismiss={dismiss}
            />
          ))}
        </div>
      ) : null}

    </div>
  )
}

/** The running-session count as one sentence. */
function runningLabel(count: number, t: NoticeWidgetProps['t']): string {
  return count === 1 ? t('runningOne') : t('running', { count })
}

/** A day heading, localized. */
function dayLabel(label: 'today' | 'yesterday' | 'other', key: string, t: NoticeWidgetProps['t']): string {
  if (label === 'today') return t('today')
  if (label === 'yesterday') return t('yesterday')
  return dayTitle(key, typeof navigator === 'undefined' ? 'zh-CN' : navigator.language)
}

/** One ledger row. */
function RecordRow({ record, t, unread, onOpen }: {
  readonly record: CompletionRecord
  readonly t: NoticeWidgetProps['t']
  readonly unread: boolean
  readonly onOpen: () => void
}): ReactNode {
  const duration = durationLabel(record.durationMs, t)
  const project = record.project === '' ? t('unknownProject') : record.project
  const prompt = record.prompt === '' ? (record.title === '' ? t('untitled') : record.title) : record.prompt
  const showTitle = titleAddsContext(record.title, record.prompt)
  return (
    <button
      type="button"
      className="dtn-item"
      data-unread={unread ? 'true' : 'false'}
      title={record.cwd ?? project}
      aria-label={`${project}${showTitle ? ` · ${record.title}` : ''} · ${t('open')}`}
      onClick={onOpen}
    >
      <span className="dtn-time">{formatClock(record.endedAt)}</span>
      <span className="dtn-spine" aria-hidden="true">
        <span className="dtn-dot" data-status={record.status}>{statusGlyph(record.status)}</span>
      </span>
      <span className="dtn-body">
        <span className="dtn-meta">
          <span className="dtn-project">{project}</span>
          {showTitle ? <span className="dtn-separator">/</span> : null}
          {showTitle ? <span className="dtn-session">{record.title}</span> : null}
        </span>
        <span className="dtn-prompt">{prompt}</span>
        <span className="dtn-statusRow">
          <span className="dtn-status" data-status={record.status}>{statusLabel(record.status, t)}</span>
          {record.detail !== undefined && record.detail !== '' ? (
            <span className="dtn-detail">{clip(record.detail, 90)}</span>
          ) : null}
          {duration !== '' ? <span className="dtn-duration">{duration}</span> : null}
        </span>
      </span>
    </button>
  )
}

/** A completion card: the same facts, compressed to the two lines that matter. */
function CompletionCard({ record, t, dragging, onOpen, onDismiss }: {
  readonly record: CompletionRecord
  readonly t: NoticeWidgetProps['t']
  readonly dragging: boolean
  readonly onOpen: () => void
  readonly onDismiss: (id: string) => void
}): ReactNode {
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    // A card being dragged stays put even when the pointer leaves it.
    if (paused || dragging) return
    const handle = window.setTimeout(() => { onDismiss(record.id) }, CARD_HOLD_MS)
    return () => { window.clearTimeout(handle) }
  }, [paused, dragging, onDismiss, record.id])

  const project = record.project === '' ? t('unknownProject') : record.project
  const prompt = record.prompt === '' ? (record.title === '' ? t('untitled') : record.title) : record.prompt
  const showTitle = titleAddsContext(record.title, record.prompt)
  return (
    <article
      className="dtn-card"
      data-status={record.status}
      onMouseEnter={() => { setPaused(true) }}
      onMouseLeave={() => { setPaused(false) }}
    >
      <button
        type="button"
        className="dtn-cardMain"
        data-drag-handle="card"
        title={t('cardDragHint')}
        onClick={onOpen}
        aria-label={`${project}${showTitle ? ` · ${record.title}` : ''} · ${t('open')}`}
      >
        <span className="dtn-cardTop">
          <span className="dtn-cardKind">{statusLabel(record.status, t)}</span>
          <span className="dtn-cardProject">{project}</span>
          <span className="dtn-cardTime">{formatClock(record.endedAt)}</span>
        </span>
        <span className="dtn-cardPrompt">{prompt}</span>
        {showTitle ? <span className="dtn-cardSession">{record.title}</span> : null}
      </button>
      <button
        type="button"
        className="dtn-cardClose"
        aria-label={t('close')}
        onClick={(event) => {
          event.stopPropagation()
          onDismiss(record.id)
        }}
      >
        <CloseIcon size={11} />
      </button>
    </article>
  )
}

/** The running strip above the ledger. */
function RunningStrip({ label }: { readonly label: string }): ReactNode {
  return (
    <div className="dtn-running">
      <span className="dtn-runningDot" aria-hidden="true" />
      <span className="dtn-runningText">{label}</span>
    </div>
  )
}

/** A switch with the product's proportions. */
function Toggle({ checked, label, onChange }: {
  readonly checked: boolean
  readonly label: string
  readonly onChange: (next: boolean) => void
}): ReactNode {
  return (
    <button
      type="button"
      className="dtn-switch"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => { onChange(!checked) }}
    />
  )
}

/** The status word. */
function statusLabel(status: CompletionRecord['status'], t: NoticeWidgetProps['t']): string {
  switch (status) {
    case 'done': return t('statusDone')
    case 'failed': return t('statusFailed')
    case 'stopped': return t('statusStopped')
    case 'blocked': return t('statusBlocked')
  }
}

/** The glyph inside a status dot. */
function statusGlyph(status: CompletionRecord['status']): ReactNode {
  switch (status) {
    case 'done': return <CheckIcon size={7} />
    case 'failed': return <CrossIcon size={7} />
    case 'stopped': return <StopIcon size={7} />
    case 'blocked': return <BlockedIcon size={7} />
  }
}

/** A turn's length, with the units the active locale uses. */
function durationLabel(milliseconds: number, t: NoticeWidgetProps['t']): string {
  if (milliseconds < 1_000) return ''
  const parts = durationParts(milliseconds)
  if (parts.hours > 0) return t('durationHours', { h: parts.hours, m: parts.minutes })
  if (parts.minutes > 0) return t('durationMinutes', { m: parts.minutes, s: parts.seconds })
  return t('durationSeconds', { s: parts.seconds })
}
