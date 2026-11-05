/**
 * The three rules a completion surface gets wrong quietly: what counts as new,
 * what counts as unread, and when a toast is allowed to interrupt.
 */

import { describe, expect, it } from 'vitest'
import type { CompletionRecord } from '../src/types.ts'
import {
  groupByDay,
  highestSeq,
  newRecords,
  shouldAlert,
  shouldAlertDecision,
  titleAddsContext,
  unreadRecords,
  visibleRecords,
} from '../src/client/model.ts'

const DAY = 24 * 60 * 60 * 1_000

/** One record with just enough shape to exercise the rules. */
function record(seq: number, endedAt: number, overrides: Partial<CompletionRecord> = {}): CompletionRecord {
  return {
    id: `s1:${String(seq)}`,
    seq,
    sessionId: 's1',
    turn: seq,
    title: '部署脚本修复',
    prompt: '帮我把证书路径改掉',
    project: 'konbini',
    status: 'done',
    startedAt: endedAt - 60_000,
    endedAt,
    durationMs: 60_000,
    subagent: false,
    ...overrides,
  }
}

describe('newRecords', () => {
  it('returns only records above the cursor, oldest first', () => {
    const records = [record(5, 5_000), record(3, 3_000), record(4, 4_000)]
    expect(newRecords(records, 3).map(item => item.seq)).toEqual([4, 5])
  })

  it('returns nothing on a first snapshot at cursor zero', () => {
    expect(newRecords([record(1, 1_000)], 1)).toEqual([])
  })
})

describe('highestSeq', () => {
  it('reads the newest sequence regardless of order', () => {
    expect(highestSeq([record(2, 2_000), record(9, 9_000), record(4, 4_000)])).toBe(9)
    expect(highestSeq([])).toBe(0)
  })
})

describe('unreadRecords', () => {
  it('compares the finish time against the last look', () => {
    const records = [record(3, 30_000), record(2, 20_000), record(1, 10_000)]
    expect(unreadRecords(records, 15_000).map(item => item.seq)).toEqual([3, 2])
  })

  it('never counts a subagent as unread', () => {
    const records = [record(1, 20_000, { subagent: true })]
    expect(unreadRecords(records, 0)).toEqual([])
  })
})

describe('visibleRecords', () => {
  it('removes every notice whose session was already entered', () => {
    const records = [record(3, 30_000), record(2, 20_000), record(1, 10_000)]
    expect(visibleRecords(records, new Set(['s1:2'])).map(item => item.seq)).toEqual([3, 1])
  })

  it('keeps the snapshot untouched when nothing was entered', () => {
    const records = [record(1, 10_000)]
    expect(visibleRecords(records, new Set())).toBe(records)
  })
})

describe('shouldAlert', () => {
  const policy = { always: false, currentSessionId: 's1', background: false }

  it('stays quiet for the conversation already on screen', () => {
    expect(shouldAlert(record(1, 1_000), policy)).toBe(false)
  })

  it('speaks up for another conversation', () => {
    expect(shouldAlert(record(1, 1_000, { sessionId: 's2' }), policy)).toBe(true)
  })

  it('speaks up when the window is in the background, even for the open session', () => {
    expect(shouldAlert(record(1, 1_000), { ...policy, background: true })).toBe(true)
  })

  it('honours the explicit always setting', () => {
    expect(shouldAlert(record(1, 1_000), { ...policy, always: true })).toBe(true)
  })

  it('never interrupts for a subagent', () => {
    expect(shouldAlert(record(1, 1_000, { sessionId: 's2', subagent: true }), policy)).toBe(false)
  })
})

describe('titleAddsContext', () => {
  it('hides a title that is just the prompt with punctuation trimmed', () => {
    expect(titleAddsContext('只回复 OK，不要调用任何工具', '只回复 OK，不要调用任何工具。')).toBe(false)
  })

  it('hides a truncated fallback that is a prefix of the prompt', () => {
    expect(titleAddsContext('帮我把 nginx 的证书路径改掉', '帮我把 nginx 的证书路径改掉，然后重启服务。')).toBe(false)
  })

  it('shows a title that says something new', () => {
    expect(titleAddsContext('修复部署脚本', '帮我把 nginx 的证书路径改掉')).toBe(true)
  })
})

describe('groupByDay', () => {
  it('groups newest first and labels today and yesterday', () => {
    const now = new Date(2026, 9, 30, 12, 0, 0).getTime()
    const groups = groupByDay([
      record(3, now - 60_000),
      record(2, now - 2 * 60_000),
      record(1, now - DAY - 60_000),
    ], now)
    expect(groups.map(group => group.label)).toEqual(['today', 'yesterday'])
    expect(groups[0]?.records.map(item => item.seq)).toEqual([3, 2])
    expect(groups[1]?.records.map(item => item.seq)).toEqual([1])
  })

  it('separates an older day into its own group', () => {
    const now = new Date(2026, 9, 30, 12, 0, 0).getTime()
    const groups = groupByDay([
      record(2, now),
      record(1, now - 5 * DAY),
    ], now)
    expect(groups).toHaveLength(2)
    expect(groups[1]?.label).toBe('other')
  })
})


describe('shouldAlertDecision', () => {
  it('announces a question from another session', () => {
    expect(shouldAlertDecision({
      id: 's1:c1', sessionId: 's1', turn: 1, title: '部署', prompt: '部署',
      project: 'app', questions: [{ id: 'q', question: '选 main 还是 preview？' }],
      createdAt: 1, subagent: false,
    }, { always: false, currentSessionId: 's2', background: false })).toBe(true)
  })

  it('stays quiet for the question already on screen', () => {
    expect(shouldAlertDecision({
      id: 's1:c1', sessionId: 's1', turn: 1, title: '部署', prompt: '部署',
      project: 'app', questions: [{ id: 'q', question: '选 main 还是 preview？' }],
      createdAt: 1, subagent: false,
    }, { always: false, currentSessionId: 's1', background: false })).toBe(false)
  })
})
