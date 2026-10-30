/**
 * The film's timeline.
 *
 * `render(t)` is total: for any time in `[0, duration]` it writes every animated
 * property the frame needs — the chrome strings, layer opacity, the staggered
 * notes, the typing. Scene boundaries and captions come from `timings.js`,
 * which the narration step generates from measured audio.
 *
 * Nothing reads the clock: the caller owns `t`, which is what makes the capture
 * reproducible frame for frame.
 *
 * @module dsh-task-notice/video/film
 */

const TIMINGS = window.__TIMINGS

/** Element lookup that fails loudly: a renamed node must break the build. */
function need(id) {
  const node = document.getElementById(id)
  if (node === null) throw new Error(`film: #${id} is missing`)
  return node
}

const stage = need('stage')
const chrome = {
  kicker: need('kicker'),
  title: need('title'),
  qualifier: need('qualifier'),
  facts: need('facts'),
}
const subs = need('subs')
const subsLine = need('subs-line')
const progress = need('progress')

const layers = {
  intro: need('layer-intro'),
  global: need('layer-global'),
  card: need('layer-card'),
  ledger: need('layer-ledger'),
  drag: need('layer-drag'),
  sound: need('layer-sound'),
  install: need('layer-install'),
}

/** Smoothstep over `[from, to]`, clamped outside it. */
function ramp(t, from, to) {
  const p = Math.min(1, Math.max(0, (t - from) / (to - from)))
  return p * p * (3 - 2 * p)
}

/** Opacity and lift of an element entering at `from` and settling at `to`. */
function enter(node, t, from, to, distance = 20) {
  const p = ramp(t, from, to)
  node.style.opacity = String(p)
  node.style.transform = `translateY(${((1 - p) * distance).toFixed(2)}px)`
}

/** The same entrance, but from the side. */
function enterX(node, t, from, to, distance = 24) {
  const p = ramp(t, from, to)
  node.style.opacity = String(p)
  node.style.transform = `translateX(${((1 - p) * distance).toFixed(2)}px)`
}

/** The install line the CTA types out. */
const INSTALL = 'dsh plugin add dsh-task-notice'

/** One scene's reveal: a single entrance, then the frame holds. */
const PAINTERS = {
  intro: t => {
    enter(need('shot-intro'), t, 0.2, 0.85, 22)
    const ring = need('intro-ring')
    const ringIn = ramp(t, 0.85, 1.2)
    const pulse = 0.5 + 0.5 * Math.sin((t - 0.85) * 2.5)
    ring.style.opacity = String(ringIn * (0.55 + 0.35 * pulse))
    ring.style.transform = `scale(${(1 + 0.05 * pulse).toFixed(3)})`
    enter(need('intro-tag'), t, 1.0, 1.4, 12)
  },
  global: t => {
    enter(need('shot-global'), t, 0.2, 0.8, 24)
    const notes = [...need('global-notes').children]
    notes.forEach((note, index) => enter(note, t, 0.55 + index * 0.45, 1.05 + index * 0.45, 14))
  },
  card: t => {
    enter(need('shot-cards'), t, 0.2, 0.8, 24)
    const notes = [...need('card-notes').children]
    notes.forEach((note, index) => enter(note, t, 0.55 + index * 0.45, 1.05 + index * 0.45, 14))
  },
  ledger: t => {
    const notes = [...need('ledger-notes').children]
    notes.forEach((note, index) => enter(note, t, 0.2 + index * 0.38, 0.68 + index * 0.38, 14))
    enterX(need('shot-ledger'), t, 0.45, 1.0, 30)
    enter(need('ledger-stamp'), t, 0.9, 1.35, 14)
  },
  drag: t => {
    enter(need('shot-drag'), t, 0.2, 0.8, 22)
    const ghost = need('drag-ghost')
    const ghostIn = ramp(t, 0.75, 1.05)
    ghost.style.opacity = String(ghostIn)
    const path = need('drag-path')
    path.style.opacity = String(ramp(t, 0.85, 1.2))
    path.style.strokeDashoffset = String((40 - Math.max(0, t - 0.85) * 18).toFixed(2))
    enter(need('drag-target'), t, 1.15, 1.5, 8)
    const notes = [...need('drag-notes').children]
    notes.forEach((note, index) => enter(note, t, 1.0 + index * 0.42, 1.45 + index * 0.42, 14))
  },
  sound: t => {
    enter(need('shot-sound'), t, 0.2, 0.8, 22)
    const rings = [...need('chime').children]
    rings.forEach((ring, index) => {
      const phase = Math.max(0, t - 0.7 - index * 0.25)
      const pulse = 0.5 + 0.5 * Math.sin(phase * 3.4)
      ring.style.opacity = String(ramp(t, 0.6 + index * 0.2, 0.9 + index * 0.2) * (0.35 + 0.4 * pulse))
      ring.style.transform = `scale(${(1 + 0.04 * pulse).toFixed(3)})`
    })
    const notes = [...need('sound-notes').children]
    notes.forEach((note, index) => enter(note, t, 0.6 + index * 0.45, 1.1 + index * 0.45, 14))
  },
  install: t => {
    enter(need('code'), t, 0.2, 0.7, 18)
    const typed = Math.round(INSTALL.length * ramp(t, 1.0, 2.7))
    need('typed').textContent = INSTALL.slice(0, typed)
    need('caret').style.opacity = typed >= INSTALL.length && Math.floor(t * 2) % 2 === 1 ? '0' : '1'
    enter(need('npm-card'), t, 2.5, 3.1, 24)
    const hints = [...need('install-hints').children]
    hints.forEach((hint, index) => enter(hint, t, 3.0 + index * 0.35, 3.45 + index * 0.35, 12))
  },
}

/** The film's total length, in seconds. */
const duration = TIMINGS.duration

/** Facts the chrome is currently showing, so the DOM is only touched on a cut. */
let shownScene = null

/** Write the chrome for one scene: the strings that identify where the film is. */
function setChrome(scene) {
  chrome.kicker.textContent = scene.kicker
  chrome.title.textContent = scene.title
  chrome.qualifier.textContent = scene.qualifier
  chrome.facts.replaceChildren(...scene.facts.flatMap(([key, value]) => {
    const dt = document.createElement('dt')
    dt.textContent = key
    const dd = document.createElement('dd')
    dd.textContent = value
    return [dt, dd]
  }))
  stage.dataset.theme = scene.id === 'install' ? 'night' : 'day'
  shownScene = scene.id
}

/**
 * Paint one frame.
 * @param t - seconds since the first frame.
 */
function render(t) {
  const time = Math.min(duration, Math.max(0, t))
  let active = TIMINGS.scenes[0]
  for (const scene of TIMINGS.scenes) {
    if (time >= scene.start && time < scene.end) active = scene
    // The last scene also owns the tail past its own end, so the final frames
    // keep their chrome while the picture fades out.
    if (scene === TIMINGS.scenes[TIMINGS.scenes.length - 1] && time >= scene.start) active = scene
  }
  if (shownScene !== active.id) setChrome(active)

  // A layer crossfades: out over the last 0.4s of its slot, in over its first.
  for (const scene of TIMINGS.scenes) {
    const fadeIn = ramp(time, scene.start, scene.start + 0.4)
    const fadeOut = scene.end >= duration ? 0 : ramp(time, scene.end - 0.4, scene.end)
    layers[scene.id].style.opacity = String(fadeIn * (1 - fadeOut))
    PAINTERS[scene.id]?.(time - scene.start)
  }

  // The chrome dips at a cut, which is what makes the swap read as a cut rather
  // than as a glitch.
  const chromeIn = ramp(time, active.start, active.start + 0.35)
  const chromeOut = active.end >= duration ? 0 : ramp(time, active.end - 0.26, active.end - 0.02)
  const chromeOpacity = chromeIn * (1 - chromeOut)
  for (const node of Object.values(chrome)) node.style.opacity = String(chromeOpacity)
  need('rule').style.opacity = String(chromeOpacity)

  // Captions ride the voice, not the scene.
  const captionOn = time >= active.voiceStart - 0.15 && time <= active.voiceEnd + 0.5
  subsLine.textContent = active.caption
  subs.style.opacity = captionOn
    ? String(ramp(time, active.voiceStart - 0.15, active.voiceStart + 0.25))
    : '0'

  progress.style.width = `${((time / duration) * 1920).toFixed(1)}px`
}

window.__film = { duration, render }
render(0)
