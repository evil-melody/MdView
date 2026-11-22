/** The File Information Block at the start of the WordDocument stream: version, flags, text lengths, where each table is. */
import type { Bytes } from './bin'

/** indices in FibRgFcLcb (pairs of offset and size in the table stream) */
export const FC = {
  stshf: 1,
  plcffndRef: 2,
  plcffndTxt: 3,
  plcfandRef: 4,
  plcfandTxt: 5,
  plcfSed: 6,
  plcfHdd: 11,
  plcfBteChpx: 12,
  plcfBtePapx: 13,
  sttbfFfn: 15,
  plcfFldMom: 16,
  plcfFldHdr: 17,
  plcfFldFtn: 18,
  plcfFldAtn: 19,
  sttbfBkmk: 21,
  plcfBkf: 22,
  plcfBkl: 23,
  dop: 31,
  clx: 33,
  grpXstAtnOwners: 36,
  sttbfAtnBkmk: 37,
  plcSpaMom: 40,
  plcSpaHdr: 41,
  plcfAtnBkf: 42,
  plcfAtnBkl: 43,
  plcfendRef: 46,
  plcfendTxt: 47,
  plcfFldEdn: 48,
  dggInfo: 50,
  sttbfRMark: 51,
  plcftxbxTxt: 56,
  plcfFldTxbx: 57,
  plcfHdrtxbxTxt: 58,
  plcfFldHdrTxbx: 59,
  plfLst: 73,
  plfLfo: 74,
} as const

export interface Fib {
  nFib: number
  /** the table stream is 1Table (else 0Table) */
  tbl1: boolean
  /** character counts of the main text and the other stories */
  ccpText: number
  ccpFtn: number
  ccpHdd: number
  ccpMcr: number
  ccpAtn: number
  ccpEdn: number
  ccpTxbx: number
  ccpHdrTxbx: number
  /** offset and size of a table (FC index) */
  fc(i: number): { fc: number; lcb: number }
}

/** Reads the FIB; throws for files this converter does not read (older versions, encrypted). */
export function readFib(wd: Bytes): Fib {
  if (wd.length < 0x44) throw new Error('Word document is truncated (no file information block)')
  let nFib = wd.u16(2)
  if (nFib < 0xc0) throw new Error('Word 6.0 / Word 95 and older documents are not supported (only Word 97-2003)')
  if (wd.u16(0) !== 0xa5ec) throw new Error('Not a Word document (bad signature)')
  const flags = wd.u16(0x0a)
  if (flags & 0x0100) throw new Error('Password-protected Word documents are not supported')

  const csw = wd.u16(0x20)
  const lwAt = 0x22 + csw * 2 + 2
  const cslw = wd.u16(lwAt - 2)
  const lw = (i: number) => (i < cslw ? wd.i32(lwAt + i * 4) : 0)
  const blobCountAt = lwAt + cslw * 4
  const cbRgFcLcb = wd.u16(blobCountAt)
  const blobAt = blobCountAt + 2
  const newAt = blobAt + cbRgFcLcb * 8
  if (wd.u16(newAt) > 0) {
    const nFibNew = wd.u16(newAt + 2)
    if (nFibNew) nFib = nFibNew
  }
  const n = (v: number) => Math.max(0, v)
  return {
    nFib,
    tbl1: !!(flags & 0x0200),
    ccpText: n(lw(3)),
    ccpFtn: n(lw(4)),
    ccpHdd: n(lw(5)),
    ccpMcr: n(lw(6)),
    ccpAtn: n(lw(7)),
    ccpEdn: n(lw(8)),
    ccpTxbx: n(lw(9)),
    ccpHdrTxbx: n(lw(10)),
    fc: (i) => (i < cbRgFcLcb ? { fc: wd.u32(blobAt + i * 8), lcb: wd.u32(blobAt + i * 8 + 4) } : { fc: 0, lcb: 0 }),
  }
}
