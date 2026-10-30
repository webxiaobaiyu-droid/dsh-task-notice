/**
 * The local memory of notices the person clicked through to.
 *
 * It has to survive a reload, ignore duplicate clicks, and be forgettable when
 * the user clears the Host history. It must also never let a disabled or full
 * localStorage break the widget.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEnteredStore } from '../src/client/settings.ts'

const STORAGE_KEY = 'dsh-task-notice.entered.v1'
const fallbackStorage = new Map<string, string>()

const localStorageStub = {
  getItem: (key: string): string | null => fallbackStorage.get(key) ?? null,
  setItem: (key: string, value: string): void => {
    fallbackStorage.set(key, value)
  },
}

/** Put a browser-like localStorage in scope for one test. */
function installStorage(): void {
  vi.stubGlobal('window', { localStorage: localStorageStub })
}

afterEach(() => {
  fallbackStorage.clear()
  vi.unstubAllGlobals()
})

describe('createEnteredStore', () => {
  it('persists unique ids in click order', () => {
    installStorage()
    const store = createEnteredStore()
    const listener = vi.fn()
    store.subscribe(listener)

    store.add('s1:1')
    store.add('s1:2')
    store.add('s1:1')

    expect([...store.get()]).toEqual(['s1:1', 's1:2'])
    expect(listener).toHaveBeenCalledTimes(2)
    expect([...createEnteredStore().get()]).toEqual(['s1:1', 's1:2'])
  })

  it('forgets everything when history is cleared', () => {
    installStorage()
    const store = createEnteredStore()
    store.add('s1:1')

    store.clear()

    expect(store.get().size).toBe(0)
    expect([...createEnteredStore().get()]).toEqual([])
  })

  it('starts empty when storage holds something unreadable', () => {
    fallbackStorage.set(STORAGE_KEY, '{not json')
    installStorage()

    expect(createEnteredStore().get().size).toBe(0)
  })
})
