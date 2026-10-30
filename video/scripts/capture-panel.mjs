/**
 * Capture the real widget's states as PNGs for the film.
 *
 * Runs against the Vite harness in `video/panel` and writes them to
 * `video/assets/`. Every state is reached through the widget's own affordances
 * (dock click, gear, completion event), so the pixels are the shipping
 * component rather than a redrawn lookalike.
 *
 * Usage: node video/scripts/capture-panel.mjs [--port 5198] [--out video/assets]
 *
 * @module dsh-task-notice/video/scripts/capture-panel
 */

import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
/** Playwright lives in the Harness checkout's store, not in this package. */
const PLAYWRIGHT = process.env.DSH_PLAYWRIGHT
  ?? '/Users/openSource/deepseek-harness/node_modules/.pnpm/playwright-core@1.61.1/node_modules/playwright-core/index.js'

const args = process.argv.slice(2)
/** Read one `--name value` argument. */
function arg(name, fallback) {
  const index = args.indexOf(`--${name}`)
  return index === -1 ? fallback : args[index + 1]
}

const PORT = Number(arg('port', '5198'))
const OUT = arg('out', fileURLToPath(new URL('../assets', import.meta.url)))
/** The workspace the widget is shown against. */
const VIEWPORT = { width: 1600, height: 1000 }
/** Retina capture: the film crops and scales these, so they need headroom. */
const SCALE = 2

const { chromium } = require(PLAYWRIGHT)

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({
  headless: true,
  args: ['--force-color-profile=srgb', '--font-render-hinting=none'],
})
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: SCALE })
page.on('pageerror', error => { console.error('[pageerror]', String(error).slice(0, 300)) })

/** Open the harness and wait for the dock's first paint. */
async function boot() {
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' })
  await page.evaluate(() => window.__notice.ready)
  await page.waitForTimeout(180)
}

/** Capture the whole workspace. */
async function workspace(name) {
  await page.waitForTimeout(120)
  await page.screenshot({ path: `${OUT}/${name}.png` })
  console.log(`  ${name}.png  ${VIEWPORT.width}x${VIEWPORT.height} (css px)`)
}

/** Capture one element after settling, and report its size. */
async function shot(name, selector) {
  await page.waitForTimeout(140)
  const target = page.locator(selector).first()
  const box = await target.boundingBox()
  await target.screenshot({ path: `${OUT}/${name}.png` })
  console.log(`  ${name}.png  ${Math.round(box?.width ?? 0)}x${Math.round(box?.height ?? 0)} (css px)`)
}

/** Hide the mock workspace for a clean component still. */
async function cleanStage() {
  await page.addStyleTag({
    content: '.app{visibility:hidden!important}body{background:#f7f8fa!important}',
  })
  await page.waitForTimeout(120)
}

// 1. The workspace with the dock: the film's opening context.
await boot()
await workspace('workspace-default')

// 2. The ledger and settings, cleanly cut out of the workspace.
await cleanStage()
await page.evaluate(() => window.__notice.open())
await shot('panel-ledger', '.dtn-panel')
await page.evaluate(() => window.__notice.settings())
await shot('panel-settings', '.dtn-panel')

// 3. The completion cards, as they arrive over the workspace.
await page.evaluate(() => window.__notice.back())
await page.evaluate(() => window.__notice.close())
await page.evaluate(() => window.__notice.pushCard('done'))
await page.evaluate(() => window.__notice.pushCard('failed'))
await shot('cards', '.dtn-cards')

// 4. The same workspace with the widget dragged to the lower-left; the panel
//    folds above it because there is no room below.
await page.evaluate(() => {
  window.localStorage.setItem('dsh-task-notice.position.v1', JSON.stringify({ right: 1300, top: 700 }))
})
await page.reload({ waitUntil: 'networkidle' })
await page.evaluate(() => window.__notice.ready)
await page.evaluate(() => window.__notice.open())
await workspace('workspace-dragged')

// 5. The same settings page after a drag: the reset control is live.
await page.addStyleTag({
  content: '.app{visibility:hidden!important}body{background:#f7f8fa!important}',
})
await page.evaluate(() => window.__notice.settings())
await shot('panel-settings-moved', '.dtn-panel')

await browser.close()
console.log(`captured widget states into ${OUT}`)
