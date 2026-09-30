import esbuild from 'esbuild'
import { readFileSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'

const GEN = '/tmp/genoffice/packages'

const genofficePlugin = {
  name: 'genoffice-src',
  setup(build) {
    build.onResolve({ filter: /^@genoffice\// }, (args) => {
      // "@genoffice/pptx-engine" | "@genoffice/pptx-engine/table-grid" → package src tree
      const rest = args.path.slice('@genoffice/'.length)
      const slash = rest.indexOf('/')
      const pkg = slash === -1 ? rest : rest.slice(0, slash)
      const sub = slash === -1 ? 'index' : rest.slice(slash + 1)
      return { path: `${GEN}/${pkg}/src/${sub}.ts` }
    })
    build.onResolve({ filter: /^node:(crypto|zlib|fs|stream\/promises)$/ }, () => ({
      path: '/tmp/pptx-spike/src/node-shims.ts',
    }))
    // Scope the Buffer shim to GenOffice sources only. Injecting it globally (esbuild
    // `inject`) flips JSZip's `support.nodebuffer` to true in the browser, which routes
    // zip decoding down Node-only branches and yields an EMPTY archive.
    build.onLoad({ filter: /genoffice\/packages\/.*\/src\/.*\.ts$/ }, async (args) => {
      const src = await readFile(args.path, 'utf8')
      if (!/\bBuffer\b/.test(src) || /^\s*(import|const|let|var)[^\n]*\bBuffer\b/m.test(src)) {
        return { contents: src, loader: 'ts' }
      }
      return {
        contents:
          "import { Buffer as __NodeBufferShim } from '/tmp/pptx-spike/src/buffer-shim'\nconst Buffer = __NodeBufferShim\n" +
          src,
        loader: 'ts',
        resolveDir: args.resolveDir,
      }
    })
  },
}

await esbuild.build({
  entryPoints: ['/tmp/pptx-spike/src/main.ts'],
  bundle: true,
  format: 'iife',
  target: 'es2022',
  outfile: '/tmp/pptx-spike/spike.js',
  plugins: [genofficePlugin],
  nodePaths: ['/tmp/pptx-spike/node_modules'],
  logLevel: 'warning',
})

// Ship as HTML + sibling JS (not inlined): headless verification could not observe the
// async chain of a 940KB inline script reliably, and a sibling file keeps the page light.
const tpl = readFileSync('/tmp/pptx-spike/index.tpl.html', 'utf8')
writeFileSync(
  '/tmp/pptx-spike/out/genoffice-pptx-spike.html',
  tpl.replace('{{SPIKE_JS}}', '').replace('</body>', '<script src="./spike.js"></script>\n</body>'),
)
console.log('bundled -> /tmp/pptx-spike/out/genoffice-pptx-spike.html (+ spike.js)')

// Browser-path harness: standalone page that auto-loads a pptx via fetch (needs
// --allow-file-access-from-files when opened over file://) and exposes window.__pptxSpike.
await esbuild.build({
  entryPoints: ['/tmp/pptx-spike/src/browser-test.ts'],
  bundle: true,
  format: 'iife',
  target: 'es2022',
  outfile: '/tmp/pptx-spike/out/browser-test.js',
  plugins: [genofficePlugin],
  nodePaths: ['/tmp/pptx-spike/node_modules'],
  logLevel: 'warning',
})

const harness = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<title>browser-test</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; padding:16px; background:#141414; color:#ddd; font:13px/1.5 -apple-system,"PingFang SC",sans-serif; }
  #app { max-width:960px; margin:0 auto; }
  .slide { margin:20px 0; }
  .tag { color:#888; font-size:12px; margin-bottom:4px; }
  .canvas { border:1px solid #333; background:#fff; line-height:0; }
  .canvas > svg { width:100%; height:auto; display:block; }
  #log { white-space:pre-wrap; background:#1b1b1b; border:1px solid #333; border-radius:6px; padding:10px; font-family:ui-monospace,monospace; font-size:11px; max-height:180px; overflow:auto; }
</style>
</head><body>
<div id="log"></div>
<div id="app"></div>
<script src="./browser-test.js?v=${Date.now()}"></script>
</body></html>`
writeFileSync('/tmp/pptx-spike/out/browser-test.html', harness)
console.log('bundled -> /tmp/pptx-spike/out/browser-test.{js,html}')
