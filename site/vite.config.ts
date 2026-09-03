import { execSync } from 'node:child_process'
import { constants as zlibConstants } from 'node:zlib'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { compression, defineAlgorithm } from 'vite-plugin-compression2'

/** Text-ish output worth a pre-compressed sibling. */
const COMPRESSIBLE = /\.(css|json|webmanifest|js|mjs|cjs|map|svg|wasm|txt|xml)$/i

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
  plugins: [
    // Costs 2.5 kB brotli here. The scroll loop writes the DOM directly, so the
    // only render this covers is the language switch.
    react({ compiler: true }),
    // nginx sendfile()s these instead of compressing per request.
    compression({
      include: [COMPRESSIBLE],
      // prerender.tsx rewrites the HTML after this pass and compresses it there;
      // a sibling written now would go stale. Fonts and images are already packed.
      exclude: [/\.html$/i, /\.(br|gz|woff2?|png|jpe?g|webp|avif|ico)$/i],
      threshold: 1024,
      skipIfLargerOrEqual: true,
      deleteOriginalAssets: false,
      // The origin nginx has gzip_static and ngx_brotli, no zstd_static.
      algorithms: [
        defineAlgorithm('brotliCompress', {
          params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 },
        }),
        defineAlgorithm('gzip', { level: 9 }),
      ],
    }),
  ],
})
