import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] }
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
