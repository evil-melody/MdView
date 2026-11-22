/**
 * Bundles the docx byte-fidelity harness with the SAME aliases as vite.config.ts so it exercises
 * the shipped vendored GenOffice sources. jsdom + jszip stay external (resolved from node_modules
 * at runtime via NODE_PATH); node builtins resolve natively under platform:'node'.
 *
 *   node scripts/docx-verify/build.mjs
 */
import { build } from 'esbuild'
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const ROOT = resolve(new URL('../..', import.meta.url).pathname)
const OUT = join(ROOT, 'scripts/docx-verify')
mkdirSync(OUT, { recursive: true })

const GEN = join(ROOT, 'src/vendor/genoffice')

const genofficePlugin = {
  name: 'genoffice-aliases',
  setup(b) {
    b.onResolve({ filter: /^@genoffice\/docx-engine$/ }, () => ({ path: join(GEN, 'docx-engine/src/index.ts') }))
    b.onResolve({ filter: /^@genoffice\/docx-engine\// }, (a) => ({
      path: join(GEN, 'docx-engine/src', a.path.slice('@genoffice/docx-engine/'.length).replace(/\.ts$/, '') + '.ts'),
    }))
    b.onResolve({ filter: /^@genoffice\/zip-gate$/ }, () => ({ path: join(GEN, 'zip-gate/src/index.ts') }))
    b.onResolve({ filter: /^@genoffice\/zip-gate\// }, (a) => ({
      path: join(GEN, 'zip-gate/src', a.path.slice('@genoffice/zip-gate/'.length).replace(/\.ts$/, '') + '.ts'),
    }))
    // vite `?raw` 内联（docx-engine 某些模块可能用到）
    b.onResolve({ filter: /\?raw$/ }, (a) => ({
      path: resolve(dirname(a.importer), a.path.replace(/\?raw$/, '')),
      namespace: 'raw',
    }))
    b.onLoad({ filter: /.*/, namespace: 'raw' }, (a) => ({
      contents: readFileSync(a.path, 'utf8'),
      loader: 'text',
    }))
  },
}

await build({
  entryPoints: [join(OUT, 'harness.ts')],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  outfile: join(OUT, 'harness.cjs'),
  plugins: [genofficePlugin],
  external: ['jsdom', 'jszip'],
  nodePaths: [join(ROOT, 'node_modules')],
  logLevel: 'warning',
})

console.log('[docx-verify] bundled ->', join(OUT, 'harness.cjs'))
