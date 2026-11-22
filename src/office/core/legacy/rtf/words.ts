/** RTF control words: what each does to the reader's state. */
import { knownCp } from './codepage'
import { bookmark, fieldBegin, fieldResult, footnote, headerFooter, noteMark, pictBegin, shapeBegin, shapeResult, shapeText } from './dests'
import { pnFormat, type Level, type ListDef, type Override } from './lists'
import { BORDER, tabKind, tabLeader, type Frame, type Pn, type Side } from './props'
import type { RtfReader } from './reader'
import { newCell } from './tables'
import { D_COLOR, D_FONT, D_NONE, D_SHEET, D_STORY, D_STYLE, D_TEXT, D_UPR, TextAcc } from './text'

type Fn = (r: RtfReader, p: number, has: boolean) => void

/** `dest`: a destination, handled even when its group is ignorable (`\*`); `star`: another word that matters after `\*` */
export const WORDS = new Map<string, { fn: Fn; dest?: boolean; star?: boolean }>()

const on = (p: number, has: boolean) => !has || p !== 0
const def = (names: string | string[], fn: Fn, dest = false, star = false) => {
  for (const n of typeof names === 'string' ? [names] : names) WORDS.set(n, { fn, dest, star })
}
const dest = (names: string | string[], fn: Fn) => def(names, fn, true)
const star = (names: string | string[], fn: Fn) => def(names, fn, false, true)

// ---------------------------------------------------------------- ignored destinations

dest(
  [
    'info', 'xe', 'tc', 'tcn', 'txe', 'rxe', 'bxe', 'pntext', 'listtext', 'nonesttables', 'do', 'annotation', 'atnid', 'atnauthor',
    'atndate', 'atnref', 'atnparent', 'atrfstart', 'atrfend', 'atnicn', 'atntime', 'comment', 'themedata', 'colorschememapping',
    'latentstyles', 'datastore', 'xmlnstbl', 'generator', 'fldtype', 'datafield', 'formfield', 'listpicture', 'pgdsctbl',
    'rsidtbl', 'filetbl', 'protusertbl', 'userprops', 'docvar', 'template', 'ftnsep', 'ftnsepc', 'aftnsep', 'aftnsepc', 'ftncn',
    'aftncn', 'keycode', 'falt', 'panose', 'fname', 'private', 'background', 'mmath', 'mmathPr', 'levelmarker', 'levelnumbers',
    'listname', 'objdata', 'objclass', 'objname', 'objalias', 'objsect', 'objtime', 'picprop', 'blipuid', 'wgrffmtfilter', 'operator',
    'password', 'passwordhash', 'hlfr', 'hlloc', 'hlsrc', 'hl', 'txfieldtext', 'mmathPict', 'oldcprops', 'oldpprops', 'oldsprops',
    'oldtprops', 'ebcstart', 'ebcend', 'factoidname', 'xmlattrname', 'xmlattrvalue', 'xmlclose', 'xmlopen', 'xmlname', 'xmlattr',
    'mhtmltag', 'htmltag', 'svb', 'gridtbl', 'fchars', 'lchars', 'bkmkcolf', 'bkmkcoll',
  ],
  (r) => r.skip(),
)

dest('NeXTGraphic', (r) => {
  r.skip()
  r.dropAttachment = true
})

// ---------------------------------------------------------------- header tables

dest('fonttbl', (r) => {
  r.st.dest = D_FONT
  r.st.onEnd = () => r.fontCommit()
})

dest('colortbl', (r) => {
  r.st.dest = D_COLOR
  r.color = { r: 0, g: 0, b: 0, set: false }
  r.st.onEnd = () => {
    if (r.color.set) r.colorCommit()
  }
})

dest('stylesheet', (r) => {
  r.st.dest = D_SHEET
  r.st.onEnd = () => {
    r.styles.finish()
    r.invalidate()
  }
})

const styleOf = (r: RtfReader) => (r.st.dest === D_STYLE ? r.style : undefined)

def('s', (r, p) => {
  const st = styleOf(r)
  if (st) {
    st.kind = 'p'
    st.num = p
  } else r.pap().s = p
})
star('cs', (r, p) => {
  const st = styleOf(r)
  if (st) {
    st.kind = 'c'
    st.num = p
  } else if (r.st.dest !== D_SHEET) r.chp().cs = p
})
star('ts', (r, p) => {
  const st = styleOf(r)
  if (st) {
    st.kind = 't'
    st.num = p
  }
})
star('ds', (r, p) => {
  const st = styleOf(r)
  if (st) {
    st.kind = 'd'
    st.num = p
  }
})
def('sbasedon', (r, p) => {
  const st = styleOf(r)
  if (st) st.basedOn = p
})
def('snext', (r, p) => {
  const st = styleOf(r)
  if (st) st.next = p
})
def('slink', (r, p) => {
  const st = styleOf(r)
  if (st) st.link = p
})
def('sqformat', (r) => {
  const st = styleOf(r)
  if (st) st.qformat = true
})
def('ssemihidden', (r, p, has) => {
  const st = styleOf(r)
  if (st) st.semiHidden = on(p, has)
})
def('sunhideused', (r, p, has) => {
  const st = styleOf(r)
  if (st) st.unhide = on(p, has)
})
def('shidden', (r) => {
  const st = styleOf(r)
  if (st) st.hidden = true
})
def('spriority', (r, p) => {
  const st = styleOf(r)
  if (st) st.priority = p
})

// document defaults (\defchp, \defpap) are Word's own: RTF text and styles state their formatting in full
dest(['defchp', 'defpap'], (r) => r.skip())

def('ansicpg', (r, p) => {
  if (knownCp(p)) r.setAnsi(p)
})
def('mac', (r) => r.setAnsi(10000))
def('pc', (r) => r.setAnsi(437))
def('pca', (r) => r.setAnsi(850))
def('urtf', (r) => r.setAnsi(65001))
def('cocoartf', (r) => {
  r.cocoa = true
})
def('deff', (r, p) => {
  r.styles.setDefaults({ ...r.styles.defChp, f: p }, r.styles.defPap)
  r.invalidate()
})

// ---------------------------------------------------------------- lists

dest(['listtable', 'listoverridetable'], (r) => {
  r.st.dest = D_NONE
})
dest('list', (r) => {
  const l: ListDef = { levels: [] }
  r.list = l
  r.st.dest = D_NONE
  r.st.onEnd = () => {
    r.num.lists.push(l)
    if (r.list === l) r.list = undefined
  }
})
dest('listlevel', (r) => {
  const st = r.st
  const lv: Level = { ch: {}, pp: {} }
  st.ch = lv.ch
  st.chOwn = true
  st.pp = lv.pp
  st.ppOwn = true
  st.dest = D_NONE
  r.level = lv
  st.onEnd = (s) => {
    lv.ch = s.ch
    lv.pp = s.pp
    if (r.list && r.list.levels.length < 9) r.list.levels.push(lv)
    if (r.level === lv) r.level = undefined
  }
})
dest('leveltext', (r) => {
  const st = r.st
  st.dest = D_TEXT
  st.acc = new TextAcc()
  st.onEnd = (s) => {
    if (r.level) r.level.text = s.acc!.text()
  }
})
dest('listoverride', (r) => {
  const o: Override = { starts: new Map(), lfo: 0 }
  r.ovr = o
  r.lfo = -1
  r.st.dest = D_NONE
  r.st.onEnd = () => {
    if (o.ls !== undefined && !r.num.overrides.has(o.ls)) r.num.overrides.set(o.ls, o)
    if (r.ovr === o) r.ovr = undefined
  }
})
dest('lfolevel', (r) => {
  r.lfo = r.ovr ? Math.min(8, r.ovr.lfo++) : -1
  r.st.onEnd = () => {
    r.lfo = -1
  }
})
def('listid', (r, p) => {
  if (r.ovr) r.ovr.listid = p
  else if (r.list) r.list.id = p
})
const lvl = (f: (lv: Level, p: number, has: boolean) => void): Fn => (r, p, has) => {
  if (r.level) f(r.level, p, has)
}
def(['levelnfc', 'levelnfcn'], lvl((lv, p) => (lv.nfc = p)))
def(['leveljc', 'leveljcn'], lvl((lv, p) => (lv.jc = p)))
def('levelfollow', lvl((lv, p) => (lv.follow = p)))
def('levelstartat', (r, p) => {
  if (r.ovr && r.lfo >= 0) r.ovr.starts.set(r.lfo, p)
  else if (r.level) r.level.start = p
})
def('levellegal', lvl((lv, p, has) => (lv.legal = on(p, has))))
def('levelnorestart', lvl((lv, p, has) => (lv.norestart = on(p, has))))

def('ls', (r, p) => {
  if (r.ovr) r.ovr.ls = p
  else r.pap().ls = p
})
def('ilvl', (r, p) => {
  r.pap().ilvl = p
})

// legacy paragraph numbering
dest('pn', (r) => {
  const pn: Pn = {}
  r.pn = pn
  r.st.dest = D_NONE
  r.st.onEnd = () => {
    if (r.st.dest === D_STORY || r.st.dest === D_NONE) r.pap().pn = pn
    if (r.pn === pn) r.pn = undefined
  }
})
dest('pnseclvl', (r, p) => {
  const pn: Pn = { lvl: p }
  r.pn = pn
  r.st.dest = D_NONE
  r.st.onEnd = () => {
    if (p >= 1 && p <= 9) r.num.pnSec[p] = pn
    if (r.pn === pn) r.pn = undefined
  }
})
dest(['pntxta', 'pntxtb'], (r) => {
  const st = r.st
  const after = r.lx.word === 'pntxta'
  st.dest = D_TEXT
  st.acc = new TextAcc()
  st.onEnd = (s) => {
    if (r.pn) r.pn[after ? 'after' : 'before'] = s.acc!.text()
  }
})
const pnw = (f: (pn: Pn, p: number, has: boolean) => void): Fn => (r, p, has) => {
  if (r.pn) f(r.pn, p, has)
}
def('pnlvl', pnw((pn, p) => (pn.lvl = p)))
def('pnlvlblt', pnw((pn) => (pn.lvl = 'blt')))
def('pnlvlbody', pnw((pn) => (pn.lvl = 'body')))
def('pnlvlcont', pnw((pn) => (pn.lvl = 'cont')))
for (const w of ['pndec', 'pnucrm', 'pnlcrm', 'pnucltr', 'pnlcltr', 'pnord', 'pncard', 'pnordt', 'pndecd']) def(w, pnw((pn) => (pn.fmt = pnFormat(w))))
def('pnstart', pnw((pn, p) => (pn.start = p)))
def('pnindent', pnw((pn, p) => (pn.indent = p)))
def('pnf', pnw((pn, p) => (pn.f = p)))
def('pnfs', pnw((pn, p) => (pn.fs = p)))
def('pnb', pnw((pn, p, has) => (pn.b = on(p, has))))
def('pni', pnw((pn, p, has) => (pn.i = on(p, has))))

// ---------------------------------------------------------------- character formatting

def('plain', (r) => {
  r.st.ch = {}
  r.st.chOwn = true
  r.dirty = true
  r.lastCh = undefined
})
const tog = (k: 'b' | 'i' | 'caps' | 'scaps' | 'strike' | 'outl' | 'shad' | 'embo' | 'impr' | 'v' | 'del' | 'ins'): Fn => (r, p, has) => {
  r.chp()[k] = on(p, has)
}
def('b', tog('b'))
def('i', tog('i'))
def('caps', tog('caps'))
def('scaps', tog('scaps'))
def('strike', tog('strike'))
def('outl', tog('outl'))
def('shad', tog('shad'))
def('embo', tog('embo'))
def('impr', tog('impr'))
def('v', tog('v'))
def('deleted', tog('del'))
def('revised', tog('ins'))
const rev = (k: 'insA' | 'insD' | 'delA' | 'delD'): Fn => (r, p) => {
  r.chp()[k] = p
}
def('revauth', rev('insA'))
def('revdttm', rev('insD'))
def('revauthdel', rev('delA'))
def('revdttmdel', rev('delD'))
dest('revtbl', (r) => {
  const st = r.st
  st.dest = D_TEXT
  st.acc = new TextAcc()
  st.onEnd = (s) => {
    r.revAuthors = s.acc!.text().split(';').map((x) => x.trim()).slice(0, -1)
  }
})
def('striked', (r, p, has) => {
  r.chp().dstrike = on(p, has)
})
const UL: Record<string, string> = {
  ul: 'single', uld: 'dotted', uldash: 'dash', uldashd: 'dotDash', uldashdd: 'dotDotDash', uldb: 'double', ulhwave: 'wavyHeavy',
  ulldash: 'dashLong', ulth: 'thick', ulthd: 'dottedHeavy', ulthdash: 'dashedHeavy', ulthdashd: 'dashDotHeavy',
  ulthdashdd: 'dashDotDotHeavy', ulthldash: 'dashLongHeavy', ululdbwave: 'wavyDouble', ulw: 'words', ulwave: 'wave',
}
for (const [w, v] of Object.entries(UL)) def(w, (r, p, has) => {
  r.chp().ul = on(p, has) ? v : 'none'
})
def('ulnone', (r) => {
  r.chp().ul = 'none'
})
def('ulc', (r, p) => {
  r.chp().ulc = p
})
def('f', (r, p) => {
  r.chp().f = p
})
def('af', (r, p) => {
  if (r.st.dbch) r.chp().fEA = p
})
def('dbch', (r) => {
  r.st.dbch = true
})
def(['loch', 'hich', 'rtlch', 'ltrch'], (r) => {
  r.st.dbch = false
})
def('fs', (r, p, has) => {
  r.chp().fs = has && p > 0 ? p : 24
})
def('cf', (r, p) => {
  r.chp().cf = p
})
const shd = (k: 'bg' | 'fg' | 'pct'): Fn => (r, p) => {
  const ch = r.chp()
  ch.shd = { ...ch.shd, [k]: p }
}
def(['cb', 'chcbpat'], shd('bg'))
def('chcfpat', shd('fg'))
def('chshdng', shd('pct'))
def('highlight', (r, p) => {
  r.chp().hl = p || undefined
})
def('super', (r) => {
  r.chp().va = 'superscript'
})
def('sub', (r) => {
  r.chp().va = 'subscript'
})
def('nosupersub', (r) => {
  r.chp().va = undefined
})
def('up', (r, p, has) => {
  r.chp().up = has ? p : 6
})
def('dn', (r, p, has) => {
  r.chp().up = -(has ? p : 6)
})
def('expnd', (r, p) => {
  r.chp().expnd = p * 5
})
def('expndtw', (r, p) => {
  r.chp().expnd = p
})
def('charscalex', (r, p) => {
  r.chp().scale = p
})
def('kerning', (r, p) => {
  r.chp().kern = p
})

// ---------------------------------------------------------------- paragraph formatting

def('pard', (r) => {
  r.st.pp = {}
  r.st.ppOwn = true
  r.dirty = true
})
const JC: Record<string, string> = { ql: 'left', qc: 'center', qr: 'right', qj: 'both', qd: 'distribute', qk: 'both', qt: 'thaiDistribute' }
for (const [w, v] of Object.entries(JC)) def(w, (r) => {
  r.pap().jc = v
})
const num = (k: 'li' | 'ri' | 'fi' | 'sb' | 'sa' | 'outline' | 'itap'): Fn => (r, p) => {
  r.pap()[k] = p
}
def(['li', 'lin'], num('li'))
def(['ri', 'rin'], num('ri'))
def('fi', num('fi'))
def('sb', num('sb'))
def('sa', num('sa'))
def('outlinelevel', num('outline'))
def('itap', num('itap'))
def('sbauto', (r, p) => {
  r.pap().sbauto = p === 1
})
def('saauto', (r, p) => {
  r.pap().saauto = p === 1
})
def('sl', (r, p, has) => {
  r.pap().sl = has ? p : 0
})
def('slmult', (r, p) => {
  r.pap().slmult = p === 1
})
const ptog = (k: 'keepn' | 'keep' | 'pagebb' | 'contextual'): Fn => (r, p, has) => {
  r.pap()[k] = on(p, has)
}
def('keepn', ptog('keepn'))
def('keep', ptog('keep'))
def('pagebb', ptog('pagebb'))
def('contextualspace', ptog('contextual'))
def('widctlpar', (r) => {
  r.pap().widctl = true
})
def('nowidctlpar', (r) => {
  r.pap().widctl = false
})
def('intbl', (r) => {
  r.pap().intbl = true
})
def('rtlpar', (r) => {
  r.pap().rtl = true
})
def('ltrpar', (r) => {
  r.pap().rtl = false
})
const pshd = (k: 'bg' | 'fg' | 'pct'): Fn => (r, p) => {
  const pp = r.pap()
  pp.shd = { ...pp.shd, [k]: p }
}
def('cbpat', pshd('bg'))
def('cfpat', pshd('fg'))
def('shading', pshd('pct'))

// frames: positioned paragraphs
const frame = (f: (fr: Frame, p: number) => void): Fn => (r, p) => {
  const pp = r.pap()
  const fr = { ...pp.frame }
  f(fr, p)
  pp.frame = fr
}
def('absw', frame((f, p) => (f.w = p)))
def('absh', frame((f, p) => (f.h = p)))
def(['posx', 'posnegx'], frame((f, p) => (f.x = p)))
def(['posy', 'posnegy'], frame((f, p) => (f.y = p)))
def('abslock', frame((f) => (f.lock = true)))
def('dxfrtext', frame((f, p) => (f.hSpace = f.vSpace = p)))
def('dfrmtxtx', frame((f, p) => (f.hSpace = p)))
def('dfrmtxty', frame((f, p) => (f.vSpace = p)))
const FRAME: Record<string, [keyof Frame, string]> = {
  phmrg: ['hAnchor', 'margin'], phpg: ['hAnchor', 'page'], phcol: ['hAnchor', 'text'], pvmrg: ['vAnchor', 'margin'], pvpg: ['vAnchor', 'page'],
  pvpara: ['vAnchor', 'text'], posxc: ['xAlign', 'center'], posxi: ['xAlign', 'inside'], posxo: ['xAlign', 'outside'], posxr: ['xAlign', 'right'],
  posxl: ['xAlign', 'left'], posyil: ['yAlign', 'inline'], posyt: ['yAlign', 'top'], posyc: ['yAlign', 'center'], posyb: ['yAlign', 'bottom'],
  posyin: ['yAlign', 'inside'], posyout: ['yAlign', 'outside'], nowrap: ['wrap', 'notBeside'], wraparound: ['wrap', 'around'],
  wraptight: ['wrap', 'tight'], wrapthrough: ['wrap', 'through'],
}
for (const [w, [k, v]] of Object.entries(FRAME)) def(w, frame((f) => ((f as Record<string, unknown>)[k] = v)))

// tabs: kind and leader come before the position
for (const w of ['tqr', 'tqc', 'tqdec']) def(w, (r) => {
  r.tabKind = tabKind(w)
})
for (const w of ['tldot', 'tlhyph', 'tlul', 'tlth', 'tleq', 'tlmdot']) def(w, (r) => {
  r.tabLeader = tabLeader(w)
})
def('tx', (r, p) => {
  const pp = r.pap()
  if ((pp.tabs?.length ?? 0) < 64) pp.tabs = [...(pp.tabs ?? []), { pos: p, kind: r.tabKind, leader: r.tabLeader }]
  r.tabKind = r.tabLeader = undefined
})
def('tb', (r, p) => {
  const pp = r.pap()
  if ((pp.tabs?.length ?? 0) < 64) pp.tabs = [...(pp.tabs ?? []), { pos: p, kind: 'bar' }]
  r.tabKind = r.tabLeader = undefined
})

// borders: a side word, then the border's properties
const sides = (kind: 'p' | 'r' | 'c', s: Side[]): Fn => (r) => {
  r.brdr = { kind, sides: s }
  r.border()
}
def('brdrt', sides('p', ['t']))
def('brdrb', sides('p', ['b']))
def('brdrl', sides('p', ['l']))
def('brdrr', sides('p', ['r']))
def('brdrbtw', sides('p', ['btw']))
def('box', sides('p', ['t', 'l', 'b', 'r']))
def(['brdrbar', 'chbrdr'], (r) => {
  r.brdr = undefined
})
def('trbrdrt', sides('r', ['t']))
def('trbrdrl', sides('r', ['l']))
def('trbrdrb', sides('r', ['b']))
def('trbrdrr', sides('r', ['r']))
def('trbrdrh', sides('r', ['h']))
def('trbrdrv', sides('r', ['v']))
def('clbrdrt', sides('c', ['t']))
def('clbrdrl', sides('c', ['l']))
def('clbrdrb', sides('c', ['b']))
def('clbrdrr', sides('c', ['r']))
for (const [w, style] of Object.entries(BORDER)) def(w, (r) => r.setBorder((b) => {
  b.style = style
  if (w === 'brdrhair' && b.w === undefined) b.w = 5
}))
def('brdrw', (r, p) => r.setBorder((b) => (b.w = p)))
def('brdrcf', (r, p) => r.setBorder((b) => (b.cf = p)))
def('brsp', (r, p) => r.setBorder((b) => (b.sp = p)))

// ---------------------------------------------------------------- text

def('par', (r) => r.par())
def('sect', (r) => r.sectBreak())
def('page', (r) => r.item('<w:r><w:br w:type="page"/></w:r>'))
def('column', (r) => r.item('<w:r><w:br w:type="column"/></w:r>'))
def('line', (r) => r.char('\n'))
def('tab', (r) => r.char('\t'))
def('cell', (r) => r.cellEnd(false))
def('nestcell', (r) => r.cellEnd(true))
def('row', (r) => r.rowEnd(false))
def('nestrow', (r) => r.rowEnd(true))
const CHARS: Record<string, string> = {
  emdash: '\u2014', endash: '\u2013', emspace: '\u2003', enspace: '\u2002', qmspace: '\u2005', bullet: '\u2022',
  lquote: '\u2018', rquote: '\u2019', ldblquote: '\u201c', rdblquote: '\u201d', zwj: '\u200d', zwnj: '\u200c',
  ltrmark: '\u200e', rtlmark: '\u200f', zwbo: '\u200b', zwnbo: '\u2060',
}
for (const [w, c] of Object.entries(CHARS)) def(w, (r) => r.char(c))
def('u', (r, p) => r.unicode(p))
def('uc', (r, p) => {
  r.st.uc = Math.max(0, Math.min(16, p))
})
def('chftn', (r) => noteMark(r))
def('ftnalt', (r) => {
  const story = r.st.story
  if (!story.note) return
  story.note.end = true
  story.part = r.endPart
})
def('chpgn', (r) => r.item(`<w:fldSimple w:instr=" PAGE "><w:r>${r.rPrOf(r.st)}<w:t>1</w:t></w:r></w:fldSimple>`))

// ---------------------------------------------------------------- fields, bookmarks, notes, headers

dest('field', (r) => fieldBegin(r))
dest('fldinst', (r) => {
  const f = r.fields[r.fields.length - 1]
  if (!f) {
    r.skip()
    return
  }
  r.st.dest = D_TEXT
  r.st.acc = f.instr
})
dest('fldrslt', (r) => fieldResult(r))
dest(['bkmkstart', 'bkmkend'], (r) => {
  const st = r.st
  const start = r.lx.word === 'bkmkstart'
  if (st.dest !== D_STORY) {
    r.skip()
    return
  }
  st.dest = D_TEXT
  st.acc = new TextAcc()
  st.onEnd = (s) => bookmark(r, start, s.acc!.text())
})
dest('footnote', (r) => footnote(r))
for (const w of ['header', 'headerl', 'headerr', 'headerf', 'footer', 'footerl', 'footerr', 'footerf'] as const) dest(w, (r) => headerFooter(r, w))

dest('upr', (r) => {
  r.st.ret = r.st.dest
  r.st.dest = D_UPR
})
dest('ud', (r) => {
  if (r.st.dest === D_UPR) r.st.dest = r.st.ret ?? D_STORY
})

// ---------------------------------------------------------------- sections and the page

const docw = (k: 'pgW' | 'pgH' | 'ml' | 'mr' | 'mt' | 'mb' | 'gutter' | 'deftab'): Fn => (r, p) => {
  r.doc[k] = p
}
def('paperw', docw('pgW'))
def('paperh', docw('pgH'))
def('margl', docw('ml'))
def('margr', docw('mr'))
def('margt', docw('mt'))
def('margb', docw('mb'))
def('gutter', docw('gutter'))
def('deftab', (r, p) => {
  if (p > 0) r.doc.deftab = p
})
def('landscape', (r) => {
  r.doc.landscape = true
})
def('facingp', (r) => {
  r.doc.facing = true
})
def('margmirror', (r) => {
  r.doc.mirror = true
})
def('sectd', (r) => {
  r.sect = { hf: r.sect.hf }
})
const BRK: Record<string, string> = { sbknone: 'continuous', sbkcol: 'nextColumn', sbkpage: 'nextPage', sbkeven: 'evenPage', sbkodd: 'oddPage' }
for (const [w, v] of Object.entries(BRK)) def(w, (r) => {
  r.sect.brk = v
})
const sectw = (k: 'pgW' | 'pgH' | 'ml' | 'mr' | 'mt' | 'mb' | 'gutter' | 'hy' | 'fy' | 'cols' | 'colsx' | 'pgnStart'): Fn => (r, p) => {
  r.sect[k] = p
}
def('pgwsxn', sectw('pgW'))
def('pghsxn', sectw('pgH'))
def('marglsxn', sectw('ml'))
def('margrsxn', sectw('mr'))
def('margtsxn', sectw('mt'))
def('margbsxn', sectw('mb'))
def('guttersxn', sectw('gutter'))
def('headery', sectw('hy'))
def('footery', sectw('fy'))
def('cols', sectw('cols'))
def('colsx', sectw('colsx'))
def('pgnstarts', sectw('pgnStart'))
def('lndscpsxn', (r) => {
  r.sect.landscape = true
})
def('linebetcol', (r) => {
  r.sect.lineBetween = true
})
def('titlepg', (r) => {
  r.sect.titlePg = true
})
def('pgnrestart', (r) => {
  r.sect.pgnRestart = true
})
const PGN: Record<string, string> = { pgndec: 'decimal', pgnucrm: 'upperRoman', pgnlcrm: 'lowerRoman', pgnucltr: 'upperLetter', pgnlcltr: 'lowerLetter' }
for (const [w, v] of Object.entries(PGN)) def(w, (r) => {
  r.sect.pgnFmt = v === 'decimal' ? undefined : v
})
const VAL: Record<string, string> = { vertalt: 'top', vertalc: 'center', vertalj: 'both', vertalb: 'bottom' }
for (const [w, v] of Object.entries(VAL)) def(w, (r) => {
  r.sect.vAlign = v === 'top' ? undefined : v
})

// ---------------------------------------------------------------- tables

def('trowd', (r) => r.newRowDef())
// the nested row's definition, and its \nestrow
dest('nesttableprops', (r) => {
  r.st.nest = true
})
def('trgaph', (r, p) => {
  r.row.gaph = p
})
def('trleft', (r, p) => {
  r.row.left = p
})
def('trrh', (r, p) => {
  r.row.rh = p
})
def('trhdr', (r) => {
  r.row.hdr = true
})
def('trkeep', (r) => {
  r.row.keep = true
})
def('trql', (r) => {
  r.row.jc = undefined
})
def('trqc', (r) => {
  r.row.jc = 'center'
})
def('trqr', (r) => {
  r.row.jc = 'right'
})
def('trautofit', (r, p) => {
  r.row.auto = p === 1
})
const tpad = (k: 'l' | 'r' | 't' | 'b'): Fn => (r, p) => {
  r.row.pad[k] = p
}
def('trpaddl', tpad('l'))
def('trpaddr', tpad('r'))
def('trpaddt', tpad('t'))
def('trpaddb', tpad('b'))
def('cellx', (r, p) => {
  const row = r.row
  const c = r.cell
  c.x = p
  if (row.cells.length < 63) row.cells.push(c)
  r.cell = newCell()
})
def('clmgf', (r) => {
  r.cell.mgf = true
})
def('clmrg', (r) => {
  r.cell.mrg = true
})
def('clvmgf', (r) => {
  r.cell.vmgf = true
})
def('clvmrg', (r) => {
  r.cell.vmrg = true
})
def('clvertalt', (r) => {
  r.cell.va = 'top'
})
def('clvertalc', (r) => {
  r.cell.va = 'center'
})
def('clvertalb', (r) => {
  r.cell.va = 'bottom'
})
const cshd = (k: 'bg' | 'fg' | 'pct'): Fn => (r, p) => {
  r.cell.shd = { ...r.cell.shd, [k]: p }
}
def('clcbpat', cshd('bg'))
def('clcfpat', cshd('fg'))
def('clshdng', cshd('pct'))
def('clshdrawnil', (r) => {
  r.cell.shd = undefined
})
// Word writes the top padding as \clpadl and the left one as \clpadt (Cocoa follows the spec)
const cpad = (k: 'l' | 'r' | 't' | 'b'): Fn => (r, p) => {
  r.cell.pad[r.cocoa ? k : k === 'l' ? 't' : k === 't' ? 'l' : k] = p
}
def('clpadl', cpad('l'))
def('clpadt', cpad('t'))
def('clpadr', cpad('r'))
def('clpadb', cpad('b'))
def('clNoWrap', (r) => {
  r.cell.noWrap = true
})
def('cltxtbrl', (r) => {
  r.cell.dir = 'tbRl'
})
def('cltxbtlr', (r) => {
  r.cell.dir = 'btLr'
})

// ---------------------------------------------------------------- pictures and shapes

dest('pict', (r) => pictBegin(r))
dest('shppict', (r) => {
  r.st.shppict = true
  r.shppict = 'fail'
})
dest('nonshppict', (r) => {
  const skip = r.shppict === 'ok'
  r.shppict = 'none'
  if (skip) r.skip()
})
const pic = (k: 'picw' | 'pich' | 'goalw' | 'goalh' | 'scalex' | 'scaley' | 'cropl' | 'cropr' | 'cropt' | 'cropb'): Fn => (r, p) => {
  if (r.pict) r.pict[k] = p
}
def('picw', pic('picw'))
def('pich', pic('pich'))
def('picwgoal', pic('goalw'))
def('pichgoal', pic('goalh'))
def('picscalex', pic('scalex'))
def('picscaley', pic('scaley'))
def('piccropl', pic('cropl'))
def('piccropr', pic('cropr'))
def('piccropt', pic('cropt'))
def('piccropb', pic('cropb'))
const BLIP: Record<string, string> = { pngblip: 'png', jpegblip: 'jpeg', emfblip: 'emf', wmetafile: 'wmf', dibitmap: 'dib', wbitmap: 'other', macpict: 'mac', pmmetafile: 'other' }
for (const [w, k] of Object.entries(BLIP)) def(w, (r) => {
  if (r.pict) r.pict.kind = k
})

dest('shp', (r) => shapeBegin(r, false))
dest('shpgrp', (r) => shapeBegin(r, true))
dest('shpinst', (r) => {
  if (!r.shapes.length) r.skip()
  else r.st.dest = D_NONE
})
dest('sp', (r) => {
  r.st.dest = D_NONE
  r.sn = r.sv = undefined
  r.st.onEnd = () => {
    const sh = r.shapes[r.shapes.length - 1]
    if (sh && r.sn && sh.props.size < 512) sh.props.set(r.sn, r.sv ?? '')
    r.sn = r.sv = undefined
  }
})
dest(['sn', 'sv'], (r) => {
  const st = r.st
  const name = r.lx.word === 'sn'
  st.dest = D_TEXT
  st.acc = new TextAcc()
  if (!name) st.pictTo = r.shapes[r.shapes.length - 1]
  st.onEnd = (s) => {
    const v = s.acc!.text().trim()
    if (name) r.sn = v
    else r.sv = v
  }
})
dest('shptxt', (r) => shapeText(r))
dest('shprslt', (r) => shapeResult(r))
const shp = (f: (r: RtfReader, p: number) => void): Fn => (r, p) => {
  if (r.shapes.length) f(r, p)
}
const top = (r: RtfReader) => r.shapes[r.shapes.length - 1]
def('shpleft', shp((r, p) => (top(r).l = p)))
def('shptop', shp((r, p) => (top(r).t = p)))
def('shpright', shp((r, p) => (top(r).r = p)))
def('shpbottom', shp((r, p) => (top(r).b = p)))
def('shpbxpage', shp((r) => (top(r).relH = 'page')))
def('shpbxmargin', shp((r) => (top(r).relH = 'margin')))
def('shpbxcolumn', shp((r) => (top(r).relH = 'column')))
def('shpbxignore', shp((r) => (top(r).relH = undefined)))
def('shpbypage', shp((r) => (top(r).relV = 'page')))
def('shpbymargin', shp((r) => (top(r).relV = 'margin')))
def('shpbypara', shp((r) => (top(r).relV = 'paragraph')))
def('shpbyignore', shp((r) => (top(r).relV = undefined)))
def('shpwr', shp((r, p) => (top(r).wr = p)))
def('shpwrk', shp((r, p) => (top(r).wrk = p)))
def('shpfblwtxt', shp((r, p) => (top(r).behind = p === 1)))
def('shpz', shp((r, p) => (top(r).z = p)))

// embedded objects: their result (a picture) is shown
dest('object', (r) => {
  r.st.dest = D_NONE
})
dest('result', (r) => {
  r.st.dest = D_STORY
})

