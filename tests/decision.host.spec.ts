/**
 * A question is not a completed turn: it is a turn that has stopped moving
 * until someone answers. These cases pin when the notice appears and the four
 * ways it may settle.
 */

import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { NoticeLedger, decisionQuestionsOf } from '../src/ledger.ts'

const facts = { id: 's1', cwd: '/Users/me/work/konbini', subagent: false }

/** An event envelope without the session machinery. */
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

/** An ask-user tool call with one branch question. */
function ask(callId: string, time: number, questions = [{
  id: 'branch',
  question: '要合并到 main，还是先发到 preview？',
  header: '选择分支',
  options: [{ label: 'main' }, { label: 'preview' }],
}]): SessionEvent {
  return event('tool/call', {
    turn: 1,
    step: 1,
    callId,
    name: 'ask_user_question',
    arguments: JSON.stringify({ questions }),
  }, time, 2)
}

/** A tool result carrying an answer batch or the timed `pending` payload. */
function result(callId: string, payload: unknown, time: number, isError = false): SessionEvent {
  return event('tool/result', {
    turn: 1,
    step: 1,
    message: {
      id: 'r1',
      role: 'tool',
      toolCallId: callId,
      isError,
      content: [{ type: 'text', text: JSON.stringify(payload) }],
    },
  }, time, 3)
}

/** A late answer steered back into the agent. */
function reply(callId: string, time: number): SessionEvent {
  return event('user/message', {
    id: 'reply-1',
    role: 'user',
    content: [{ type: 'text', text: '{"answers":[]}' }],
    source: { kind: 'user-question-reply', callId, outcome: 'answered' },
  }, time, 4)
}

describe('decisionQuestionsOf', () => {
  it('reads branches, descriptions and multi-select flags', () => {
    const questions = decisionQuestionsOf(JSON.stringify({
      questions: [{
        id: 'branch',
        header: '选择分支',
        question: '要合并到 main，还是先发到 preview？',
        detail: 'preview 会先跑一遍完整检查。',
        multi_select: false,
        options: [
          { label: 'main', description: '直接合并' },
          { label: 'preview', description: '先跑检查' },
        ],
      }],
    }))
    expect(questions).toEqual([{
      id: 'branch',
      header: '选择分支',
      question: '要合并到 main，还是先发到 preview？',
      detail: 'preview 会先跑一遍完整检查。',
      multiSelect: false,
      options: [
        { label: 'main', description: '直接合并' },
        { label: 'preview', description: '先跑检查' },
      ],
    }])
  })

  it('drops malformed arguments and empty question lists', () => {
    expect(decisionQuestionsOf('not json')).toBeUndefined()
    expect(decisionQuestionsOf('{"questions":[]}')).toBeUndefined()
  })
})

describe('NoticeLedger decisions', () => {
  it('turns an ask-user call into a pending decision with the turn context', () => {
    const ledger = new NoticeLedger({ maxRecords: 10, includeSubagents: false })
    ledger.observe(facts, event('turn/start', { turn: 1 }, 1_000))
    ledger.observe(facts, message('帮我把这个改动合进去', 1_100))
    ledger.observe(facts, ask('c1', 2_000))

    expect(ledger.pendingDecisions()).toEqual([expect.objectContaining({
      id: 's1:c1',
      sessionId: 's1',
      turn: 1,
      prompt: '帮我把这个改动合进去',
      project: 'konbini',
      createdAt: 2_000,
      questions: [expect.objectContaining({ id: 'branch', header: '选择分支' })],
    })])
  })

  it('clears the decision when the answer arrives in the tool result', () => {
    const ledger = new NoticeLedger({ maxRecords: 10, includeSubagents: false })
    ledger.observe(facts, event('turn/start', { turn: 1 }, 1_000))
    ledger.observe(facts, ask('c1', 2_000))
    ledger.observe(facts, result('c1', { answers: [{ id: 'branch', selected: ['main'] }] }, 3_000))
    expect(ledger.pendingDecisions()).toEqual([])
  })

  it('keeps a timed pending question, then clears it on a late reply', () => {
    const ledger = new NoticeLedger({ maxRecords: 10, includeSubagents: false })
    ledger.observe(facts, event('turn/start', { turn: 1 }, 1_000))
    ledger.observe(facts, ask('c1', 2_000))
    ledger.observe(facts, result('c1', { pending: true, callId: 'c1' }, 32_000))
    expect(ledger.pendingDecisions()).toHaveLength(1)

    ledger.observe(facts, reply('c1', 40_000))
    expect(ledger.pendingDecisions()).toEqual([])
  })

  it('drops an unanswered question when its turn is aborted', () => {
    const ledger = new NoticeLedger({ maxRecords: 10, includeSubagents: false })
    ledger.observe(facts, event('turn/start', { turn: 1 }, 1_000))
    ledger.observe(facts, ask('c1', 2_000))
    ledger.observe(facts, event('turn/end', { turn: 1, reason: { kind: 'aborted', reason: { kind: 'user' } } }, 3_000))
    expect(ledger.pendingDecisions()).toEqual([])
  })

  it('keeps a continued timed question across a completed turn', () => {
    const ledger = new NoticeLedger({ maxRecords: 10, includeSubagents: false })
    ledger.observe(facts, event('turn/start', { turn: 1 }, 1_000))
    ledger.observe(facts, ask('c1', 2_000))
    ledger.observe(facts, result('c1', { pending: true, callId: 'c1' }, 122_000))
    ledger.observe(facts, event('turn/end', { turn: 1, reason: { kind: 'completed' } }, 123_000))
    expect(ledger.pendingDecisions()).toHaveLength(1)
  })

  it('ignores a subagent question unless subagents are included', () => {
    const child = { ...facts, id: 'child', subagent: true }
    const quiet = new NoticeLedger({ maxRecords: 10, includeSubagents: false })
    quiet.observe(child, event('turn/start', { turn: 1 }, 1_000))
    quiet.observe(child, ask('c1', 2_000))
    expect(quiet.pendingDecisions()).toEqual([])

    const loud = new NoticeLedger({ maxRecords: 10, includeSubagents: true })
    loud.observe(child, event('turn/start', { turn: 1 }, 1_000))
    loud.observe(child, ask('c1', 2_000))
    expect(loud.pendingDecisions()).toHaveLength(1)
  })
})
