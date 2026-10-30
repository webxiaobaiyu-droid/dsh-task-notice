/**
 * Where the dock sits, and how its panel folds out from there.
 *
 * The widget is one fixed object anchored by its top-right corner: the dock
 * stays put, and the panel and cards grow left or right, above or below it.
 * Keeping the geometry here means the browser can be dragged to any corner
 * without a layout pass, and the same rules can be checked in a test without a
 * DOM.
 *
 * @module dsh-task-notice/client/position
 */

/** The dock's square edge, matching `.dtn-dock` in the stylesheet. */
export const DOCK_SIZE = 40

/** The panel's preferred width; it narrows on a small viewport. */
export const PANEL_WIDTH = 368

/** Space between the dock and whatever opens next to it. */
export const PANEL_GAP = 10

/** Smallest gap kept between the widget and the viewport edge. */
export const VIEWPORT_MARGIN = 12

/** Gap used while clamping; a little tighter than the panel's own margin. */
const EDGE = 8

/** A panel taller than this stops feeling like a popover. */
export const MAX_PANEL_HEIGHT = 560

/** Below this, a panel is too short to browse and should flip instead. */
const FLIP_ROOM = 320

/** The dock's top-right corner, measured from the viewport's top-right. */
export interface WidgetPosition {
  /** Distance from the viewport's right edge to the dock's right edge. */
  readonly right: number
  /** Distance from the viewport's top edge to the dock's top edge. */
  readonly top: number
}

/** Viewport facts the geometry needs. */
export interface ViewportSize {
  readonly width: number
  readonly height: number
}

/** Which way the popover leaves the dock. */
export interface PopoverPlacement {
  /** `start` means the panel's left edge lines up with the dock's left edge. */
  readonly align: 'start' | 'end'
  /** Whether the panel opens above the dock instead of below it. */
  readonly side: 'above' | 'below'
  /** Room available in that direction, capped to a comfortable panel size. */
  readonly maxHeight: number
}

/** Storage key for the dragged position. */
const POSITION_KEY = 'dsh-task-notice.position.v1'

/**
 * The resting place before anyone drags the dock.
 * @param width - viewport width in CSS pixels.
 * @returns the default top-right position.
 */
export function defaultPosition(width: number): WidgetPosition {
  return width <= 520 ? { right: 12, top: 12 } : { right: 16, top: 56 }
}

/**
 * Keep the dock inside the viewport without letting its panel fall off screen.
 *
 * On a wide viewport the dock may sit anywhere horizontally: when there is not
 * enough room to the left of it, the panel opens to the right instead. On a
 * viewport narrower than two panels there is no such choice, so horizontal
 * movement is limited to the edge where the panel still fits.
 *
 * @param position - desired top-right offset.
 * @param viewport - current viewport size.
 * @returns the nearest position that keeps the widget usable.
 */
export function clampPosition(position: WidgetPosition, viewport: ViewportSize): WidgetPosition {
  const panelWidth = Math.min(PANEL_WIDTH, Math.max(0, viewport.width - 2 * VIEWPORT_MARGIN))
  const endMax = viewport.width - panelWidth - VIEWPORT_MARGIN
  const startMin = panelWidth + VIEWPORT_MARGIN - DOCK_SIZE
  const farthest = viewport.width - DOCK_SIZE - EDGE
  // When both sides cannot host the panel there is no middle ground: pin the
  // dock to the right edge so the panel at least keeps its right margin.
  const horizontalMax = startMin <= endMax
    ? farthest
    : Math.min(farthest, Math.max(EDGE, endMax))
  const right = Math.min(Math.max(position.right, EDGE), Math.max(EDGE, horizontalMax))
  const top = Math.min(Math.max(position.top, EDGE), Math.max(EDGE, viewport.height - DOCK_SIZE - EDGE))
  return { right, top }
}

/**
 * Decide which side of the dock the panel opens on.
 * @param position - the dock's top-right offset.
 * @param viewport - current viewport size.
 * @returns alignment, vertical side, and the height the panel may use.
 */
export function placePopover(position: WidgetPosition, viewport: ViewportSize): PopoverPlacement {
  const panelWidth = Math.min(PANEL_WIDTH, Math.max(0, viewport.width - 2 * VIEWPORT_MARGIN))
  const align = position.right > viewport.width - panelWidth - VIEWPORT_MARGIN ? 'start' : 'end'
  const below = viewport.height - position.top - DOCK_SIZE - PANEL_GAP - VIEWPORT_MARGIN
  const above = position.top - PANEL_GAP - VIEWPORT_MARGIN
  const side = below < FLIP_ROOM && above > below ? 'above' : 'below'
  const room = side === 'above' ? above : below
  return {
    align,
    side,
    maxHeight: Math.floor(Math.min(MAX_PANEL_HEIGHT, Math.max(160, room))),
  }
}

/**
 * Read the last dragged position.
 * @returns the stored position, or `undefined` when the dock never moved.
 */
export function readPosition(): WidgetPosition | undefined {
  try {
    const raw = window.localStorage.getItem(POSITION_KEY)
    if (raw === null) return undefined
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return undefined
    const value = parsed as Record<string, unknown>
    if (typeof value.right !== 'number' || !Number.isFinite(value.right)) return undefined
    if (typeof value.top !== 'number' || !Number.isFinite(value.top)) return undefined
    return { right: value.right, top: value.top }
  } catch {
    return undefined
  }
}

/**
 * Remember a dragged position.
 * @param position - the dock's top-right offset.
 */
export function savePosition(position: WidgetPosition): void {
  try {
    window.localStorage.setItem(POSITION_KEY, JSON.stringify(position))
  } catch {
    // A browser that refuses storage still gets a movable widget this session.
  }
}

/** Forget the dragged position and return to the stylesheet's default. */
export function clearPosition(): void {
  try {
    window.localStorage.removeItem(POSITION_KEY)
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}
