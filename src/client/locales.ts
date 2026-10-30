/**
 * Copy dictionaries for the completion notice.
 *
 * Every sentence the widget prints lives here. Figures are formatted separately
 * (`format.ts`) so a translated string wraps a number instead of being assembled
 * from translated fragments; placeholders are `{name}` and the locale runtime
 * substitutes them by name.
 *
 * @module dsh-task-notice/client/locales
 */

/** Simplified Chinese dictionary and key source of truth. */
export const zh = {
  dock: '任务通知',
  dockHint: '任务通知：点击打开，拖动移动',
  dragHint: '拖动移动位置',
  cardDragHint: '拖动移动通知，点击打开会话',
  title: '任务通知',
  subtitle: '完成的任务会排在这里',
  unread: '{count} 条未读',
  unreadOne: '1 条未读',
  markAllRead: '全部已读',
  settings: '设置',
  close: '关闭',
  back: '返回',

  running: '{count} 个任务正在运行',
  runningOne: '1 个任务正在运行',
  runningHint: '它们完成后会出现在下面',

  emptyTitle: '还没有完成的任务',
  emptyBody: '去忙别的。任务完成后，项目、会话和你的问题都会排在这里。',
  emptyEnteredTitle: '没有待处理的通知',
  emptyEnteredBody: '已经点开过的任务会自动收起，不再占用这里。',
  noUnread: '没有未读',
  recent: '最近 {count} 条',
  allEntered: '通知已全部收起',
  clear: '清空记录',
  clearConfirm: '再点一次清空',
  clearHint: '只清空这个列表，不影响会话记录',
  cleared: '记录已清空',
  gone: '这个会话已经不在了',
  open: '打开会话',
  openHint: '点击打开这个会话',

  today: '今天',
  yesterday: '昨天',
  statusDone: '已完成',
  statusFailed: '失败',
  statusStopped: '已停止',
  statusBlocked: '已阻塞',
  statusDoneWithNote: '已完成 · {note}',
  durationMinutes: '{m} 分 {s} 秒',
  durationSeconds: '{s} 秒',
  durationHours: '{h} 小时 {m} 分',
  unknownProject: '未知项目',
  untitled: '未命名任务',

  toastNew: '{count} 个任务刚完成',
  toastMore: '还有 {count} 条',
  toastViewAll: '查看全部',

  settingsTitle: '通知设置',
  settingsSub: '声音与提醒',
  sound: '完成时播放提示音',
  soundHint: '两声短铃，像下载完成那样',
  volume: '音量',
  test: '试听',
  testPlaying: '正在试听',
  soundBlocked: '浏览器还没允许播放声音：点一下页面再试',
  system: '系统通知',
  systemHint: '窗口不在前台时，用系统通知再提醒一次',
  systemDenied: '系统没有授予通知权限',
  systemUnsupported: '这个环境不支持系统通知',
  always: '当前会话也提醒',
  alwaysHint: '默认不打扰你正在看的那个会话',
  position: '通知位置',
  positionHint: '拖动铃铛、面板标题或完成卡片可以移动；聚焦铃铛后可用方向键微调',
  resetPosition: '复位',

  systemTitleDone: '{project} · 任务完成',
  systemTitleFailed: '{project} · 任务失败',
  systemBody: '{title}\n{prompt}',
} as const

/** The dictionary's key set. */
export type TaskNoticeLocaleKey = keyof typeof zh

/** English dictionary, keyed to the Chinese source of truth. */
export const en: Record<TaskNoticeLocaleKey, string> = {
  dock: 'Task notices',
  dockHint: 'Task notices: click to open, drag to move',
  dragHint: 'Drag to move',
  cardDragHint: 'Drag to move the notice; click to open the session',
  title: 'Task notices',
  subtitle: 'Finished work lines up here',
  unread: '{count} unread',
  unreadOne: '1 unread',
  markAllRead: 'Mark all read',
  settings: 'Settings',
  close: 'Close',
  back: 'Back',

  running: '{count} tasks running',
  runningOne: '1 task running',
  runningHint: 'They will appear below when they finish',

  emptyTitle: 'Nothing has finished yet',
  emptyBody: 'Go do something else. When a task finishes, its project, session and your question will line up here.',
  emptyEnteredTitle: 'You are all caught up',
  emptyEnteredBody: 'Tasks you have opened are tucked away from this list.',
  noUnread: 'Nothing unread',
  recent: 'Latest {count}',
  allEntered: 'All notices tucked away',
  clear: 'Clear history',
  clearConfirm: 'Click again to clear',
  clearHint: 'Clears this list only; sessions are untouched',
  cleared: 'History cleared',
  gone: 'That session is gone',
  open: 'Open session',
  openHint: 'Click to open this session',

  today: 'Today',
  yesterday: 'Yesterday',
  statusDone: 'Done',
  statusFailed: 'Failed',
  statusStopped: 'Stopped',
  statusBlocked: 'Blocked',
  statusDoneWithNote: 'Done · {note}',
  durationMinutes: '{m}m {s}s',
  durationSeconds: '{s}s',
  durationHours: '{h}h {m}m',
  unknownProject: 'Unknown project',
  untitled: 'Untitled task',

  toastNew: '{count} tasks just finished',
  toastMore: '{count} more',
  toastViewAll: 'View all',

  settingsTitle: 'Notice settings',
  settingsSub: 'Sound and alerts',
  sound: 'Play a chime when a task finishes',
  soundHint: 'Two short bell notes, like a finished download',
  volume: 'Volume',
  test: 'Test',
  testPlaying: 'Playing',
  soundBlocked: 'The browser has not allowed audio yet: click the page and try again',
  system: 'System notification',
  systemHint: 'Also notify through the system when the window is in the background',
  systemDenied: 'Notification permission was not granted',
  systemUnsupported: 'This environment does not support system notifications',
  always: 'Notify for the open session too',
  alwaysHint: 'By default the conversation you are already watching stays quiet',
  position: 'Notice position',
  positionHint: 'Drag the bell, the panel header, or a completion card; arrow keys nudge it when the bell has focus',
  resetPosition: 'Reset',

  systemTitleDone: '{project} · Task done',
  systemTitleFailed: '{project} · Task failed',
  systemBody: '{title}\n{prompt}',
}
