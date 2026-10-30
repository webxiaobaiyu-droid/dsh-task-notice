/**
 * Line icons for the widget, drawn on the same 16-unit grid.
 *
 * They are inline SVG rather than an icon font or a dependency: the overlay is
 * loaded outside the product's own bundle, and four paths cost less than asking
 * the page for an icon set that may not expose the names this surface needs.
 *
 * @module dsh-task-notice/client/icons
 */

import type { ReactElement } from 'react'

/** Props every glyph accepts. */
export interface IconProps {
  /** Square pixel size. */
  readonly size?: number
}

/** Shared stroke setup: round caps are what keep a 1.6 stroke from looking sharp. */
const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

/** The dock mark and the empty-state mark. */
export function BellIcon({ size = 18 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" {...stroke}>
      <path d="M8 2.1a4.4 4.4 0 0 0-4.4 4.4v2.2L2.5 11.1h11l-1.1-2.4V6.5A4.4 4.4 0 0 0 8 2.1Z" />
      <path d="M6.3 13a1.8 1.8 0 0 0 3.4 0" />
    </svg>
  )
}

/** A completed turn. */
export function CheckIcon({ size = 12 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" {...stroke}>
      <path d="m3.6 8.4 2.9 2.9 6-6.2" />
    </svg>
  )
}

/** A failed turn. */
export function CrossIcon({ size = 12 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" {...stroke}>
      <path d="m4.2 4.2 7.6 7.6M11.8 4.2l-7.6 7.6" />
    </svg>
  )
}

/** A turn stopped by a person or its parent. */
export function StopIcon({ size = 12 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" {...stroke}>
      <rect x="4.4" y="4.4" width="7.2" height="7.2" rx="1.2" />
    </svg>
  )
}

/** A turn that could not start. */
export function BlockedIcon({ size = 12 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" {...stroke}>
      <circle cx="8" cy="8" r="5.4" />
      <path d="m4.2 11.8 7.6-7.6" />
    </svg>
  )
}

/** Preferences. */
export function GearIcon({ size = 15 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" {...stroke}>
      <circle cx="8" cy="8" r="2.1" />
      <path d="M8 1.9v1.5M8 12.6v1.5M1.9 8h1.5M12.6 8h1.5M3.7 3.7l1.1 1.1M11.2 11.2l1.1 1.1M12.3 3.7l-1.1 1.1M4.8 11.2l-1.1 1.1" />
    </svg>
  )
}

/** Dismiss. */
export function CloseIcon({ size = 13 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" {...stroke}>
      <path d="m4.2 4.2 7.6 7.6M11.8 4.2l-7.6 7.6" />
    </svg>
  )
}

/** Back from settings to the list. */
export function BackIcon({ size = 14 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" {...stroke}>
      <path d="M9.8 3.4 5.2 8l4.6 4.6" />
    </svg>
  )
}

/** Clear history. */
export function TrashIcon({ size = 13 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" {...stroke}>
      <path d="M2.9 4.4h10.2M6.1 4.4V3.2h3.8v1.2M4.2 4.4l.6 8.2h6.4l.6-8.2M6.6 6.7v3.6M9.4 6.7v3.6" />
    </svg>
  )
}

/** Open the session from a card. */
export function ArrowIcon({ size = 13 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" {...stroke}>
      <path d="M3.6 8h8.2M8.2 4.4 11.8 8l-3.6 3.6" />
    </svg>
  )
}
