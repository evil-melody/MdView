/**
 * One-time codemod for the vendored GenOffice sources under src/vendor/genoffice.
 *
 * GenOffice's pptx-engine/pptx-render are written for Node + Electron and reference the
 * free `Buffer` identifier in ~100 places (archive reads/writes, base64 transport, utf8
 * conversion). In a browser bundle that identifier does not exist.
 *
 * We deliberately do NOT polyfill `globalThis.Buffer`: JSZip computes
 * `support.nodebuffer = typeof Buffer !== 'undefined'` at module init, so a global shim
 * silently routes zip decoding down Node-only branches and yields an EMPTY archive
 * (symptom: "missing ppt/presentation.xml", zero slides). Instead each vendored module
 * gets an explicit local import of our shim, which shadows nothing outside that module.
 *
 * It also prepends `// @ts-nocheck` to every vendored file: the packages are type-checked by
 * their own tsconfig in the upstream repo, and re-checking tens of thousands of lines against
 * MdView's compiler options produces noise about third-party code we never edit. The exported
 * types still flow into our code normally.
 *
 * Re-run after re-vendoring:  node scripts/vendor-genoffice-shim.mjs
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const VENDOR = join(ROOT, 'src/vendor/genoffice')
const SHIM = join(ROOT, 'src/pptx/shims/buffer.ts')
const MARKER = '/* genoffice-buffer-shim */'

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (p.endsWith('.ts')) out.push(p)
  }
  return out
}

let patched = 0
let typed = 0
for (const file of walk(VENDOR)) {
  let src = readFileSync(file, 'utf8')
  if (src.startsWith('// @ts-nocheck')) continue
  let changed = false
  // Word-boundary match skips ArrayBuffer / SharedArrayBuffer (no boundary between y and B).
  if (/\bBuffer\b/.test(src) && !/^\s*import[^\n]*\bBuffer\b/m.test(src)) {
    let rel = relative(dirname(file), SHIM).replace(/\.ts$/, '').replace(/\\/g, '/')
    if (!rel.startsWith('.')) rel = './' + rel
    src = `import { Buffer } from '${rel}' ${MARKER}\n${src}`
    changed = true
    patched += 1
  }
  src = `// @ts-nocheck\n${src}`
  typed += 1
  if (changed || typed) writeFileSync(file, src)
}
console.log(`[vendor-genoffice-shim] buffer imports: ${patched} · @ts-nocheck: ${typed}`)
