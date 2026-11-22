/** What the reader builds: stories of paragraph content, group states, fields, shapes, sections. */
import type { Part } from '../../iwork/ooxml'
import type { Image } from './pictures'
import type { Chp, Pap } from './props'
import type { TableLevel } from './tables'
import type { TextAcc } from './text'

/** inline content of a paragraph; `link` groups items into a hyperlink ('r:' + target, 'a:' + bookmark) */
export interface Item {
  xml: string
  link?: string
}

/** a flow of paragraphs and tables: the body, a header / footer, a note, a text box */
export class Story {
  blocks: string[] = []
  items: Item[] = []
  tbl: TableLevel[] = []
  /** legacy (\pn) list continuity */
  pn: { key?: string; num?: number } = {}
  /** paragraphs ended so far */
  paras = 0
  note?: { end: boolean }
  constructor(
    /** the part its relationships (pictures, links) belong to */
    public part: Part,
    readonly kind: 'body' | 'hdr' | 'note' | 'box',
  ) {}
}

export interface State {
  dest: number
  ch: Chp
  chOwn: boolean
  pp: Pap
  ppOwn: boolean
  uc: number
  /** \af sets the East Asian font (after \dbch) */
  dbch: boolean
  story: Story
  link?: string
  acc?: TextAcc
  /** D_UPR: the destination \ud goes back to */
  ret?: number
  /** pictures read here belong to this shape (`\sv` of `pib`) */
  pictTo?: Shape
  shppict?: boolean
  /** inside \nesttableprops */
  nest?: boolean
  onEnd?: (s: State) => void
}

export interface Field {
  instr: TextAcc
  /** fields inside a field instruction: their result goes to the outer instruction */
  outer?: TextAcc
  kind?: 'link' | 'page'
  result: boolean
  story?: Story
  mark: number
  para: number
}

export interface Shape {
  l: number
  t: number
  r: number
  b: number
  relH?: string
  relV?: string
  wr?: number
  wrk?: number
  behind: boolean
  z: number
  props: Map<string, string>
  img?: Image
  txt?: string
  /** something of it was shown (a picture or text box of a grouped shape) */
  shown?: boolean
  group: boolean
  /** where it is shown */
  story?: Story
}

export type HfKind = 'header' | 'headerl' | 'headerr' | 'headerf' | 'footer' | 'footerl' | 'footerr' | 'footerf'

export interface Sect {
  pgW?: number
  pgH?: number
  ml?: number
  mr?: number
  mt?: number
  mb?: number
  gutter?: number
  landscape?: boolean
  hy?: number
  fy?: number
  cols?: number
  colsx?: number
  lineBetween?: boolean
  titlePg?: boolean
  brk?: string
  pgnRestart?: boolean
  pgnStart?: number
  pgnFmt?: string
  vAlign?: string
  hf: Partial<Record<HfKind, { xml: string; part: Part }>>
}

export interface DocSetup {
  pgW: number
  pgH: number
  ml: number
  mr: number
  mt: number
  mb: number
  gutter: number
  landscape: boolean
  facing: boolean
  mirror: boolean
  deftab: number
}
