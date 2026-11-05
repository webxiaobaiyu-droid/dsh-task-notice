/**
 * Standalone mount of the real completion widget, fed by synthetic records.
 *
 * The film shows the shipping component: this entry imports `NoticeWidget` and
 * the plugin's own stylesheet from `src/`, and supplies only the seats the
 * product's slot renderer would have supplied — the dictionary, the feed,
 * browser-local stores and the navigation action.
 *
 * @module dsh-task-notice/video/panel/main
 */

// The product's own token sheets, so the widget's `--dsw-*` reads resolve to
// the real light theme instead of falling back to nothing.
import '@dsh-theme/base.css'
import '@dsh-theme/design-platform.css'
import { createRoot } from 'react-dom/client'
import { NoticeWidget, type NoticeWidgetProps } from '../../src/client/NoticeWidget.tsx'
import { zh } from '../../src/client/locales.ts'
import { styles } from '../../src/client/styles.ts'
import type { CompletionRecord, NoticeSnapshot, PendingDecision } from '../../src/types.ts'

const styleTag = document.createElement('style')
styleTag.dataset.pluginCss = 'dsh-task-notice'
styleTag.textContent = styles
document.head.appendChild(styleTag)

const DICTIONARY: Record<string, string> = zh

/** Dictionary lookup with the locale runtime's own `{name}` substitution. */
function translate(key: string, params?: Record<string, string>): string {
  const template = DICTIONARY[key] ?? key
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => params[name] ?? match)
}

/** Wait one paint, so a click's effect is on screen before the next capture. */
function nextPaint(): Promise<void> {
  return new Promise(resolve => {
    requestAnimationFrame(() => { requestAnimationFrame(() => { resolve() }) })
  })
}

const now = Date.now()
const day = 24 * 60 * 60 * 1_000
const records: readonly CompletionRecord[] = [
  {
    id: 'konbini:2', seq: 4, sessionId: 's-konbini', turn: 2,
    title: '修复部署脚本', prompt: '帮我把 nginx 的证书路径改到新目录，然后重启服务确认没有报错。',
    project: 'konbini-nginx-deploy', cwd: '/Users/Admin/work/konbini-nginx-deploy',
    status: 'failed', detail: 'model route timed out',
    startedAt: now - 132_000, endedAt: now - 60_000, durationMs: 132_000, subagent: false,
  },
  {
    id: 'storefront:3', seq: 3, sessionId: 's-storefront', turn: 3,
    title: '补上库存接口的边界测试', prompt: '把库存接口的边界情况补上测试，顺便跑一遍类型检查。',
    project: 'storefront-api', cwd: '/Users/Admin/work/storefront-api',
    status: 'done', startedAt: now - 486_000, endedAt: now - 402_000, durationMs: 84_000, subagent: false,
  },
  {
    id: 'notice:1', seq: 2, sessionId: 's-notice', turn: 1,
    title: '把完成提醒做成插件', prompt: '给完成通知加一个可拖动的位置，最好能记住。',
    project: 'dsh-task-notice', cwd: '/Users/Admin/dsh-plugins/dsh-task-notice',
    status: 'done', startedAt: now - 3 * 3_600_000, endedAt: now - 3 * 3_600_000 + 54_000, durationMs: 54_000, subagent: false,
  },
  {
    id: 'ops:7', seq: 1, sessionId: 's-ops', turn: 7,
    title: '清理旧的构建产物', prompt: '把 dist 里三个月前的构建产物清掉，保留最近两个版本。',
    project: 'ops-scripts', cwd: '/Users/Admin/work/ops-scripts',
    status: 'stopped', detail: 'stopped by you',
    startedAt: now - day - 7_200_000, endedAt: now - day - 7_140_000, durationMs: 60_000, subagent: false,
  },
]

const running = [
  { sessionId: 's-storefront', turn: 4, title: '补上库存接口的边界测试', prompt: '把库存接口的边界情况补上测试。', project: 'storefront-api', startedAt: now - 40_000 },
  { sessionId: 's-konbini', turn: 3, title: '修一条 nginx 的跳转规则', prompt: '看一下 /old 的跳转为什么绕了一圈。', project: 'konbini-nginx-deploy', startedAt: now - 18_000 },
]

let state: { status: 'ready'; snapshot: NoticeSnapshot; error: undefined } = {
  status: 'ready',
  snapshot: { bootId: 'capture', revision: 1, records, running, decisions: [], now },
  error: undefined,
}
const listeners = new Set<() => void>()
let completionListener: (records: readonly CompletionRecord[]) => void = () => {}
let decisionListener: (decisions: readonly PendingDecision[]) => void = () => {}

const store = {
  getState: () => state,
  subscribe: (listener: () => void) => {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  },
  onCompletions: (listener: (records: readonly CompletionRecord[]) => void) => {
    completionListener = listener
    return () => { completionListener = () => {} }
  },
  onDecisions: (listener: (decisions: readonly PendingDecision[]) => void) => {
    decisionListener = listener
    return () => { decisionListener = () => {} }
  },
  start: () => () => {},
  clear: async () => {},
}

/** One externally observable value with a setter, enough for the widget's stores. */
function storeOf<T>(initial: T) {
  let value = initial
  const subscribers = new Set<() => void>()
  return {
    get: () => value,
    set: (next: T) => {
      value = next
      for (const listener of [...subscribers]) listener()
    },
    subscribe: (listener: () => void) => {
      subscribers.add(listener)
      return () => { subscribers.delete(listener) }
    },
  }
}

const settings = storeOf({ sound: false, volume: 0.6, system: false, always: true })
const seen = storeOf(0)
// Keep the last-look watermark at zero so the film can show the unread state;
// the captured panel is a still, not a live reading session.
seen.set = () => {}
const entered = Object.assign(storeOf<ReadonlySet<string>>(new Set()), {
  add: (id: string) => {
    const next = new Set(entered.get())
    next.add(id)
    entered.set(next)
  },
  clear: () => { entered.set(new Set()) },
})

const props = {
  t: translate,
  store,
  settings,
  seen,
  entered,
  currentSessionId: () => 's-storefront',
  openSession: () => true,
} as unknown as NoticeWidgetProps

const host = document.getElementById('root')
if (host === null) throw new Error('video/panel: #root is missing from index.html')
createRoot(host).render(<NoticeWidget {...props} />)

/** A completion record for the card scene. */
function cardRecord(index: number, status: 'done' | 'failed'): CompletionRecord {
  const at = Date.now()
  return {
    id: `card-${index}`, seq: 100 + index, sessionId: `s-card-${index}`,
    turn: 1,
    title: status === 'done' ? '补上库存接口的边界测试' : '把完成提醒做成插件',
    prompt: status === 'done'
      ? '把库存接口的边界情况补上测试，顺便跑一遍类型检查。'
      : '给完成通知加一个可拖动的位置，最好能记住。',
    project: status === 'done' ? 'storefront-api' : 'dsh-task-notice',
    cwd: '/Users/Admin/work/demo',
    status,
    detail: status === 'failed' ? 'model route timed out' : undefined,
    startedAt: at - (status === 'done' ? 76_000 : 54_000),
    endedAt: at,
    durationMs: status === 'done' ? 76_000 : 54_000,
    subagent: false,
  }
}

async function waitFor<T>(read: () => T | null, message: string): Promise<T> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const value = read()
    if (value !== null) return value
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error(`video/panel: ${message}`)
}

/** Capture-side handle: the film's states are reached through the real widget. */
interface NoticeHandle {
  ready: Promise<void>
  open: () => Promise<void>
  close: () => Promise<void>
  settings: () => Promise<void>
  back: () => Promise<void>
  pushCard: (status?: 'done' | 'failed') => Promise<void>
  pushDecision: () => Promise<void>
  setPosition: (position: { right: number; top: number }) => void
  clearPosition: () => void
}

declare global {
  interface Window { __notice: NoticeHandle }
}

window.__notice = {
  ready: (async () => {
    await waitFor(() => document.querySelector('.dtn-dock'), 'the dock never rendered')
    await nextPaint()
  })(),
  open: async () => {
    const dock = document.querySelector<HTMLButtonElement>('.dtn-dock')
    if (dock === null) throw new Error('video/panel: no dock')
    if (dock.getAttribute('aria-expanded') !== 'true') dock.click()
    await waitFor(() => document.querySelector('.dtn-panel'), 'the panel never opened')
    await new Promise(resolve => setTimeout(resolve, 320))
  },
  close: async () => {
    const close = document.querySelector<HTMLButtonElement>('.dtn-panel button[aria-label="关闭"]')
    if (close !== null) close.click()
    await nextPaint()
    await new Promise(resolve => setTimeout(resolve, 120))
  },
  settings: async () => {
    const gear = document.querySelector<HTMLButtonElement>('.dtn-panel button[aria-label="设置"]')
    if (gear === null) throw new Error('video/panel: no settings button')
    gear.click()
    await waitFor(() => document.querySelector('.dtn-settings'), 'settings never opened')
    await new Promise(resolve => setTimeout(resolve, 200))
  },
  back: async () => {
    const back = document.querySelector<HTMLButtonElement>('.dtn-panel button[aria-label="返回"]')
    if (back === null) throw new Error('video/panel: no back button')
    back.click()
    await nextPaint()
    await new Promise(resolve => setTimeout(resolve, 150))
  },
  pushDecision: async () => {
    const decision: PendingDecision = {
      id: 's-card-decision:c1',
      sessionId: 's-card-decision',
      turn: 1,
      title: '部署前确认',
      prompt: '把这次改动合进去之前，先确认一下分支。',
      project: 'storefront-api',
      cwd: '/Users/Admin/work/storefront-api',
      questions: [{
        id: 'branch',
        header: '选择分支',
        question: '要合并到 main，还是先发到 preview？',
        options: [
          { label: 'main', description: '直接合并' },
          { label: 'preview', description: '先跑一遍完整检查' },
        ],
      }],
      createdAt: Date.now(),
      subagent: false,
    }
    state = {
      ...state,
      snapshot: { ...state.snapshot, revision: state.snapshot.revision + 1, decisions: [decision], now: Date.now() },
    }
    for (const listener of [...listeners]) listener()
    decisionListener([decision])
    await waitFor(() => document.querySelector('.dtn-card[data-status="decision"]'), 'the decision card never appeared')
    await new Promise(resolve => setTimeout(resolve, 320))
  },
  pushCard: async (status = 'done') => {
    const record = cardRecord(status === 'done' ? 1 : 2, status)
    state = {
      ...state,
      snapshot: {
        ...state.snapshot,
        revision: state.snapshot.revision + 1,
        records: [record, ...state.snapshot.records],
        now: Date.now(),
      },
    }
    for (const listener of [...listeners]) listener()
    completionListener([record])
    await waitFor(() => document.querySelector('.dtn-card'), 'the completion card never appeared')
    await new Promise(resolve => setTimeout(resolve, 320))
  },
  setPosition: (position) => {
    window.localStorage.setItem('dsh-task-notice.position.v1', JSON.stringify(position))
    window.location.reload()
  },
  clearPosition: () => {
    window.localStorage.removeItem('dsh-task-notice.position.v1')
    window.location.reload()
  },
}
