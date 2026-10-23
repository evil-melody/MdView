/**
 * 临时诊断入口（用后即删）：在真实浏览器中执行 harness，并把结果写进 DOM，
 * 供 `chrome --headless --dump-dom` 抓取。
 */
import '../styles/global.css'
import '../components/PreviewPane.css'
import '../components/ConvertMenu.css'
import { run } from './harness'

// 结果输出用 fixed 定位，避免占据文档流把被测布局挤出视口（否则命中测试落空）
const pre = document.createElement('pre')
pre.id = 'RESULT'
pre.style.cssText =
  'position:fixed;left:0;bottom:0;z-index:999999;margin:0;padding:4px;' +
  'max-width:100vw;max-height:45vh;overflow:auto;background:#fff;color:#000;font-size:10px'
document.body.appendChild(pre)

run()
  .then((r) => {
    pre.textContent = 'RESULT_JSON=' + JSON.stringify(r)
  })
  .catch((e) => {
    pre.textContent = 'RESULT_JSON=' + JSON.stringify({ fatal: String(e), stack: String((e as Error)?.stack || '') })
  })
