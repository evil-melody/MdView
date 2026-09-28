/**
 * 代码/配置类扩展名 → CodeMirror 语言。
 * 统一收口在此，编辑器与「是否可编辑」判定共用同一张表。
 */
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { yaml } from '@codemirror/lang-yaml'
import { markdown } from '@codemirror/lang-markdown'
import { xml } from '@codemirror/lang-xml'
import { python } from '@codemirror/lang-python'
import { sql } from '@codemirror/lang-sql'
import { StreamLanguage } from '@codemirror/language'
import { shell as shellMode } from '@codemirror/legacy-modes/mode/shell'
import { toml as tomlMode } from '@codemirror/legacy-modes/mode/toml'
import { properties as propertiesMode } from '@codemirror/legacy-modes/mode/properties'
import { dockerFile as dockerfileMode } from '@codemirror/legacy-modes/mode/dockerfile'
import type { Extension } from '@codemirror/state'

/** 需要语法高亮 / 进入代码编辑器的扩展名（小写） */
export const CODE_EXTS = [
  'sh', 'bash', 'zsh', 'ksh', 'fish', 'csh',
  'toml',
  'xml', 'xsd', 'xsl', 'xslt', 'dtd', 'plist',
  'json', 'jsonc', 'json5',
  'yaml', 'yml',
  'ini', 'conf', 'properties', 'env', 'editorconfig',
  'py', 'pyi', 'sql',
  'dockerfile', 'nginx', 'cmake', 'makefile', 'mk', 'mkfile', 'rb', 'go', 'rs', 'lua', 'pl', 'ps1',
]

/** 扩展名 → 语言名（用于界面标签） */
const LANG_LABELS: Record<string, string> = {
  sh: 'Shell', bash: 'Shell', zsh: 'Shell', ksh: 'Shell', fish: 'Shell', csh: 'Shell',
  toml: 'TOML',
  xml: 'XML', xsd: 'XML', xsl: 'XML', xslt: 'XSLT', dtd: 'DTD', plist: 'plist',
  json: 'JSON', jsonc: 'JSON', json5: 'JSON',
  yaml: 'YAML', yml: 'YAML',
  ini: 'INI', conf: 'Config', properties: 'Properties', env: 'Env', editorconfig: 'EditorConfig',
  py: 'Python', pyi: 'Python', sql: 'SQL',
  dockerfile: 'Dockerfile', nginx: 'Nginx', cmake: 'CMake', makefile: 'Makefile', mk: 'Makefile', mkfile: 'Makefile',
  rb: 'Ruby', go: 'Go', rs: 'Rust', lua: 'Lua', pl: 'Perl', ps1: 'PowerShell',
}

/** 扩展名 → CodeMirror 语言扩展 */
function langFor(ext: string): Extension {
  switch (ext) {
    case 'sh':
    case 'bash':
    case 'zsh':
    case 'ksh':
    case 'fish':
    case 'csh':
      return StreamLanguage.define(shellMode)
    case 'toml':
      return StreamLanguage.define(tomlMode)
    case 'ini':
    case 'conf':
    case 'properties':
    case 'env':
    case 'editorconfig':
      return StreamLanguage.define(propertiesMode)
    case 'dockerfile':
      return StreamLanguage.define(dockerfileMode)
    case 'json':
    case 'jsonc':
    case 'json5':
      return json()
    case 'yaml':
    case 'yml':
      return yaml()
    case 'md':
    case 'markdown':
    case 'mdx':
      return markdown()
    case 'xml':
    case 'xsd':
    case 'xsl':
    case 'xslt':
    case 'dtd':
    case 'plist':
      return xml()
    case 'py':
    case 'pyi':
      return python()
    case 'sql':
      return sql()
    case 'rb':
    case 'go':
    case 'rs':
    case 'lua':
    case 'pl':
    case 'ps1':
    case 'cmake':
    case 'nginx':
    case 'mk':
    case 'makefile':
    case 'mkfile':
    default:
      // JS 语法做兜底高亮（比纯文本可读），不可用时退化为纯文本扩展
      return javascript()
  }
}

/** 取语言扩展（异常时回退空扩展，保证编辑器仍可打开） */
export function languageFor(ext: string): Extension {
  try {
    return langFor(ext)
  } catch (_) {
    return []
  }
}

/** 界面语言标签 */
export function languageLabel(ext: string): string {
  return LANG_LABELS[ext] || ext.toUpperCase()
}

/** 是否为代码/配置类文件（走 CodeMirror 编辑器） */
export function isCodeFile(entry: { ext?: string; name?: string } | null | undefined): boolean {
  if (!entry) return false
  const ext = (entry.ext || '').toLowerCase()
  if (ext) return CODE_EXTS.includes(ext)
  const last = (entry.name || '').split('.').pop() || ''
  return CODE_EXTS.includes(last.toLowerCase())
}
