import { kid, kids, path, type XEl } from './xml'

export interface Theme {
  colors: Record<string, string>
  major: string
  minor: string
  fillStyles: XEl[]
  bgFillStyles: XEl[]
  lineStyles: XEl[]
}

export const DEFAULT_THEME: Theme = {
  colors: {
    dk1: '#000000', lt1: '#ffffff', dk2: '#44546a', lt2: '#e7e6e6',
    accent1: '#4472c4', accent2: '#ed7d31', accent3: '#a5a5a5', accent4: '#ffc000',
    accent5: '#5b9bd5', accent6: '#70ad47', hlink: '#0563c1', folHlink: '#954f72',
  },
  major: 'Calibri Light',
  minor: 'Calibri',
  fillStyles: [],
  bgFillStyles: [],
  lineStyles: [],
}

export function parseTheme(root: XEl | undefined): Theme {
  if (!root) return DEFAULT_THEME
  const te = kid(root, 'themeElements')
  const colors: Record<string, string> = { ...DEFAULT_THEME.colors }
  for (const c of kid(te, 'clrScheme')?.c ?? []) {
    const v = c.c[0]
    if (!v) continue
    if (v.n === 'srgbClr' && v.a.val) colors[c.n] = '#' + v.a.val.toLowerCase()
    else if (v.n === 'sysClr') colors[c.n] = '#' + (v.a.lastClr ?? (v.a.val === 'window' ? 'ffffff' : '000000')).toLowerCase()
  }
  const fs = kid(te, 'fontScheme')
  const fmt = kid(te, 'fmtScheme')
  return {
    colors,
    major: path(fs, 'majorFont', 'latin')?.a.typeface || DEFAULT_THEME.major,
    minor: path(fs, 'minorFont', 'latin')?.a.typeface || DEFAULT_THEME.minor,
    fillStyles: kid(fmt, 'fillStyleLst')?.c ?? [],
    bgFillStyles: kid(fmt, 'bgFillStyleLst')?.c ?? [],
    lineStyles: kids(kid(fmt, 'lnStyleLst'), 'ln'),
  }
}
