/**
 * Vite setup for the capture harness.
 *
 * The plugin does not depend on Vite directly (Vitest brings it into the store),
 * so the config stays a plain object rather than importing `defineConfig` from
 * a bare specifier that this package cannot resolve.
 *
 * `DSH_SRC` points at the Harness checkout whose theme tokens the widget's
 * stylesheet reads; it defaults to the checkout this plugin was developed
 * against.
 */

import { fileURLToPath } from 'node:url'

const DSH_SRC = process.env.DSH_SRC ?? '/Users/openSource/deepseek-harness'
const here = fileURLToPath(new URL('.', import.meta.url))

export default {
  root: here,
  resolve: {
    alias: {
      '@dsh-theme': `${DSH_SRC}/packages/client/ui-theme/src/styles`,
    },
  },
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
  server: {
    host: '127.0.0.1',
    port: Number(process.env.PANEL_PORT ?? 5198),
    strictPort: true,
    fs: { allow: [fileURLToPath(new URL('../..', import.meta.url)), DSH_SRC] },
  },
}
