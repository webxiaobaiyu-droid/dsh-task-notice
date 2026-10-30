#!/usr/bin/env node
/**
 * Link the DeepSeek Harness host packages this plugin is built against.
 *
 * The plugin's TypeScript and its tests import `@deepseek-ai/*` type surfaces
 * that the harness owns. Those packages are workspace packages of the harness,
 * not published artifacts, so a checkout of the harness is the only way to
 * obtain them. This script points this repo's `node_modules/@deepseek-ai/*` at
 * that checkout. It is a development-only step: the shipped `lib/` artifact
 * resolves the same packages from the host process at runtime.
 *
 * Usage:
 *   pnpm run link:host -- --src /path/to/deepseek-harness
 *   DSH_SRC=/path/to/deepseek-harness pnpm run link:host
 *
 * Re-run after every `pnpm install`, which prunes the links as extraneous.
 *
 * @module dsh-task-notice/scripts/link-host-packages
 */

import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Every host package this plugin imports, keyed by the specifier's package name
 * and valued by the package's directory inside the harness checkout.
 *
 * @type {Readonly<Record<string, string>>}
 */
const HOST_PACKAGES = {
  'cordis': 'vendor/cordis',
  'dsh-client-locale': 'packages/client/locale',
  'dsh-client-ui-layout': 'packages/client/ui-layout',
  'dsh-client-ui-renderer': 'packages/client/ui-renderer',
  'dsh-client-ui-slots': 'packages/client/ui-slots',
  'dsh-session': 'packages/core/session',
  'dsh-session-title': 'packages/session/session-title',
}

/** Read `--src <path>` from argv, or `$DSH_SRC`. */
function sourceRootFromEnv() {
  const argv = process.argv.slice(2)
  const at = argv.indexOf('--src')
  const fromArgv = at >= 0 ? argv[at + 1] : undefined
  const candidate = fromArgv ?? process.env.DSH_SRC
  if (candidate === undefined || candidate.trim() === '') {
    console.error('link-host-packages: pass --src <deepseek-harness checkout> or set DSH_SRC')
    process.exit(1)
  }
  return resolve(candidate)
}

/** Fail with a readable message unless the checkout looks like the right one. */
function assertCheckout(root) {
  for (const relative of Object.values(HOST_PACKAGES)) {
    if (!existsSync(join(root, relative, 'package.json'))) {
      console.error(`link-host-packages: ${join(root, relative)} is not a package`)
      process.exit(1)
    }
  }
}

/** Point one `node_modules/@deepseek-ai/<name>` at the checkout. */
function link(root, name, relative) {
  const scope = join(REPO_ROOT, 'node_modules', '@deepseek-ai')
  mkdirSync(scope, { recursive: true })
  const target = join(scope, name)
  if (lstatSync(target, { throwIfNoEntry: false }) !== undefined) rmSync(target, { force: true, recursive: true })
  symlinkSync(join(root, relative), target, 'dir')
  const manifest = JSON.parse(readFileSync(join(root, relative, 'package.json'), 'utf8'))
  console.log(`  ${manifest.name} -> ${join(root, relative)}`)
}

const root = sourceRootFromEnv()
assertCheckout(root)
console.log(`link-host-packages: linking from ${root}`)
for (const [name, relative] of Object.entries(HOST_PACKAGES)) link(root, name, relative)
console.log('link-host-packages: done')
