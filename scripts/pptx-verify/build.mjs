/**
 * Bundles the pptx verification harness with the SAME aliases as vite.config.ts, so the harness
 * exercises the shipped modules (incl. the vendored GenOffice sources + node shims) rather than a
 * separate copy. Output lands in spikes/genoffice-pptx/verify/ and is driven by headless Chrome.
 *
 *   node scripts/pptx-verify/build.mjs [pptx ...]
 *
 * Any pptx paths passed are copied next to the harness as sample-1.pptx, sample-2.pptx … so the
 * page can fetch them over file:// with --allow-file-access-from-files.
 */
import { build } from 'esbuild'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

const ROOT = resolve(new URL('../..', import.meta.url).pathname)
const OUT = join(ROOT, 'spikes/genoffice-pptx/verify')
mkdirSync(OUT, { recursive: true })

const GEN = join(ROOT, 'src/vendor/genoffice')
const NODE_SHIM = join(ROOT, 'src/pptx/shims/node.ts')

/** Mirrors vite.config.ts resolve.alias. */
const genofficePlugin = {
  name: 'genoffice-aliases',
  setup(b) {
    b.onResolve({ filter: /^@genoffice\/pptx-engine$/ }, () => ({
      path: join(GEN, 'pptx-engine/src/index.ts')
    }))
    b.onResolve({ filter: /^@genoffice\/pptx-engine\// }, (a) => ({
      path: join(GEN, 'pptx-engine/src', a.path.slice('@genoffice/pptx-engine/'.length).replace(/\.ts$/, '') + '.ts')
    }))
    b.onResolve({ filter: /^@genoffice\/pptx-render$/ }, () => ({
      path: join(GEN, 'pptx-render/src/index.ts')
    }))
    b.onResolve({ filter: /^@genoffice\/pptx-render\// }, (a) => ({
      path: join(GEN, 'pptx-render/src', a.path.slice('@genoffice/pptx-render/'.length).replace(/\.ts$/, '') + '.ts')
    }))
    b.onResolve({ filter: /^@genoffice\/pptx-ops$/ }, () => ({
      path: join(GEN, 'pptx-ops/src/index.ts')
    }))
    b.onResolve({ filter: /^@genoffice\/pptx-ops\// }, (a) => ({
      path: join(GEN, 'pptx-ops/src', a.path.slice('@genoffice/pptx-ops/'.length).replace(/\.ts$/, '') + '.ts')
    }))
    b.onResolve({ filter: /^node:(crypto|zlib|fs|fs\/promises|stream|stream\/promises)$/ }, () => ({
      path: NODE_SHIM
    }))
    /**
     * Vite 的 `?raw` 导入（pptx-ops 用它把 prompts/ops/*.md 内联成 op 文档）。esbuild 没有
     * 这个后缀语义，等价物是 text loader，所以这里补一个 namespace 把它接住。
     */
    b.onResolve({ filter: /\?raw$/ }, (a) => ({
      path: resolve(dirname(a.importer), a.path.replace(/\?raw$/, '')),
      namespace: 'raw'
    }))
    b.onLoad({ filter: /.*/, namespace: 'raw' }, (a) => ({
      contents: readFileSync(a.path, 'utf8'),
      loader: 'text'
    }))
  }
}

const tpl = (name) => `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"/><title>${name}</title>
<style>
  body { margin:0; padding:20px 24px; background:#f5f6f8; font:14px/1.5 -apple-system,"PingFang SC",sans-serif; color:#222 }
  h1 { font-size:15px; margin:0 0 16px }
  .slide svg { display:block; width:100%; height:auto }
  pre { background:#111; color:#9f9; padding:14px; border-radius:8px; font-size:11px; overflow:auto; max-height:420px }
  a { color:#06c }
</style></head>
<body>
<h1>MdView pptx render verification — ${name}</h1>
<p><a href="?src=./sample.pptx&w=1280">sample.pptx</a></p>
<div id="out"></div>
<script src="./render.js?v=${Date.now()}"></script>
</body></html>`

await build({
  entryPoints: [join(ROOT, 'scripts/pptx-verify/render-entry.ts')],
  bundle: true,
  format: 'iife',
  target: 'es2022',
  outfile: join(OUT, 'render.js'),
  plugins: [genofficePlugin],
  nodePaths: [join(ROOT, 'node_modules')],
  logLevel: 'warning'
})

writeFileSync(join(OUT, 'index.html'), tpl('generic'))
writeFileSync(join(OUT, 'view.html'), tpl('generic-view'))

const extra = process.argv.slice(2)
extra.forEach((p, i) => {
  const dest = i === 0 ? 'sample.pptx' : `sample-${i + 1}.pptx`
  copyFileSync(p, join(OUT, dest))
  console.log(`[verify] ${basename(p)} -> ${dest}`)
})

// report the bundle size so regressions in the engine payload are visible
console.log(`[verify] bundle ${(readFileSync(join(OUT, 'render.js')).length / 1024).toFixed(0)} kB -> ${OUT}`)
