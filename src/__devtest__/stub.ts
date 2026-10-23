import { defineComponent, h } from 'vue'

/** 诊断用轻量占位组件：替换重型预览子组件，避免 harness 构建拉入 Univer / genoffice。 */
export default defineComponent({
  name: 'DevStub',
  props: {
    content: { type: String, default: '' },
    path: { type: String, default: '' },
    entry: { type: Object, default: null },
    viewer: { type: Object, default: null },
    readonly: { type: Boolean, default: false },
    dirty: { type: Boolean, default: false },
    basePath: { type: String, default: null }
  },
  setup: () => () => h('div', { class: 'dev-stub' })
})
