export const EMU_PER_PX = 9525
export const EMU_PER_PT = 12700
export const emuToPx = (v: number | undefined) => (v ?? 0) / EMU_PER_PX
export const emuToPt = (v: number | undefined) => (v ?? 0) / EMU_PER_PT
export const twipToPt = (v: number | undefined) => (v ?? 0) / 20
export const ptToPx = (pt: number) => (pt * 96) / 72
export const round2 = (v: number) => Math.round(v * 100) / 100
