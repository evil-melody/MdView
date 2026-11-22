/** 内容自动换行：全局单例偏好，所有文档编辑器共用，localStorage 持久化 */
import { ref } from 'vue'

const KEY = 'mdview-wrap'

export const wrap = ref(localStorage.getItem(KEY) !== 'off')

export function setWrap(v: boolean) {
  wrap.value = v
  localStorage.setItem(KEY, v ? 'on' : 'off')
}
