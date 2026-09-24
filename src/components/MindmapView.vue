<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch, nextTick } from 'vue'
import { Transformer } from 'markmap-lib'
import { Markmap } from 'markmap-view'

const props = defineProps<{ content: string }>()
const host = ref<SVGSVGElement | null>(null)
let mm: Markmap | null = null

const transformer = new Transformer()

function render() {
  if (!host.value) return
  const { root } = transformer.transform(props.content || '# (空文档)')
  if (!mm) {
    mm = Markmap.create(host.value, {
      duration: 250,
      spacingVertical: 8,
      spacingHorizontal: 80,
      paddingX: 12
    })
  }
  mm.setData(root)
  mm.fit()
}

onMounted(async () => {
  await nextTick()
  render()
})

watch(
  () => props.content,
  async () => {
    await nextTick()
    render()
  }
)

onBeforeUnmount(() => {
  mm?.destroy()
  mm = null
})
</script>

<template>
  <div class="mm-wrap scrollable">
    <svg ref="host" class="mm-svg"></svg>
  </div>
</template>

<style src="./MindmapView.css"></style>
