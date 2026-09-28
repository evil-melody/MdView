import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'], usePolling: false }
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
      '@univerjs/sheets-numfmt'
    ]
  },
  build: {
    target: 'es2021',
    minify: 'esbuild',
    rollupOptions: {
      output: {
        // 重型依赖拆独立 chunk：office 编辑器（Univer/canvas-editor/exceljs）不进主包
        manualChunks(id) {
          if (id.includes('node_modules')) {
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
