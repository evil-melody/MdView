/**
 * Bundles probe-images.ts with the same aliases as build.mjs.
 *   node scripts/docx-verify/probe-build.mjs
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
  entryPoints: [join(OUT, 'probe-56.ts')],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  outfile: join(OUT, 'probe-56.cjs'),
  plugins: [genofficePlugin],
  external: ['jsdom', 'jszip'],
  nodePaths: [join(ROOT, 'node_modules')],
  logLevel: 'warning',
})

console.log('[probe] bundled ->', join(OUT, 'probe-images.cjs'))
