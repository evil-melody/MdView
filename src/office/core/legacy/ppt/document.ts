/**
 * The structure of a PowerPoint 97-2003 file ([MS-PPT] 2.1-2.4): the Current User stream points to the last
 * UserEditAtom of the "PowerPoint Document" stream; the chain of edits gives the persist directory (persist id →
 * stream offset, the latest edit wins), which locates the DocumentContainer, the slides, masters and notes.
 */
import type { Cfb } from '../cfb'
import { Rec, RT } from './records'
import { ppt9 } from './text'

const ENCRYPTED_TOKEN = 0xf3d1c4df
const MAX_EDITS = 10000

/** a slide, master or notes page listed in the document */
export interface SlideRef {
  persistId: number
  /** the id slides and notes use to refer to it */
  slideId: number
  /** the record (SlideContainer, MainMasterContainer or NotesContainer) */
  rec?: Rec
  /** text of the slide's placeholders (SlideListWithText entries after its SlidePersistAtom) */
  texts: Rec[][]
}

export interface Hyperlink {
  url?: string
  /** a place inside the presentation ("slideId,slideIndex,title") */
  location?: string
}

/** headers and footers settings */
export interface HeadersFooters {
  date: boolean
  todayDate: boolean
  userDate: boolean
  slideNumber: boolean
  header: boolean
  footer: boolean
  /** date format id (today's date) */
  format: number
  userDateText?: string
  headerText?: string
  footerText?: string
}

/** The PowerPoint Document stream and what its document record lists. */
export class PptDocument {
  readonly stream: Uint8Array
  readonly persist = new Map<number, number>()
  readonly doc: Rec
  readonly slides: SlideRef[]
  readonly masters: SlideRef[]
  readonly notes: SlideRef[]
  readonly fonts: string[] = []
  readonly links = new Map<number, Hyperlink>()
  /** slide size in master units (576 per inch) */
  readonly width: number
  readonly height: number
  readonly notesWidth: number
  readonly notesHeight: number
  readonly firstSlideNumber: number
  /** "don't show headers and footers on the title slide" */
  readonly omitTitlePlace: boolean
  readonly pictures?: Uint8Array
  /** PowerPoint 2000 extras of placeholder text: StyleTextProp9Atoms by slide id, with their text type */
  readonly outline9 = new Map<number, { type: number; style: Rec }[]>()
  private cryptRef = 0

  constructor(cfb: Cfb) {
    if (cfb.has('EncryptedSummary')) throw new Error('Password-protected PowerPoint presentations are not supported')
    // PowerPoint 95 files saved with a PowerPoint 97 copy keep it in a storage
    const base = cfb.has('PP97_DUALSTORAGE/PowerPoint Document') ? 'PP97_DUALSTORAGE/' : ''
    const stream = cfb.stream(base + 'PowerPoint Document')
    if (!stream) throw new Error('Not a PowerPoint presentation')
    this.stream = stream
    this.pictures = cfb.stream(base + 'Pictures')
    const docId = this.readPersist(cfb, base)
    const off = this.persist.get(docId)
    const doc = off !== undefined ? Rec.at(stream, off) : undefined
    if (!doc || doc.type !== RT.Document) throw new Error('PowerPoint file is damaged: no document record')
    this.doc = doc

    const atom = doc.kid(RT.DocumentAtom)
    this.width = atom?.i32(0) || 5760
    this.height = atom?.i32(4) || 4320
    this.notesWidth = atom?.i32(8) || 4320
    this.notesHeight = atom?.i32(12) || 5760
    this.firstSlideNumber = atom?.u16(32) || 1
    this.omitTitlePlace = !!atom?.u8(37)

    for (const f of doc.kid(RT.Environment)?.kid(RT.FontCollection)?.all(RT.FontEntityAtom) ?? []) this.fonts.push(f.utf16(0, 64))
    for (const h of doc.kid(RT.ExObjList)?.all(RT.ExHyperlink) ?? []) {
      const id = h.kid(RT.ExHyperlinkAtom)?.u32(0)
      if (id === undefined) continue
      const str = (inst: number) => h.kid(RT.CString, inst)?.utf16() || undefined
      this.links.set(id, { url: str(1), location: str(3) })
    }

    let header: Rec | undefined
    for (const r of ppt9(doc.kid(RT.List)).find((x) => x.type === 0x0fae)?.kids() ?? []) {
      if (r.type === 0x0faf) header = r
      else if (r.type === 0x0fac && header) {
        const id = header.u32(0)
        const list = this.outline9.get(id) ?? []
        list.push({ type: header.u32(4), style: r })
        this.outline9.set(id, list)
        header = undefined
      }
    }

    const lists = doc.all(0x0ff0)
    this.slides = this.list(lists.find((l) => l.inst === 0))
    this.masters = this.list(lists.find((l) => l.inst === 1))
    this.notes = this.list(lists.find((l) => l.inst === 2))
  }

  /** the record a persist id points to */
  get(persistId: number): Rec | undefined {
    const off = this.persist.get(persistId)
    return off === undefined ? undefined : Rec.at(this.stream, off)
  }

  /** reads the persist directory; returns the document's persist id */
  private readPersist(cfb: Cfb, base: string): number {
    const s = this.stream
    const cu = cfb.stream(base + 'Current User')
    let edit = -1
    // PowerPoint 95: a 4-byte size, then the user name (PowerPoint 97 starts with a CurrentUserAtom record header)
    if (cu && cu.length >= 4 && ((cu[0] | (cu[1] << 8) | (cu[2] << 16) | (cu[3] << 24)) >>> 0) + 4 === cu.length) {
      throw new Error('PowerPoint 95 and older presentations are not supported')
    }
    if (cu && cu.length >= 28) {
      const atom = Rec.at(cu, 0)
      if (atom?.u32(4) === ENCRYPTED_TOKEN) throw new Error('Password-protected PowerPoint presentations are not supported')
      edit = atom?.u32(8) ?? -1
    }
    let docId = this.walkEdits(edit)
    // the stream's top-level records: edits and persist directories (a broken edit chain leaves some out)
    const edits: number[] = []
    const dirs: number[] = []
    for (let off = 0, n = 0; off + 8 <= s.length && n < 1000000; n++) {
      const r = Rec.at(s, off)
      if (!r) break
      if (r.type === RT.UserEditAtom) edits.push(off)
      else if (r.type === RT.PersistDirectoryAtom) dirs.push(off)
      off = r.end
    }
    if (docId === undefined && edits.length) {
      this.persist.clear()
      docId = this.walkEdits(edits[edits.length - 1])
    }
    // newest directories first, for ids the chain did not give
    for (const off of dirs.reverse()) this.readDirectory(Rec.at(s, off)!, false)
    if (docId === undefined) {
      if (this.looksOld(cfb)) throw new Error('PowerPoint 95 and older presentations are not supported')
      throw new Error('PowerPoint file is damaged: no edit record')
    }
    return docId
  }

  private looksOld(cfb: Cfb): boolean {
    return cfb.has('PP40') || cfb.has('Header')
  }

  /** follows the UserEditAtom chain from an offset; undefined when it does not start at an edit */
  private walkEdits(start: number): number | undefined {
    const s = this.stream
    let docId: number | undefined
    const seen = new Set<number>()
    for (let off = start, n = 0; off >= 0 && off < s.length && n < MAX_EDITS && !seen.has(off); n++) {
      seen.add(off)
      const edit = Rec.at(s, off)
      if (!edit || edit.type !== RT.UserEditAtom) break
      if (docId === undefined && edit.len >= 32) this.cryptRef = edit.u32(28)
      docId ??= edit.u32(16)
      const dir = Rec.at(s, edit.u32(12))
      if (dir?.type === RT.PersistDirectoryAtom) this.readDirectory(dir, true)
      const prev = edit.u32(8)
      if (!prev) break
      off = prev
    }
    if (this.cryptRef && this.get(this.cryptRef)?.type === RT.CryptSession10Container) throw new Error('Password-protected PowerPoint presentations are not supported')
    return docId !== undefined && this.persist.has(docId) ? docId : undefined
  }

  /** a PersistDirectoryAtom's entries, for ids not known yet (untrusted ones: only offsets inside the stream) */
  private readDirectory(dir: Rec, trusted: boolean) {
    for (let k = 0; k + 4 <= dir.len; ) {
      const v = dir.u32(k)
      k += 4
      const id = v & 0xfffff
      const count = v >>> 20
      for (let i = 0; i < count && k + 4 <= dir.len; i++, k += 4) {
        const off = dir.u32(k)
        if (this.persist.has(id + i) || (!trusted && !(off + 8 <= this.stream.length))) continue
        this.persist.set(id + i, off)
      }
    }
  }

  /** a SlideListWithText: its SlidePersistAtoms with the text records after each */
  private list(rec: Rec | undefined): SlideRef[] {
    const out: SlideRef[] = []
    let cur: SlideRef | undefined
    let group: Rec[] | undefined
    for (const r of rec?.kids() ?? []) {
      if (r.type === RT.SlidePersistAtom) {
        const persistId = r.u32(0)
        cur = { persistId, slideId: r.u32(12), rec: this.get(persistId), texts: [] }
        out.push(cur)
        group = undefined
      } else if (cur) {
        if (r.type === RT.TextHeaderAtom) cur.texts.push((group = [r]))
        else group?.push(r)
      }
    }
    return out
  }

  /** the headers and footers settings of slides (instance 3) or notes (4), from a container or the document */
  headersFooters(container: Rec | undefined, inst = 3): HeadersFooters | undefined {
    const hf = container?.kid(RT.HeadersFooters, inst) ?? this.doc.kid(RT.HeadersFooters, inst)
    const atom = hf?.kid(RT.HeadersFootersAtom)
    if (!hf || !atom) return undefined
    const flags = atom.u16(2)
    const str = (i: number) => hf.kid(RT.CString, i)?.utf16() || undefined
    return {
      date: !!(flags & 1),
      todayDate: !!(flags & 2),
      userDate: !!(flags & 4),
      slideNumber: !!(flags & 8),
      header: !!(flags & 0x10),
      footer: !!(flags & 0x20),
      format: atom.i16(0),
      userDateText: str(0),
      headerText: str(1),
      footerText: str(2),
    }
  }

  /** the font name of a font index */
  font(i: number | undefined): string | undefined {
    return i === undefined ? undefined : this.fonts[i] || undefined
  }
}
