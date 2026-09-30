import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

const resolvePath = (p: string) => fileURLToPath(new URL(p, import.meta.url))

const GENOFFICE_ENGINE = resolvePath('./src/vendor/genoffice/pptx-engine/src/')
const GENOFFICE_RENDER = resolvePath('./src/vendor/genoffice/pptx-render/src/')
const GENOFFICE_OPS = resolvePath('./src/vendor/genoffice/pptx-ops/src/')
const GENOFFICE_DOCX = resolvePath('./src/vendor/genoffice/docx-engine/src/')
const GENOFFICE_ZIPGATE = resolvePath('./src/vendor/genoffice/zip-gate/src/')
const NODE_SHIM = resolvePath('./src/pptx/shims/node.ts')

export default defineConfig({
  plugins: [vue()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'], usePolling: false }
  },
  resolve: {
    /**
     * GenOffice office engines are vendored as TypeScript sources (Apache-2.0, see
     * src/vendor/genoffice/NOTICE) and compiled by Vite like first-party code:
     *  - `@genoffice/*`      -> src/vendor/genoffice/*  (their internal cross-imports use
     *                           these bare specifiers, so both root and subpath forms alias)
     *  - `node:*`            -> src/pptx/shims/node.ts (createHash/randomUUID/deflateSync;
     *                           node:fs + node:stream/promises back savePptxToFile, which
     *                           MdView never calls — it writes through the Tauri fs layer)
     */
    alias: [
      { find: /^@genoffice\/pptx-engine$/, replacement: resolvePath('./src/vendor/genoffice/pptx-engine/src/index.ts') },
      { find: /^@genoffice\/pptx-engine\/(.*)$/, replacement: `${GENOFFICE_ENGINE}$1` },
      { find: /^@genoffice\/pptx-render$/, replacement: resolvePath('./src/vendor/genoffice/pptx-render/src/index.ts') },
      { find: /^@genoffice\/pptx-render\/(.*)$/, replacement: `${GENOFFICE_RENDER}$1` },
      { find: /^@genoffice\/pptx-ops$/, replacement: resolvePath('./src/vendor/genoffice/pptx-ops/src/index.ts') },
      { find: /^@genoffice\/pptx-ops\/(.*)$/, replacement: `${GENOFFICE_OPS}$1` },
      { find: /^@genoffice\/docx-engine$/, replacement: resolvePath('./src/vendor/genoffice/docx-engine/src/index.ts') },
      { find: /^@genoffice\/docx-engine\/(.*)$/, replacement: `${GENOFFICE_DOCX}$1` },
      { find: /^@genoffice\/zip-gate$/, replacement: resolvePath('./src/vendor/genoffice/zip-gate/src/index.ts') },
      { find: /^@genoffice\/zip-gate\/(.*)$/, replacement: `${GENOFFICE_ZIPGATE}$1` },
      { find: /^node:(crypto|zlib|fs|fs\/promises|stream|stream\/promises)$/, replacement: NODE_SHIM }
    ]
  },
  /**
   * dev 模式依赖预构建：Univer 全家桶（presets/docs/docs-ui/ui/engine-render/slides/slides-ui）
   * 单个包压缩后 2~13MB，不显式预构建时 vite 会在首屏逐个转译，表现为编辑器挂载失败/长时间白屏。
   */
  optimizeDeps: {
    include: [
      '@univerjs/presets',
      '@univerjs/core',
      '@univerjs/core/facade',
      '@univerjs/engine-render',
      '@univerjs/docs',
      '@univerjs/docs-ui',
      '@univerjs/ui',
      '@univerjs/slides',
      '@univerjs/slides-ui',
      '@univerjs/sheets-ui',
      '@univerjs/sheets-formula',
      '@univerjs/sheets-numfmt',
      'jszip',
      'fast-xml-parser',
      'opentype.js',
      'bidi-js'
    ]
  },
  build: {
    target: 'es2021',
    minify: 'esbuild',
    rollupOptions: {
      output: {
        // 重型依赖拆独立 chunk：office 编辑器（Univer/canvas-editor/exceljs）不进主包
        manualChunks(id) {
          // GenOffice pptx 引擎（vendored 源码 + 其运行期依赖）单独成 chunk，不拖主包
          if (id.includes('/src/vendor/genoffice/')) return 'pptx-engine'
          if (id.includes('node_modules')) {
            if (id.includes('opentype.js') || id.includes('bidi-js')) return 'pptx-engine'
            if (id.includes('@univerjs') || id.includes('echarts')) return 'univer'
            if (id.includes('@hufe921/canvas-editor')) return 'canvas-editor'
            if (id.includes('exceljs')) return 'exceljs'
            if (id.includes('mammoth')) return 'mammoth'
            if (id.includes('xlsx')) return 'xlsx'
            if (id.includes('fflate')) return 'fflate'
          }
        }
      }
    }
  },
  envPrefix: ['VITE_', 'TAURI_']
})
