/**
 * Browser-local preferences, the "last looked" watermark, and the notices the
 * person has already entered.
 *
 * These are per browser, not per Host: sound, volume and system notifications
 * describe this screen and this person's attention, and a second window may
 * reasonably disagree. Nothing here is sent to the Host.
 *
 * Every store tolerates a browser that refuses storage: a missing value falls
 * back to the default rather than failing a render.
 *
 * @module dsh-task-notice/client/settings
 */

/** The preferences this widget owns. */
export interface NoticeSettings {
  /** Whether a finished turn plays the chime. */
  readonly sound: boolean
  /** Chime gain, 0–1. */
  readonly volume: number
  /** Whether a system notification is attempted when the window is backgrounded. */
  readonly system: boolean
  /** Whether the conversation already on screen is announced too. */
  readonly always: boolean
}

/** Defaults chosen for the reported problem: tell me about other work, quietly. */
export const DEFAULT_SETTINGS: NoticeSettings = {
  sound: true,
  volume: 0.6,
  system: false,
  always: false,
}

/** Storage key for the preference record. */
const SETTINGS_KEY = 'dsh-task-notice.settings.v1'

/** Storage key for the last-look watermark. */
const SEEN_KEY = 'dsh-task-notice.seenAt.v1'

/** Storage key for notices that have already led back to their session. */
const ENTERED_KEY = 'dsh-task-notice.entered.v1'

/** Most entered ids retained; matches the Host's largest history. */
const MAX_ENTERED_IDS = 500

/** The settings store React reads with `useSyncExternalStore`. */
export interface SettingsStore {
  /** Current value; stable until a change. */
  get(): NoticeSettings
  /** Replace part of the value. */
  set(patch: Partial<NoticeSettings>): void
  /** Subscribe to changes. */
  subscribe(listener: () => void): () => void
}

/**
 * Read a JSON object from storage.
 * @param key - storage key.
 * @returns the parsed object, or `undefined`.
 */
function readObject(key: string): Record<string, unknown> | undefined {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return undefined
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : undefined
  } catch {
    return undefined
  }
}

/**
 * Read a stored number.
 * @param key - storage key.
 * @returns the number, or `undefined`.
 */
function readNumber(key: string): number | undefined {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return undefined
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

/**
 * Read a stored string array, keeping the newest entries when it is overlong.
 * @param key - storage key.
 * @returns the usable ids, oldest first.
 */
function readIds(key: string): readonly string[] {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const unique = new Set(parsed.filter((value): value is string => typeof value === 'string' && value !== ''))
    return [...unique].slice(-MAX_ENTERED_IDS)
  } catch {
    return []
  }
}

/** Write a value, ignoring a browser that refuses storage. */
function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // A private window with storage disabled still gets a working session.
  }
}

/** One externally observable value with persistence. */
class PersistentStore implements SettingsStore {
  private value: NoticeSettings
  private readonly listeners = new Set<() => void>()
  private readonly key: string
  private readonly sanitize: (value: unknown) => NoticeSettings

  /**
   * @param key - storage key.
   * @param fallback - value when nothing usable is stored.
   * @param sanitize - read a raw object into a complete value.
   */
  constructor(key: string, fallback: NoticeSettings, sanitize: (value: unknown) => NoticeSettings) {
    this.key = key
    this.sanitize = sanitize
    this.value = sanitize(readObject(key) ?? fallback)
  }

  readonly get = (): NoticeSettings => this.value

  set(patch: Partial<NoticeSettings>): void {
    const next = this.sanitize({ ...this.value, ...patch })
    if (JSON.stringify(next) === JSON.stringify(this.value)) return
    this.value = next
    write(this.key, JSON.stringify(next))
    for (const listener of [...this.listeners]) listener()
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}

/**
 * Build the settings store.
 * @returns the live preference store.
 */
export function createSettingsStore(): SettingsStore {
  return new PersistentStore(SETTINGS_KEY, DEFAULT_SETTINGS, (raw) => {
    const value = typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {}
    const volume = typeof value.volume === 'number' && Number.isFinite(value.volume)
      ? Math.min(1, Math.max(0, value.volume))
      : DEFAULT_SETTINGS.volume
    return {
      sound: typeof value.sound === 'boolean' ? value.sound : DEFAULT_SETTINGS.sound,
      volume,
      system: typeof value.system === 'boolean' ? value.system : DEFAULT_SETTINGS.system,
      always: typeof value.always === 'boolean' ? value.always : DEFAULT_SETTINGS.always,
    }
  })
}

/** The last-look watermark, as an external store so the badge re-renders. */
export interface SeenStore {
  /** Current watermark in epoch milliseconds. */
  get(): number
  /** Move the watermark. */
  set(value: number): void
  /** Subscribe to changes. */
  subscribe(listener: () => void): () => void
}

/**
 * Build the watermark store.
 * @returns a store whose value is epoch milliseconds.
 */
export function createSeenStore(): SeenStore {
  let value = readNumber(SEEN_KEY) ?? 0
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set: (next) => {
      if (!Number.isFinite(next)) return
      const bounded = Math.max(0, next)
      if (bounded === value) return
      value = bounded
      write(SEEN_KEY, String(value))
      for (const listener of [...listeners]) listener()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/** Notices whose sessions have already been entered, as an external store. */
export interface EnteredStore {
  /** Current record ids; stable until one is added or all are cleared. */
  get(): ReadonlySet<string>
  /** Remember one record after its session opened successfully. */
  add(id: string): void
  /** Forget every id, used when the Host history is cleared. */
  clear(): void
  /** Subscribe to changes. */
  subscribe(listener: () => void): () => void
}

/**
 * Build the entered-notice store.
 * @returns a store of record ids that should no longer be listed.
 */
export function createEnteredStore(): EnteredStore {
  let value: ReadonlySet<string> = new Set(readIds(ENTERED_KEY))
  const listeners = new Set<() => void>()
  const publish = (next: ReadonlySet<string>): void => {
    value = next
    for (const listener of [...listeners]) listener()
  }
  return {
    get: () => value,
    add: (id) => {
      if (id === '' || value.has(id)) return
      const next = [...value, id].slice(-MAX_ENTERED_IDS)
      write(ENTERED_KEY, JSON.stringify(next))
      publish(new Set(next))
    },
    clear: () => {
      if (value.size === 0) return
      write(ENTERED_KEY, '[]')
      publish(new Set())
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
