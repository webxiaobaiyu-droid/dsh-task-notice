/**
 * Build the promo film end to end.
 *
 * Steps, in order, because each consumes the previous one's output:
 *   1. serve `video/panel` (the real widget, synthetic records) and capture states;
 *   2. synthesise the narration and measure it, which fixes the timeline;
 *   3. walk the film's timeline and write one image per frame;
 *   4. lay the narration onto the timeline's own offsets;
 *   5. write the sidecar subtitles;
 *   6. render the upload cover;
 *   7. mux the two into the MP4.
 *
 * Usage:
 *   node video/build.mjs                 # everything
 *   node video/build.mjs --skip-panel    # reuse the captured widget states
 *   node video/build.mjs --skip-frames   # re-encode the existing frames
 *
 * @module dsh-task-notice/video/build
 */

import { spawn, execFile } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)
const argv = process.argv.slice(2)
const VIDEO_ROOT = fileURLToPath(new URL('.', import.meta.url))
const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const PORT = Number(process.env.PANEL_PORT ?? 5198)

/** Vitest brings Vite into the store; the package does not depend on it directly. */
function viteEntry() {
  const store = `${PACKAGE_ROOT}/node_modules/.pnpm`
  for (const entry of readdirSync(store)) {
    if (/^vite@\d/.test(entry)) {
      return `${store}/${entry}/node_modules/vite/bin/vite.js`
    }
  }
  throw new Error('build: vite not found in the pnpm store')
}

const VITE = viteEntry()

/** Run one stage, streaming its output, and fail the build on a non-zero exit. */
async function stage(title, file, args = []) {
  console.log(`\n== ${title}`)
  await run(process.execPath, [file, ...args], { cwd: PACKAGE_ROOT, stdio: 'inherit' })
}

/** Poll the harness until it answers, so the capture never races the dev server. */
async function waitForPort(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // Not listening yet.
    }
    if (Date.now() > deadline) throw new Error(`build: ${url} never came up`)
    await new Promise(resolve => setTimeout(resolve, 250))
  }
}

let vite
try {
  if (!argv.includes('--skip-panel')) {
    console.log('== panel harness')
    vite = spawn(process.execPath, [VITE, '--config', 'video/panel/vite.config.mjs'], {
      cwd: PACKAGE_ROOT,
      stdio: ['ignore', 'ignore', 'inherit'],
    })
    await waitForPort(`http://127.0.0.1:${PORT}/`)
    await stage('capture widget states', `${VIDEO_ROOT}/scripts/capture-panel.mjs`)
  } else {
    console.log('== panel harness (skipped)')
  }

  await stage('narration', `${VIDEO_ROOT}/scripts/tts.mjs`)
  if (!argv.includes('--skip-frames')) {
    await stage('frames', `${VIDEO_ROOT}/scripts/frames.mjs`)
  } else {
    console.log('\n== frames (skipped)')
  }
  await stage('audio', `${VIDEO_ROOT}/scripts/audio.mjs`)
  await stage('subtitles', `${VIDEO_ROOT}/scripts/subtitles.mjs`)
  await stage('cover', `${VIDEO_ROOT}/scripts/cover.mjs`)
  await stage('encode', `${VIDEO_ROOT}/scripts/encode.mjs`)
} finally {
  if (vite !== undefined && vite.exitCode === null) {
    vite.kill('SIGTERM')
    console.log('\npanel harness stopped')
  }
}
