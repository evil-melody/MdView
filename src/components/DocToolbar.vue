<script setup lang="ts">
/**
 * Word Ribbon 风格工具栏（docx 编辑器共用外壳）。
 * 选项卡「开始 / 插入」+ 分组（撤销、字体、段落、样式 / 分隔符、内容块），
 * 按钮视觉对齐 Office：SVG 图标 + 分组竖线 + 组名标签。
 * 所有动作仍通过事件上抛，执行与状态刷新由 useOfficeToolbar 负责。
 */
import { ref } from 'vue'

defineProps<{
  fontSizes: { label: string; value: string }[]
  activeFormats: Record<string, boolean>
  fontFamily: string
  fontSize: string
}>()

const emit = defineEmits<{
  (e: 'exec', cmd: string, value: string | null): void
  (e: 'font', name: string): void
  (e: 'size', value: string): void
  (e: 'color', hex: string): void
  (e: 'hilite', hex: string): void
}>()

function ex(cmd: string, value: string | null = null) {
  closePalette()
  emit('exec', cmd, value)
}

const FONTS = [
  '等线', '微软雅黑', '宋体', '黑体', '楷体', '仿宋',
  'Arial', 'Calibri', 'Times New Roman', 'Consolas',
]

const tab = ref<'home' | 'insert'>('home')

/* ---- 字体颜色 / 高亮：Word 式主色直点 + 调色板弹出 ---- */
const lastColor = ref('#c00000')
const lastHilite = ref('#ffff00')
const palette = ref<'' | 'color' | 'hilite'>('')

const PALETTE: string[] = [
  '#000000', '#7f7f7f', '#880015', '#ed1c24', '#ff7f27', '#fff200', '#22b14c', '#00a2e8', '#3f48cc', '#a349a4',
  '#ffffff', '#c3c3c3', '#b97a57', '#ffaec9', '#ffc90e', '#efe4b0', '#b5e61d', '#99d9ea', '#7092be', '#c8bfe7',
]

function togglePalette(which: 'color' | 'hilite') {
  palette.value = palette.value === which ? '' : which
}
function closePalette() {
  palette.value = ''
}
function pickColor(hex: string) {
  lastColor.value = hex
  palette.value = ''
  emit('color', hex)
}
function pickHilite(hex: string) {
  lastHilite.value = hex
  palette.value = ''
  emit('hilite', hex)
}
</script>

<template>
  <div class="dtb">
    <!-- 选项卡条 -->
    <div class="dtb-tabs">
      <button class="dtb-tab" :class="{ on: tab === 'home' }" @mousedown.prevent @click="tab = 'home'; closePalette()">开始</button>
      <button class="dtb-tab" :class="{ on: tab === 'insert' }" @mousedown.prevent @click="tab = 'insert'; closePalette()">插入</button>
    </div>

    <!-- ===== 开始 ===== -->
    <div v-show="tab === 'home'" class="dtb-panel">
      <!-- 撤销 -->
      <div class="dtb-group">
        <div class="dtb-row">
          <button class="dtb-btn" title="撤销" @mousedown.prevent @click="ex('undo')">
            <svg viewBox="0 0 16 16"><path d="M6.5 3 3 6.5 6.5 10" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 6.5h6a4 4 0 0 1 0 8H7" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
          </button>
          <button class="dtb-btn" title="重做" @mousedown.prevent @click="ex('redo')">
            <svg viewBox="0 0 16 16"><path d="M9.5 3 13 6.5 9.5 10" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M13 6.5H7a4 4 0 0 0 0 8h2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
          </button>
        </div>
      </div>

      <!-- 字体 -->
      <div class="dtb-group">
        <div class="dtb-row">
          <select class="dtb-sel dtb-sel-font" title="字体" :value="fontFamily" @mousedown.stop @change="emit('font', ($event.target as HTMLSelectElement).value); closePalette()">
            <option value="">+正文</option>
            <option v-for="f in FONTS" :key="f" :value="f" :style="{ fontFamily: f }">{{ f }}</option>
          </select>
          <select class="dtb-sel dtb-sel-size" title="字号" :value="fontSize" @mousedown.stop @change="emit('size', ($event.target as HTMLSelectElement).value); closePalette()">
            <option value="">字号</option>
            <option v-for="s in fontSizes" :key="s.value" :value="s.value">{{ s.label }}</option>
          </select>
          <button class="dtb-btn dtb-wide" :class="{ on: activeFormats.bold }" title="加粗" @mousedown.prevent @click="ex('bold')"><b>B</b></button>
          <button class="dtb-btn dtb-wide" :class="{ on: activeFormats.italic }" title="斜体" @mousedown.prevent @click="ex('italic')"><i>I</i></button>
          <button class="dtb-btn dtb-wide" :class="{ on: activeFormats.underline }" title="下划线" @mousedown.prevent @click="ex('underline')"><u>U</u></button>
          <button class="dtb-btn dtb-wide" :class="{ on: activeFormats.strikeThrough }" title="删除线" @mousedown.prevent @click="ex('strikeThrough')"><s>S</s></button>
          <!-- 字体颜色：主色直点，箭头开调色板 -->
          <span class="dtb-split" @mousedown.stop>
            <button class="dtb-btn dtb-colorbtn" title="字体颜色" @mousedown.prevent @click="pickColor(lastColor)">
              <span class="dtb-a">A</span><span class="dtb-bar" :style="{ background: lastColor }"></span>
            </button>
            <button class="dtb-btn dtb-caret" title="字体颜色（更多）" @mousedown.prevent @click="togglePalette('color')">▾</button>
            <div v-if="palette === 'color'" class="dtb-palette">
              <button v-for="c in PALETTE" :key="c" class="dtb-swatch" :style="{ background: c }" @mousedown.prevent @click="pickColor(c)"></button>
            </div>
          </span>
          <!-- 高亮 -->
          <span class="dtb-split" @mousedown.stop>
            <button class="dtb-btn dtb-colorbtn" title="文本突出显示" @mousedown.prevent @click="pickHilite(lastHilite)">
              <svg viewBox="0 0 16 16"><path d="m9.2 3.2 3.6 3.6-5.4 5.4H3.8V8.6z" fill="currentColor" opacity=".85"/><path d="M3 13.6h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
              <span class="dtb-bar" :style="{ background: lastHilite }"></span>
            </button>
            <button class="dtb-btn dtb-caret" title="突出显示（更多）" @mousedown.prevent @click="togglePalette('hilite')">▾</button>
            <div v-if="palette === 'hilite'" class="dtb-palette">
              <button v-for="c in PALETTE" :key="c" class="dtb-swatch" :style="{ background: c }" @mousedown.prevent @click="pickHilite(c)"></button>
            </div>
          </span>
          <button class="dtb-btn dtb-wide" title="清除格式" @mousedown.prevent @click="ex('removeFormat')">
            <svg viewBox="0 0 16 16"><path d="M10.5 2.5 6 7l3 3 4.5-4.5z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M6 7 3.5 9.5 6.5 12.5 9 10" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M5 13.5h8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
          </button>
          <button class="dtb-btn dtb-wide" title="上标" @mousedown.prevent @click="ex('superscript')">x²</button>
          <button class="dtb-btn dtb-wide" title="下标" @mousedown.prevent @click="ex('subscript')">x₂</button>
        </div>
        <div class="dtb-label">字体</div>
      </div>

      <!-- 段落 -->
      <div class="dtb-group">
        <div class="dtb-row">
          <button class="dtb-btn" :class="{ on: activeFormats.insertUnorderedList }" title="项目符号" @mousedown.prevent @click="ex('insertUnorderedList')">
            <svg viewBox="0 0 16 16"><circle cx="3.2" cy="4" r="1.2" fill="currentColor"/><circle cx="3.2" cy="8" r="1.2" fill="currentColor"/><circle cx="3.2" cy="12" r="1.2" fill="currentColor"/><path d="M6.5 4h7M6.5 8h7M6.5 12h7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
          </button>
          <button class="dtb-btn" :class="{ on: activeFormats.insertOrderedList }" title="编号" @mousedown.prevent @click="ex('insertOrderedList')">
            <svg viewBox="0 0 16 16"><text x="1" y="5.6" font-size="5" fill="currentColor">1.</text><text x="1" y="10.6" font-size="5" fill="currentColor">2.</text><text x="1" y="15.4" font-size="5" fill="currentColor">3.</text><path d="M7.5 4h6.5M7.5 8h6.5M7.5 12h6.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
          </button>
          <button class="dtb-btn" title="减少缩进" @mousedown.prevent @click="ex('outdent')">
            <svg viewBox="0 0 16 16"><path d="M3 4h10M8 8h5M3 12h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M6 5.8 3.8 8 6 10.2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <button class="dtb-btn" title="增加缩进" @mousedown.prevent @click="ex('indent')">
            <svg viewBox="0 0 16 16"><path d="M3 4h10M8 8h5M3 12h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M4 5.8 6.2 8 4 10.2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <span class="dtb-vsep"></span>
          <button class="dtb-btn" :class="{ on: activeFormats.justifyLeft }" title="左对齐" @mousedown.prevent @click="ex('justifyLeft')">
            <svg viewBox="0 0 16 16"><path d="M3 4h10M3 8h6.5M3 12h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
          </button>
          <button class="dtb-btn" :class="{ on: activeFormats.justifyCenter }" title="居中" @mousedown.prevent @click="ex('justifyCenter')">
            <svg viewBox="0 0 16 16"><path d="M3 4h10M4.8 8h6.4M3 12h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
          </button>
          <button class="dtb-btn" :class="{ on: activeFormats.justifyRight }" title="右对齐" @mousedown.prevent @click="ex('justifyRight')">
            <svg viewBox="0 0 16 16"><path d="M3 4h10M6.5 8H13M3 12h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
          </button>
        </div>
        <div class="dtb-label">段落</div>
      </div>

      <!-- 样式 -->
      <div class="dtb-group">
        <div class="dtb-row">
          <button class="dtb-btn dtb-style" title="正文" @mousedown.prevent @click="ex('formatBlock', 'p')">正文</button>
          <button class="dtb-btn dtb-style" title="标题 1" @mousedown.prevent @click="ex('formatBlock', 'h1')"><b>H<span class="dtb-sub">1</span></b></button>
          <button class="dtb-btn dtb-style" title="标题 2" @mousedown.prevent @click="ex('formatBlock', 'h2')"><b>H<span class="dtb-sub">2</span></b></button>
          <button class="dtb-btn dtb-style" title="标题 3" @mousedown.prevent @click="ex('formatBlock', 'h3')"><b>H<span class="dtb-sub">3</span></b></button>
        </div>
        <div class="dtb-label">样式</div>
      </div>
    </div>

    <!-- ===== 插入 ===== -->
    <div v-show="tab === 'insert'" class="dtb-panel">
      <div class="dtb-group">
        <div class="dtb-row">
          <button class="dtb-btn" title="分割线" @mousedown.prevent @click="ex('insertHorizontalRule')">
            <svg viewBox="0 0 16 16"><path d="M2 8h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M5 4.5h6M5 11.5h6" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" opacity=".55"/></svg>
          </button>
        </div>
        <div class="dtb-label">分隔符</div>
      </div>
      <div class="dtb-group">
        <div class="dtb-row">
          <button class="dtb-btn dtb-style" title="引用" @mousedown.prevent @click="ex('formatBlock', 'blockquote')">❝ 引用</button>
          <button class="dtb-btn dtb-style" title="代码块" @mousedown.prevent @click="ex('formatBlock', 'pre')">&#123; &#125; 代码</button>
        </div>
        <div class="dtb-label">内容块</div>
      </div>
    </div>
  </div>
</template>

<style src="./DocToolbar.css" scoped></style>
