/** Everything read from a Word binary document before it is written out: text, styles, lists, sections, notes, marks. */
import type { Cfb } from '../cfb'
import { Bytes, Plc, sttb } from './bin'
import { Drawings, readFspa, type Fspa } from './art'
import { FC, readFib, type Fib } from './fib'
import { applySep, defaultSep, type Sep } from './props'
import { readFonts, readLists, StyleSheet, xst, type Font, type Lfo, type Lst } from './styles'
import { DocText } from './text'

export interface Section {
  cp0: number
  cp1: number
  sep: Sep
}

export interface Note {
  /** reference CP in the main text */
  ref: number
  /** auto-numbered (else a custom mark) */
  auto: boolean
  /** the note's text */
  cp0: number
  cp1: number
}

export interface Comment {
  ref: number
  cp0: number
  cp1: number
  author: string
  initials: string
  /** the commented range, when it has one */
  start?: number
  end?: number
}

export interface Bookmark {
  name: string
  start: number
  end: number
}

/** where each story starts in the CP space */
export interface Stories {
  ftn: number
  hdd: number
  atn: number
  edn: number
  txbx: number
  hdrTxbx: number
}

const MAX_NOTES = 100_000

export class DocModel {
  readonly wd: Bytes
  readonly tbl: Bytes
  readonly data?: Bytes
  readonly fib: Fib
  readonly text: DocText
  readonly styles: StyleSheet
  readonly fonts: Font[]
  readonly lsts: Lst[]
  readonly lfos: Lfo[]
  readonly sections: Section[] = []
  readonly at: Stories
  /** header stories: [cp0, cp1) per index (6 separators, then 6 per section) */
  readonly hdd: [number, number][] = []
  readonly footnotes: Note[] = []
  readonly endnotes: Note[] = []
  readonly comments: Comment[] = []
  readonly bookmarks: Bookmark[] = []
  /** revision authors */
  readonly authors: string[]
  readonly drawings?: Drawings
  /** floating shape anchors by CP (main text and headers) */
  readonly spa = new Map<number, Fspa>()
  readonly spaHdr = new Map<number, Fspa>()
  /** text box stories: shape id → [cp0, cp1) */
  readonly txbx = new Map<number, [number, number]>()
  readonly txbxList: [number, number][] = []
  readonly hdrTxbx = new Map<number, [number, number]>()
  readonly hdrTxbxList: [number, number][] = []
  /** field types (flt) of the field begin characters, by CP */
  readonly flt = new Map<number, number>()
  /** document properties (DOP) */
  readonly facingPages: boolean
  readonly mirrorMargins: boolean
  readonly defaultTab: number

  constructor(readonly cfb: Cfb) {
    const wd = cfb.stream('WordDocument')
    if (!wd) throw new Error('Not a Word document (no WordDocument stream)')
    this.wd = new Bytes(wd)
    this.fib = readFib(this.wd)
    const tbl = cfb.stream(this.fib.tbl1 ? '1Table' : '0Table')
    if (!tbl) throw new Error(`Word document is damaged (no ${this.fib.tbl1 ? '1Table' : '0Table'} stream)`)
    this.tbl = new Bytes(tbl)
    const data = cfb.stream('Data')
    if (data) this.data = new Bytes(data)
    const { fib } = this
    this.text = new DocText(this.wd, this.tbl, fib)
    // the stories fit in the text
    let left = this.text.length
    const fit = (n: number) => {
      const v = Math.min(n, left)
      left -= v
      return v
    }
    fib.ccpText = fit(fib.ccpText)
    fib.ccpFtn = fit(fib.ccpFtn)
    fib.ccpHdd = fit(fib.ccpHdd)
    fib.ccpMcr = fit(fib.ccpMcr)
    fib.ccpAtn = fit(fib.ccpAtn)
    fib.ccpEdn = fit(fib.ccpEdn)
    fib.ccpTxbx = fit(fib.ccpTxbx)
    fib.ccpHdrTxbx = fit(fib.ccpHdrTxbx)
    const st = fib.fc(FC.stshf)
    this.styles = new StyleSheet(this.tbl, st.fc, st.lcb)
    const ff = fib.fc(FC.sttbfFfn)
    this.fonts = readFonts(this.tbl, ff.fc, ff.lcb)
    const lists = readLists(this.tbl, fib.fc(FC.plfLst), fib.fc(FC.plfLfo))
    this.lsts = lists.lsts
    this.lfos = lists.lfos

    const ftn = fib.ccpText
    const hdd = ftn + fib.ccpFtn
    const atn = hdd + fib.ccpHdd + fib.ccpMcr
    const edn = atn + fib.ccpAtn
    const txbx = edn + fib.ccpEdn
    this.at = { ftn, hdd, atn, edn, txbx, hdrTxbx: txbx + fib.ccpTxbx }

    this.readSections()
    this.readHeaders()
    this.readNotes(FC.plcffndRef, FC.plcffndTxt, ftn, fib.ccpFtn, this.footnotes)
    this.readNotes(FC.plcfendRef, FC.plcfendTxt, edn, fib.ccpEdn, this.endnotes)
    this.readComments()
    this.readBookmarks()
    this.authors = this.table(FC.sttbfRMark).strs

    const dop = fib.fc(FC.dop)
    this.facingPages = dop.lcb > 0 && !!(this.tbl.u8(dop.fc) & 1)
    this.mirrorMargins = dop.lcb > 5 && !!(this.tbl.u8(dop.fc + 5) & 0x80)
    this.defaultTab = (dop.lcb > 11 && this.tbl.u16(dop.fc + 10)) || 720

    const dg = fib.fc(FC.dggInfo)
    if (dg.lcb) {
      try {
        this.drawings = new Drawings(this.tbl, this.wd, dg.fc, dg.lcb)
      } catch {
        this.drawings = undefined
      }
    }
    const fld: [number, number][] = [[FC.plcfFldMom, 0], [FC.plcfFldHdr, this.at.hdd], [FC.plcfFldFtn, this.at.ftn], [FC.plcfFldAtn, this.at.atn], [FC.plcfFldEdn, this.at.edn], [FC.plcfFldTxbx, this.at.txbx], [FC.plcfFldHdrTxbx, this.at.hdrTxbx]]
    for (const [i, base] of fld) {
      const plc = this.plc(i, 2)
      for (let k = 0; k < plc.n; k++) if ((this.tbl.u8(plc.at(k)) & 0x1f) === 0x13) this.flt.set(base + plc.cps[k], this.tbl.u8(plc.at(k) + 1))
    }
    this.readSpa(FC.plcSpaMom, 0, this.spa)
    this.readSpa(FC.plcSpaHdr, this.at.hdd, this.spaHdr)
    this.readTxbx(FC.plcftxbxTxt, this.at.txbx, fib.ccpTxbx, this.txbx, this.txbxList)
    this.readTxbx(FC.plcfHdrtxbxTxt, this.at.hdrTxbx, fib.ccpHdrTxbx, this.hdrTxbx, this.hdrTxbxList)
  }

  private plc(i: number, cb: number): Plc {
    const { fc, lcb } = this.fib.fc(i)
    return new Plc(this.tbl, fc, lcb, cb)
  }

  private table(i: number) {
    const { fc, lcb } = this.fib.fc(i)
    return sttb(this.tbl, fc, lcb)
  }

  private readSections() {
    const { ccpText } = this.fib
    const plc = this.plc(FC.plcfSed, 12)
    let last = 0
    for (let i = 0; i < plc.n; i++) {
      const cp0 = Math.max(last, plc.cps[i])
      const cp1 = Math.min(ccpText, plc.cps[i + 1])
      if (cp1 <= cp0) continue
      const sep = defaultSep()
      const fc = this.tbl.u32(plc.at(i) + 2)
      if (fc !== 0xffffffff && fc < this.wd.length) {
        const cb = this.wd.i16(fc)
        if (cb > 0) applySep(sep, this.wd.sub(fc + 2, cb))
      }
      this.sections.push({ cp0, cp1, sep })
      last = cp1
    }
    if (!this.sections.length) this.sections.push({ cp0: 0, cp1: ccpText, sep: defaultSep() })
    // the last section runs to the end of the main text
    this.sections[this.sections.length - 1].cp1 = ccpText
  }

  private readHeaders() {
    const plc = this.plc(FC.plcfHdd, 0)
    const { hdd } = this.at
    const end = hdd + this.fib.ccpHdd
    for (let i = 0; i + 1 < plc.cps.length; i++) {
      const a = Math.min(end, hdd + plc.cps[i])
      const b = Math.min(end, hdd + plc.cps[i + 1])
      this.hdd.push([a, Math.max(a, b)])
    }
  }

  /** a section's header / footer story: 0 even header, 1 odd header, 2 even footer, 3 odd footer, 4 first header, 5 first footer */
  headerStory(section: number, kind: number): [number, number] | undefined {
    const s = this.hdd[6 + section * 6 + kind]
    if (!s || s[1] <= s[0]) return undefined
    // a story ends with an extra paragraph mark that is not part of its text
    const end = s[1] - s[0] > 1 && this.text.text.charCodeAt(s[1] - 1) === 0x0d ? s[1] - 1 : s[1]
    return [s[0], end]
  }

  private readNotes(refAt: number, txtAt: number, base: number, ccp: number, out: Note[]) {
    const ref = this.plc(refAt, 2)
    const txt = this.plc(txtAt, 0)
    const n = Math.min(ref.n, txt.cps.length - 1, MAX_NOTES)
    for (let i = 0; i < n; i++) {
      const cp0 = base + Math.min(ccp, txt.cps[i])
      const cp1 = base + Math.min(ccp, txt.cps[i + 1])
      out.push({ ref: ref.cps[i], auto: this.tbl.i16(ref.at(i)) > 0, cp0, cp1: Math.max(cp0, cp1) })
    }
  }

  private readComments() {
    const ref = this.plc(FC.plcfandRef, 30)
    const txt = this.plc(FC.plcfandTxt, 0)
    const { atn } = this.at
    const ccp = this.fib.ccpAtn
    // authors: a list of Xst
    const owners: string[] = []
    const ow = this.fib.fc(FC.grpXstAtnOwners)
    for (let p = ow.fc, end = Math.min(this.tbl.length, ow.fc + ow.lcb); p + 2 <= end && owners.length < 10_000; ) {
      const cch = this.tbl.u16(p)
      owners.push(xst(this.tbl, p))
      p += 2 + cch * 2
    }
    // commented ranges: annotation bookmarks, tagged
    const bkf = this.plc(FC.plcfAtnBkf, 4)
    const bkl = this.plc(FC.plcfAtnBkl, 0)
    const names = this.table(FC.sttbfAtnBkmk)
    const byTag = new Map<number, [number, number]>()
    for (let j = 0; j < bkf.n && j < names.extra.length; j++) {
      const tag = this.tbl.i32(names.extra[j] + 2)
      const ibkl = this.tbl.u16(bkf.at(j))
      const end = bkl.cps[ibkl]
      if (end !== undefined) byTag.set(tag, [bkf.cps[j], end])
    }
    const n = Math.min(ref.n, txt.cps.length - 1, MAX_NOTES)
    for (let i = 0; i < n; i++) {
      const o = ref.at(i)
      const initials = this.tbl.utf16(o + 2, Math.min(9, this.tbl.u16(o)))
      const ibst = this.tbl.i16(o + 20)
      const tag = this.tbl.i32(o + 26)
      const range = tag !== -1 ? byTag.get(tag) : undefined
      const cp0 = atn + Math.min(ccp, txt.cps[i])
      const cp1 = Math.max(cp0, atn + Math.min(ccp, txt.cps[i + 1]))
      const c: Comment = { ref: ref.cps[i], cp0, cp1, author: owners[ibst] ?? '', initials }
      if (range && range[0] <= range[1] && this.storyOf(range[0]) === 0 && this.storyOf(Math.max(range[0], range[1] - 1)) === 0) {
        c.start = range[0]
        c.end = range[1]
      }
      this.comments.push(c)
    }
  }

  /** which story a CP is in (0 main, 1 footnotes, 2 headers, 3 comments, 4 endnotes, 5 text boxes, 6 header text boxes) */
  storyOf(cp: number): number {
    const a = this.at
    const bounds = [this.fib.ccpText, a.hdd, a.atn, a.edn, a.txbx, a.hdrTxbx, a.hdrTxbx + this.fib.ccpHdrTxbx]
    const k = bounds.findIndex((b) => cp < b)
    return k < 0 ? 7 : k
  }

  private readBookmarks() {
    const names = this.table(FC.sttbfBkmk).strs
    const bkf = this.plc(FC.plcfBkf, 4)
    const bkl = this.plc(FC.plcfBkl, 0)
    for (let j = 0; j < bkf.n && j < names.length; j++) {
      const ibkl = this.tbl.u16(bkf.at(j))
      const start = bkf.cps[j]
      const end = bkl.cps[ibkl]
      // both ends in the same story (the end may be that story's end)
      if (end === undefined || end < start || this.storyOf(start) !== this.storyOf(Math.max(start, end - 1))) continue
      this.bookmarks.push({ name: names[j], start, end })
    }
  }

  private readSpa(i: number, base: number, out: Map<number, Fspa>) {
    const plc = this.plc(i, 26)
    for (let k = 0; k < plc.n; k++) out.set(base + plc.cps[k], readFspa(this.tbl, plc.at(k)))
  }

  private readTxbx(i: number, base: number, ccp: number, out: Map<number, [number, number]>, list: [number, number][]) {
    const plc = this.plc(i, 22)
    for (let k = 0; k < plc.n; k++) {
      const a = base + Math.min(ccp, plc.cps[k])
      const b = Math.max(a, base + Math.min(ccp, plc.cps[k + 1]))
      list.push([a, b])
      const lid = this.tbl.i32(plc.at(k) + 14)
      if (!this.tbl.u16(plc.at(k) + 8) && !out.has(lid)) out.set(lid, [a, b])
    }
  }
}
