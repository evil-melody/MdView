/** Maps Office font names to CSS stacks with metric-compatible fallbacks. */
const ALIASES: Record<string, string> = {
  calibri: 'Carlito',
  cambria: 'Caladea',
  arial: '"Liberation Sans", Arimo',
  helvetica: '"Liberation Sans", Arimo',
  'times new roman': '"Liberation Serif", Tinos',
  'courier new': '"Liberation Mono", Cousine',
  'segoe ui': 'system-ui',
  'calibri light': 'Carlito',
  aptos: '"Segoe UI", system-ui',
  'aptos display': '"Segoe UI", system-ui',
}

const SERIF = /times|cambria|georgia|garamond|book|serif|palatino|minion|baskerville|didot|caslon|mincho|song/i
const MONO = /courier|mono|consolas|menlo|code/i

const cache = new Map<string, string>()

export function cssFont(name: string | undefined): string | undefined {
  if (!name) return undefined
  let v = cache.get(name)
  if (v) return v
  const lower = name.toLowerCase()
  const generic = MONO.test(name) ? 'monospace' : SERIF.test(name) && !/sans/i.test(name) ? 'serif' : 'sans-serif'
  const alias = ALIASES[lower]
  v = `"${name.replace(/"/g, '')}"${alias ? ', ' + alias : ''}, ${generic}`
  cache.set(name, v)
  return v
}
