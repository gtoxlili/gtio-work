import { execSync } from 'node:child_process'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/** Stamped into the console note, so a screenshot names its build. */
function buildVersion(): string {
  try {
    return execSync('git describe --tags --always --dirty', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return 'dev'
  }
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(buildVersion()),
  },
  build: {
    target: 'baseline-widely-available',
    minify: 'oxc',
    cssMinify: 'lightningcss',
    sourcemap: false,
  },
  server: {
    forwardConsole: {
      unhandledErrors: true,
      logLevels: ['warn', 'error'],
    },
  },
  // Cloudflare compresses the published assets at the edge.
  plugins: [react({ compiler: true })],
})
