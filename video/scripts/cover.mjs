/**
 * Render the upload cover at 2x from the same captures as the film.
 *
 * Usage: node video/scripts/cover.mjs
 *
 * @module dsh-task-notice/video/scripts/cover
 */

import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const PLAYWRIGHT = process.env.DSH_PLAYWRIGHT
  ?? '/Users/openSource/deepseek-harness/node_modules/.pnpm/playwright-core@1.61.1/node_modules/playwright-core/index.js'
const { chromium } = require(PLAYWRIGHT)

const VIDEO_ROOT = fileURLToPath(new URL('..', import.meta.url))
await mkdir(`${VIDEO_ROOT}/out`, { recursive: true })

const COVERS = [
  { html: 'cover.html', width: 1920, height: 1080, out: 'dsh-task-notice-cover-16x9.png' },
  { html: 'cover-4x3.html', width: 1600, height: 1200, out: 'dsh-task-notice-cover-4x3.png' },
]

const browser = await chromium.launch({ headless: true, args: ['--force-color-profile=srgb'] })
for (const cover of COVERS) {
  const page = await browser.newPage({
    viewport: { width: cover.width, height: cover.height },
    deviceScaleFactor: 2,
  })
  await page.goto(`file://${VIDEO_ROOT}/film/${cover.html}`, { waitUntil: 'load' })
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${VIDEO_ROOT}/out/${cover.out}` })
  await page.close()
  console.log(`cover: ${VIDEO_ROOT}/out/${cover.out} (${cover.width * 2}x${cover.height * 2} PNG)`)
}
await browser.close()
