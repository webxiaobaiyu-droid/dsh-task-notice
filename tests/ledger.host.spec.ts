/**
 * The ledger is the part that can be wrong without a browser: which turn a
 * prompt belongs to, what a failure is called, whether a title that arrives late
 * rewrites history, and which sessions are still running.
 */

import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-title'
import { NoticeLedger, projectOf, promptText, statusOf } from '../src/ledger.ts'

const facts = { id: 's1', cwd: '/Users/me/work/konbini', subagent: false }

/** Build an event envelope without dragging the whole session machinery in. */
function event(type: string, data: unknown, time: number, seq = 0): SessionEvent {
  return { type, seq, time, data } as unknown as SessionEvent
}

/** A user message carrying one text block. */
function message(text: string, time: number, seq = 1): SessionEvent {
  return event('user/message', {
    id: 'm1',
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  }, time, seq)
}

describe('projectOf', () => {
  it('keeps the last segment of either separator style', () => {
    expect(projectOf('/Users/me/work/app')).toBe('app')
    expect(projectOf('/Users/me/work/app/')).toBe('app')
    expect(projectOf('C:\\work\\app')).toBe('app')
  })

  it('returns an empty label when the host recorded no directory', () => {
    expect(projectOf(undefined)).toBe('')
    expect(projectOf('')).toBe('')
  })
})

describe('promptText', () => {
  it('collapses whitespace and joins text blocks', () => {
    expect(promptText([{ type: 'text', text: '  fix\n the   deploy ' }])).toBe('fix the deploy')
  })

  it('marks attachments rather than dropping them', () => {
    expect(promptText([{ type: 'text', text: 'look' }, { type: 'image' }, { type: 'file' }]))
      .toBe('look [图片] [文件]')
  })

  it('bounds a very long prompt', () => {
    const text = promptText([{ type: 'text', text: 'x'.repeat(900) }])
    expect(text.length).toBeLessThanOrEqual(500)
    expect(text.endsWith('…')).toBe(true)
  })
})

describe('statusOf', () => {
  it('names the ordinary outcome', () => {
    expect(statusOf({ kind: 'completed' })).toEqual({ status: 'done' })
  })

  it('keeps the provider words for a failure', () => {
    expect(statusOf({ kind: 'error', error: { message: 'context length exceeded', code: 'UNKNOWN' } as never }))
      .toEqual({ status: 'failed', detail: 'context length exceeded' })
  })

  it('does not turn crash repair into a completion', () => {
    expect(statusOf({ kind: 'interrupted' })).toBeUndefined()
    expect(statusOf({ kind: 'forked' })).toBeUndefined()
  })
})

describe('NoticeLedger', () => {
  it('records a turn with the prompt that opened it', () => {
    const ledger = new NoticeLedger({ maxRecords: 10, includeSubagents: false })
    ledger.observe(facts, event('turn/start', { turn: 1 }, 1_000))
    ledger.observe(facts, message('帮我修一下部署脚本', 1_100))
    ledger.observe(facts, event('turn/end', { turn: 1, reason: { kind: 'completed' } }, 61_000))

    expect(ledger.list()).toHaveLength(1)
    const record = ledger.list()[0]!
    expect(record.sessionId).toBe('s1')
    expect(record.prompt).toBe('帮我修一下部署脚本')
    expect(record.project).toBe('konbini')
    expect(record.status).toBe('done')
    expect(record.durationMs).toBe(60_000)
    expect(record.seq).toBe(1)
    expect(ledger.running()).toEqual([])
  })

  it('holds a prompt that arrives before its turn starts', () => {
    const ledger = new NoticeLedger({ maxRecords: 10, includeSubagents: false })
    ledger.observe(facts, message('先到的提问', 900))
    ledger.observe(facts, event('turn/start', { turn: 1 }, 1_000))
    ledger.observe(facts, event('turn/end', { turn: 1, reason: { kind: 'completed' } }, 2_000))
    expect(ledger.list()[0]?.prompt).toBe('先到的提问')
  })

  it('keeps a failure and its detail', () => {
    const ledger = new NoticeLedger({ maxRecords: 10, includeSubagents: false })
    ledger.observe(facts, event('turn/start', { turn: 1 }, 1_000))
    ledger.observe(facts, message('跑一下测试', 1_100))
    ledger.observe(facts, event('turn/end', {
      turn: 1,
      reason: { kind: 'error', error: { message: 'model unavailable', code: 'UNKNOWN' } },
    }, 4_000))
    expect(ledger.list()[0]).toMatchObject({ status: 'failed', detail: 'model unavailable' })
  })

  it('exposes the open turn as running and drops it when it ends', () => {
    const ledger = new NoticeLedger({ maxRecords: 10, includeSubagents: false })
    ledger.observe(facts, event('turn/start', { turn: 1 }, 1_000))
    ledger.observe(facts, message('重构这个模块', 1_100))
    expect(ledger.running()).toEqual([expect.objectContaining({
      sessionId: 's1',
      prompt: '重构这个模块',
      project: 'konbini',
      startedAt: 1_000,
    })])
    ledger.observe(facts, event('turn/end', { turn: 1, reason: { kind: 'aborted', reason: { kind: 'user' } } }, 5_000))
    expect(ledger.running()).toEqual([])
    expect(ledger.list()[0]?.status).toBe('stopped')
  })

  it('ignores subagent sessions unless asked for them', () => {
    const child = { ...facts, id: 's2', subagent: true }
    const quiet = new NoticeLedger({ maxRecords: 10, includeSubagents: false })
    quiet.observe(child, event('turn/start', { turn: 1 }, 1_000))
    quiet.observe(child, message('子任务', 1_100))
    quiet.observe(child, event('turn/end', { turn: 1, reason: { kind: 'completed' } }, 2_000))
    expect(quiet.list()).toEqual([])
    expect(quiet.running()).toEqual([])

    const loud = new NoticeLedger({ maxRecords: 10, includeSubagents: true })
    loud.observe(child, event('turn/start', { turn: 1 }, 1_000))
    loud.observe(child, message('子任务', 1_100))
    loud.observe(child, event('turn/end', { turn: 1, reason: { kind: 'completed' } }, 2_000))
    expect(loud.list()[0]?.subagent).toBe(true)
  })

  it('applies a title that arrives after the turn closed without changing the record sequence', () => {
    const ledger = new NoticeLedger({ maxRecords: 10, includeSubagents: false })
    ledger.observe(facts, event('turn/start', { turn: 1 }, 1_000))
    ledger.observe(facts, message('这是一个很长的问题，用来当标题的兜底', 1_100))
    ledger.observe(facts, event('turn/end', { turn: 1, reason: { kind: 'completed' } }, 2_000))
    const before = ledger.list()[0]!
    const revision = ledger.revision
    ledger.observe(facts, event('session/title', {
      title: '部署脚本修复',
      messageSeqs: [1],
      source: { kind: 'provider', provider: 'test' },
    }, 3_000))
    expect(ledger.list()[0]?.title).toBe('部署脚本修复')
    expect(ledger.list()[0]?.seq).toBe(before.seq)
    expect(ledger.revision).toBeGreaterThan(revision)
  })

  it('skips a crash-orphaned closer', () => {
    const ledger = new NoticeLedger({ maxRecords: 10, includeSubagents: false })
    ledger.observe(facts, event('turn/start', { turn: 1 }, 1_000))
    ledger.observe(facts, event('turn/end', { turn: 1, reason: { kind: 'interrupted' } }, 2_000))
    expect(ledger.list()).toEqual([])
    expect(ledger.running()).toEqual([])
  })

  it('keeps only the configured number of records', () => {
    const ledger = new NoticeLedger({ maxRecords: 2, includeSubagents: false })
    for (let turn = 1; turn <= 4; turn += 1) {
      ledger.observe(facts, event('turn/start', { turn }, turn * 1_000))
      ledger.observe(facts, message(`第 ${String(turn)} 个问题`, turn * 1_000 + 100))
      ledger.observe(facts, event('turn/end', { turn, reason: { kind: 'completed' } }, turn * 1_000 + 500))
    }
    expect(ledger.list().map(record => record.turn)).toEqual([4, 3])
  })

  it('clears history without forgetting a running turn', () => {
    const ledger = new NoticeLedger({ maxRecords: 10, includeSubagents: false })
    ledger.observe(facts, event('turn/start', { turn: 1 }, 1_000))
    ledger.observe(facts, message('第一个', 1_100))
    ledger.observe(facts, event('turn/end', { turn: 1, reason: { kind: 'completed' } }, 2_000))
    ledger.observe(facts, event('turn/start', { turn: 2 }, 3_000))
    ledger.clear()
    expect(ledger.list()).toEqual([])
    expect(ledger.running()).toHaveLength(1)
  })
})
