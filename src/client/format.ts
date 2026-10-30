/**
 * Figures and dates, formatted for the widget.
 *
 * Copy stays in the dictionaries; numbers do not. These helpers take the active
 * locale's `t` only where a duration needs its units, so a translated sentence
 * wraps a figure rather than being assembled from translated fragments.
 *
 * @module dsh-task-notice/client/format
 */

/** Local wall-clock time, 24-hour, zero-padded. */
export function formatClock(timestamp: number): string {
  const date = new Date(timestamp)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/** Local calendar day key, used to group records. */
export function dayKey(timestamp: number): string {
  const date = new Date(timestamp)
  return `${String(date.getFullYear())}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** Whether two timestamps fall on the same local day. */
export function sameDay(a: number, b: number): boolean {
  return dayKey(a) === dayKey(b)
}

/** The `n` days before `now`, as a local calendar day key. */
export function daysBefore(now: number, days: number): string {
  const date = new Date(now)
  date.setDate(date.getDate() - days)
  return dayKey(date.getTime())
}

/** A duration split into whole hours, minutes and seconds. */
export interface DurationParts {
  readonly hours: number
  readonly minutes: number
  readonly seconds: number
}

/**
 * Split a duration.
 * @param milliseconds - elapsed wall-clock time.
 * @returns whole units; negative input reads as zero.
 */
export function durationParts(milliseconds: number): DurationParts {
  const total = Math.max(0, Math.floor(milliseconds / 1000))
  return {
    hours: Math.floor(total / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  }
}

/** Bound an untrusted title or path so one long value cannot break a row. */
export function clip(text: string, max: number): string {
  const characters = [...text]
  return characters.length <= max ? text : `${characters.slice(0, Math.max(0, max - 1)).join('')}…`
}

/** Two-digit zero padding. */
export function pad(value: number): string {
  return String(value).padStart(2, '0')
}
