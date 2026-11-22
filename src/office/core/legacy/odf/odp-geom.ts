/**
 * Geometry for the ODP → PPTX conversion: frames (svg:x/y/width/height and draw:transform), custom shapes
 * (draw:enhanced-geometry: preset names, or the path with its equations as a DrawingML custom geometry),
 * SVG paths, polygons and ellipse segments.
 */
import { children, toPt, type ONode } from './common'
import { emu } from './odp-style'

/** a frame on the slide, in points; rotation clockwise in degrees */
export interface Box {
  x: number
  y: number
  w: number
  h: number
  rot: number
  flipH: boolean
  flipV: boolean
}

/** 2D affine matrix: x' = a x + c y + e, y' = b x + d y + f */
type Mat = [number, number, number, number, number, number]

/** `m` then `n` */
const then = (m: Mat, n: Mat): Mat => [
  n[0] * m[0] + n[2] * m[1],
  n[1] * m[0] + n[3] * m[1],
  n[0] * m[2] + n[2] * m[3],
  n[1] * m[2] + n[3] * m[3],
  n[0] * m[4] + n[2] * m[5] + n[4],
  n[1] * m[4] + n[3] * m[5] + n[5],
]
const apply = (m: Mat, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

const radians = (v: string) => {
  const m = /^\s*(-?[\d.]+(?:e-?\d+)?)\s*(deg|rad|grad)?\s*$/i.exec(v)
  if (!m) return 0
  const n = Number(m[1])
  const u = m[2]?.toLowerCase()
  return !Number.isFinite(n) ? 0 : u === 'deg' ? (n * Math.PI) / 180 : u === 'grad' ? (n * Math.PI) / 200 : n
}

/**
 * draw:transform, its operations applied left to right (as LibreOffice does). ODF rotations turn
 * counterclockwise on the page.
 */
export function parseTransform(v: string | undefined): Mat | undefined {
  if (!v) return undefined
  let m: Mat = [1, 0, 0, 1, 0, 0]
  let n = 0
  for (const op of v.matchAll(/([a-zA-Z]+)\s*\(([^)]*)\)/g)) {
    if (++n > 32) break
    const args = op[2].trim().split(/[\s,]+/).filter(Boolean)
    const len = (k: number) => toPt(args[k]) ?? 0
    let t: Mat | undefined
    switch (op[1].toLowerCase()) {
      case 'rotate': {
        const a = radians(args[0] ?? '0')
        t = [Math.cos(a), -Math.sin(a), Math.sin(a), Math.cos(a), 0, 0]
        break
      }
      case 'translate':
        t = [1, 0, 0, 1, len(0), args.length > 1 ? len(1) : 0]
        break
      case 'scale': {
        const sx = Number(args[0])
        const sy = args.length > 1 ? Number(args[1]) : sx
        if (Number.isFinite(sx) && Number.isFinite(sy)) t = [sx, 0, 0, sy, 0, 0]
        break
      }
      case 'skewx':
        t = [1, 0, Math.tan(radians(args[0] ?? '0')), 1, 0, 0]
        break
      case 'skewy':
        t = [1, Math.tan(radians(args[0] ?? '0')), 0, 1, 0, 0]
        break
      case 'matrix': {
        const k = args.slice(0, 4).map(Number)
        if (k.length === 4 && k.every(Number.isFinite)) t = [k[0], k[1], k[2], k[3], len(4), len(5)]
        break
      }
    }
    if (t && t.every(Number.isFinite)) m = then(m, t)
  }
  return m
}

/** the frame a matrix gives a w × h box at the origin: rotation from its x axis, a mirrored y axis as a vertical flip */
function decompose(m: Mat, w: number, h: number): Box {
  const sx = Math.hypot(m[0], m[1])
  const sy = Math.hypot(m[2], m[3])
  const det = m[0] * m[3] - m[1] * m[2]
  let rot = (Math.atan2(m[1], m[0]) * 180) / Math.PI
  rot = ((rot % 360) + 360) % 360
  if (Math.abs(rot - Math.round(rot)) < 1e-6) rot = Math.round(rot) % 360
  const W = w * (sx || 1)
  const H = h * (sy || 1)
  const [cx, cy] = apply(m, w / 2, h / 2)
  return { x: cx - W / 2, y: cy - H / 2, w: W, h: H, rot, flipH: false, flipV: det < 0 }
}

/** the frame of a shape: svg:x, svg:y, svg:width, svg:height and draw:transform */
export function frameBox(el: ONode): Box | undefined {
  const a = el.attrs
  const w = Math.max(0, toPt(a['svg:width']) ?? 0)
  const h = Math.max(0, toPt(a['svg:height']) ?? 0)
  const x = toPt(a['svg:x'])
  const y = toPt(a['svg:y'])
  const tr = parseTransform(a['draw:transform'])
  if (!tr) {
    if (x === undefined && y === undefined && !a['svg:width'] && !a['svg:height']) return undefined
    return { x: x ?? 0, y: y ?? 0, w, h, rot: 0, flipH: false, flipV: false }
  }
  return decompose(then([1, 0, 0, 1, x ?? 0, y ?? 0], tr), w, h)
}

/** the end points of a line (draw:line, draw:connector, draw:measure), transformed */
export function linePoints(el: ONode): [number, number, number, number] {
  const a = el.attrs
  const p = [a['svg:x1'], a['svg:y1'], a['svg:x2'], a['svg:y2']].map((v) => toPt(v) ?? 0)
  const tr = parseTransform(a['draw:transform'])
  if (!tr) return [p[0], p[1], p[2], p[3]]
  const [x1, y1] = apply(tr, p[0], p[1])
  const [x2, y2] = apply(tr, p[2], p[3])
  return [x1, y1, x2, y2]
}

// ---------------------------------------------------------------- paths

interface SubPath {
  d: string
  fill: boolean
  stroke: boolean
  /** shading of the fill: darken, darkenLess, lighten, lightenLess */
  shade?: string
}

/** DrawingML path commands from source coordinates mapped into the shape's box (EMU) */
class PathBuilder {
  paths: SubPath[] = []
  private cur: SubPath = { d: '', fill: true, stroke: true }
  /** current point and subpath start, in source coordinates */
  x = 0
  y = 0
  private sx = 0
  private sy = 0
  private closed = false
  /** a subpath not closed (drawn as a line, not filled) */
  unclosed = false
  private started = false

  constructor(private map: (x: number, y: number) => [number, number]) {}

  private pt(x: number, y: number): string {
    const [X, Y] = this.map(x, y)
    if (!Number.isFinite(X) || !Number.isFinite(Y)) throw new Error('bad point')
    return `<a:pt x="${Math.round(X)}" y="${Math.round(Y)}"/>`
  }

  moveTo(x: number, y: number) {
    if (this.started && !this.closed) this.unclosed = true
    this.cur.d += `<a:moveTo>${this.pt(x, y)}</a:moveTo>`
    this.x = this.sx = x
    this.y = this.sy = y
    this.started = true
    this.closed = false
  }

  lineTo(x: number, y: number) {
    if (!this.started) return this.moveTo(x, y)
    this.cur.d += `<a:lnTo>${this.pt(x, y)}</a:lnTo>`
    this.x = x
    this.y = y
  }

  cubic(x1: number, y1: number, x2: number, y2: number, x: number, y: number) {
    if (!this.started) this.moveTo(this.x, this.y)
    this.cur.d += `<a:cubicBezTo>${this.pt(x1, y1)}${this.pt(x2, y2)}${this.pt(x, y)}</a:cubicBezTo>`
    this.x = x
    this.y = y
  }

  quad(x1: number, y1: number, x: number, y: number) {
    if (!this.started) this.moveTo(this.x, this.y)
    this.cur.d += `<a:quadBezTo>${this.pt(x1, y1)}${this.pt(x, y)}</a:quadBezTo>`
    this.x = x
    this.y = y
  }

  close() {
    if (!this.started) return
    this.cur.d += '<a:close/>'
    this.x = this.sx
    this.y = this.sy
    this.closed = true
  }

  /** an elliptical arc as cubic Béziers: center, radii, start parameter and sweep (radians, y down) */
  arc(cx: number, cy: number, rx: number, ry: number, t0: number, dt: number, move: boolean) {
    const at = (t: number): [number, number] => [cx + rx * Math.cos(t), cy + ry * Math.sin(t)]
    const [x0, y0] = at(t0)
    if (move) this.moveTo(x0, y0)
    else this.lineTo(x0, y0)
    if (!rx || !ry || !dt) return
    const n = Math.min(16, Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9)))
    const d = dt / n
    const k = (4 / 3) * Math.tan(d / 4)
    for (let i = 0; i < n; i++) {
      const a = t0 + i * d
      const b = a + d
      const [ax, ay] = at(a)
      const [bx, by] = at(b)
      this.cubic(ax - k * rx * Math.sin(a), ay + k * ry * Math.cos(a), bx + k * rx * Math.sin(b), by - k * ry * Math.cos(b), bx, by)
    }
  }

  /** ends the current path (draw:enhanced-path N) */
  end() {
    if (this.cur.d) this.paths.push(this.cur)
    if (this.started && !this.closed) this.unclosed = true
    this.cur = { d: '', fill: true, stroke: true }
    this.started = false
    this.closed = false
  }

  noFill() {
    this.cur.fill = false
  }

  noStroke() {
    this.cur.stroke = false
  }

  shade(mode: string) {
    this.cur.shade = mode
  }
}

export interface Geom {
  /** a:prstGeom or a:custGeom */
  xml: string
  flipH: boolean
  flipV: boolean
  /** a line or curve that is not closed (no fill) */
  open: boolean
  /**
   * mirrored on one axis: LibreOffice mirrors such a shape after rotating it, so its rotation turns the other
   * way in DrawingML (which flips first)
   */
  turn?: boolean
  /** the text area's distances from the frame edges (pt): left, top, right, bottom (added to the insets) */
  textArea?: [number, number, number, number]
}

const prst = (name: string, adj = '') => `<a:prstGeom prst="${name}"><a:avLst>${adj}</a:avLst></a:prstGeom>`
export const RECT = prst('rect')

function custGeom(paths: SubPath[], W: number, H: number): string {
  const w = Math.max(1, Math.round(W))
  const h = Math.max(1, Math.round(H))
  const rect = '<a:rect l="l" t="t" r="r" b="b"/>'
  const list = paths.map((p) => `<a:path w="${w}" h="${h}"${p.fill ? (p.shade ? ` fill="${p.shade}"` : '') : ' fill="none"'}${p.stroke ? '' : ' stroke="0"'}>${p.d}</a:path>`).join('')
  return `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/>${rect}<a:pathLst>${list}</a:pathLst></a:custGeom>`
}

// ---------------------------------------------------------------- enhanced geometry

const CONST = new Set(['pi', 'left', 'top', 'right', 'bottom', 'xstretch', 'ystretch', 'hasstroke', 'hasfill', 'width', 'height', 'logwidth', 'logheight'])

/** the equations and modifiers of a draw:enhanced-geometry */
class Equations {
  private formulas = new Map<string, string>()
  private values = new Map<string, number>()
  private busy = new Set<string>()
  private mods: number[]
  private steps = 0

  constructor(
    eg: ONode,
    private env: Record<string, number>,
  ) {
    for (const e of children(eg, 'draw:equation')) if (e.attrs['draw:name']) this.formulas.set(e.attrs['draw:name'], e.attrs['draw:formula'] ?? '0')
    this.mods = (eg.attrs['draw:modifiers'] ?? '').trim().split(/\s+/).filter(Boolean).map(Number)
  }

  /** a parameter: number, ?equation, $modifier or constant */
  value(tok: string): number {
    if (tok.startsWith('?')) return this.equation(tok.slice(1))
    if (tok.startsWith('$')) return this.mods[Number(tok.slice(1))] ?? 0
    if (CONST.has(tok)) return tok === 'pi' ? Math.PI : (this.env[tok] ?? 0)
    const n = Number(tok)
    return Number.isFinite(n) ? n : NaN
  }

  private equation(name: string): number {
    const known = this.values.get(name)
    if (known !== undefined) return known
    const f = this.formulas.get(name)
    if (f === undefined || this.busy.has(name) || this.busy.size > 200) return 0
    this.busy.add(name)
    let v: number
    try {
      v = this.evaluate(f)
    } finally {
      this.busy.delete(name)
    }
    if (!Number.isFinite(v)) v = 0
    this.values.set(name, v)
    return v
  }

  /** a draw:formula: + - * /, unary minus, functions, parentheses */
  private evaluate(src: string): number {
    const toks = src.match(/\?[A-Za-z0-9_]+|\$\d+|[A-Za-z_][A-Za-z0-9_]*|(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?|[-+*/(),]/g) ?? []
    let i = 0
    const peek = () => toks[i]
    const expr = (): number => {
      let v = term()
      while (peek() === '+' || peek() === '-') v = toks[i++] === '+' ? v + term() : v - term()
      return v
    }
    const term = (): number => {
      let v = unary()
      while (peek() === '*' || peek() === '/') {
        if (toks[i++] === '*') v *= unary()
        else {
          const d = unary()
          v = d === 0 ? 0 : v / d
        }
      }
      return v
    }
    const unary = (): number => {
      if (peek() === '-') {
        i++
        return -unary()
      }
      if (peek() === '+') {
        i++
        return unary()
      }
      return primary()
    }
    const args = (): number[] => {
      const out: number[] = []
      if (toks[i] !== '(') return out
      i++
      if (peek() === ')') return i++, out
      for (let guard = 0; guard < 16 && i < toks.length; guard++) {
        out.push(expr())
        if (peek() === ',') i++
        else break
      }
      if (peek() === ')') i++
      return out
    }
    const primary = (): number => {
      if (++this.steps > 100000) throw new Error('formula too long')
      const t = toks[i++]
      if (t === undefined) return 0
      if (t === '(') {
        const v = expr()
        if (peek() === ')') i++
        return v
      }
      const f = t.toLowerCase()
      if (/^[a-z]/.test(f) && !CONST.has(f) && toks[i] === '(') {
        const a = args()
        const [x = 0, y = 0, z = 0] = a
        switch (f) {
          case 'abs':
            return Math.abs(x)
          case 'sqrt':
            return Math.sqrt(Math.max(0, x))
          case 'sin':
            return Math.sin(x)
          case 'cos':
            return Math.cos(x)
          case 'tan':
            return Math.tan(x)
          case 'atan':
            return Math.atan(x)
          case 'atan2':
            return Math.atan2(x, y)
          case 'min':
            return Math.min(x, y)
          case 'max':
            return Math.max(x, y)
          case 'if':
            return x > 0 ? y : z
          default:
            return 0
        }
      }
      return this.value(CONST.has(f) ? f : t)
    }
    const v = expr()
    return Number.isFinite(v) ? v : 0
  }
}

/** custom shape types that are DrawingML presets exactly (adjustments converted) */
function exactPreset(type: string, mods: number[], w: number, h: number): string | undefined {
  const pct = (v: number, of = 21600) => Math.round((v / of) * 100000)
  switch (type) {
    case 'rectangle':
    case 'mso-spt1':
    case 'mso-spt202':
    case 'flowchart-process':
      return RECT
    case 'round-rectangle': {
      const r = Math.min(50000, Math.max(0, pct(mods[0] ?? 3600)))
      return prst('roundRect', `<a:gd name="adj" fmla="val ${r}"/>`)
    }
    case 'ellipse':
    case 'flowchart-connector':
      return prst('ellipse')
    case 'isosceles-triangle':
      return prst('triangle', `<a:gd name="adj" fmla="val ${Math.min(100000, Math.max(0, pct(mods[0] ?? 10800)))}"/>`)
    case 'right-triangle':
      return prst('rtTriangle')
    case 'diamond':
      return prst('diamond')
    case 'flowchart-decision':
      return prst('flowChartDecision')
  }
  // shapes kept from Office Open XML files, at their default adjustments
  const ooxml = /^ooxml-([a-zA-Z0-9]+)$/.exec(type)
  if (ooxml && ooxml[1] !== 'non' && !/primitive/i.test(ooxml[1]) && !mods.length) return prst(ooxml[1])
  void w
  void h
  return undefined
}

/** custom shape types → presets, for shapes without a path (their default look) */
const BY_NAME: Record<string, string> = {
  rectangle: 'rect', 'round-rectangle': 'roundRect', ellipse: 'ellipse', circle: 'ellipse', diamond: 'diamond', 'isosceles-triangle': 'triangle',
  'right-triangle': 'rtTriangle', parallelogram: 'parallelogram', trapezoid: 'trapezoid', hexagon: 'hexagon', octagon: 'octagon', pentagon: 'pentagon',
  cross: 'plus', star4: 'star4', star5: 'star5', star6: 'star6', star8: 'star8', star12: 'star12', star24: 'star24', 'right-arrow': 'rightArrow',
  'left-arrow': 'leftArrow', 'up-arrow': 'upArrow', 'down-arrow': 'downArrow', 'left-right-arrow': 'leftRightArrow', 'up-down-arrow': 'upDownArrow',
  'pentagon-right': 'homePlate', chevron: 'chevron', can: 'can', cube: 'cube', ring: 'donut', heart: 'heart', smiley: 'smileyFace', sun: 'sun',
  moon: 'moon', lightning: 'lightningBolt', 'rectangular-callout': 'wedgeRectCallout', 'round-rectangular-callout': 'wedgeRoundRectCallout',
  'round-callout': 'wedgeEllipseCallout', 'cloud-callout': 'cloudCallout', 'block-arc': 'blockArc', frame: 'frame', paper: 'foldedCorner',
  'vertical-scroll': 'verticalScroll', 'horizontal-scroll': 'horizontalScroll', 'quad-bevel': 'bevel', forbidden: 'noSmoking',
  'bracket-pair': 'bracketPair', 'brace-pair': 'bracePair', 'left-bracket': 'leftBracket', 'right-bracket': 'rightBracket', 'left-brace': 'leftBrace',
  'right-brace': 'rightBrace', 'flowchart-decision': 'flowChartDecision', 'flowchart-terminator': 'flowChartTerminator',
  'flowchart-alternate-process': 'flowChartAlternateProcess', 'flowchart-data': 'flowChartInputOutput', 'flowchart-document': 'flowChartDocument',
  'flowchart-connector': 'flowChartConnector', 'flowchart-magnetic-disk': 'flowChartMagneticDisk', 'mso-spt202': 'rect', 'mso-spt1': 'rect',
}

/** the parameters each enhanced-path command takes */
const ARITY: Record<string, number> = { M: 2, L: 2, C: 6, Q: 4, T: 6, U: 6, A: 8, B: 8, W: 8, V: 8, X: 2, Y: 2, G: 4 }

/** runs an enhanced path; false when it can't be read */
function runEnhanced(path: string, eq: Equations, b: PathBuilder): boolean {
  const toks = path.match(/\?[A-Za-z0-9_]+|\$\d+|[A-Za-z]+|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? []
  let i = 0
  let cmd = ''
  let quadrant = 0
  const isCmd = (t: string) => t.length === 1 && /[A-Z]/.test(t)
  const deg = Math.PI / 180
  for (let steps = 0; i < toks.length && steps < 100000; steps++) {
    const t = toks[i]
    if (isCmd(t)) {
      cmd = t
      i++
      quadrant = 0
      switch (cmd) {
        case 'Z':
          b.close()
          break
        case 'N':
          b.end()
          break
        case 'F':
          b.noFill()
          break
        case 'S':
          b.noStroke()
          break
        case 'H':
          b.shade('darken')
          break
        case 'I':
          b.shade('darkenLess')
          break
        case 'J':
          b.shade('lighten')
          break
        case 'K':
          b.shade('lightenLess')
          break
      }
      continue
    }
    const n = ARITY[cmd]
    if (!n) return false
    if (i + n > toks.length) break
    const p: number[] = []
    for (let k = 0; k < n; k++) {
      if (isCmd(toks[i + k])) return false
      p.push(eq.value(toks[i + k]))
    }
    i += n
    if (p.some((v) => !Number.isFinite(v))) return false
    switch (cmd) {
      case 'M':
        b.moveTo(p[0], p[1])
        cmd = 'L'
        break
      case 'L':
        b.lineTo(p[0], p[1])
        break
      case 'C':
        b.cubic(p[0], p[1], p[2], p[3], p[4], p[5])
        break
      case 'Q':
        b.quad(p[0], p[1], p[2], p[3])
        break
      case 'T':
      case 'U': {
        // center, radii, start and end angles in degrees (counterclockwise on the page)
        const [cx, cy, rx, ry, a0, a1] = p
        // equal angles (modulo a turn) draw the whole ellipse
        const norm = (v: number) => ((Math.round(v) % 360) + 360) % 360
        let sweep = a1 - a0
        if (Math.abs(sweep) >= 360 || norm(a0) === norm(a1)) sweep = 360
        else sweep = ((sweep % 360) + 360) % 360
        b.arc(cx, cy, Math.abs(rx), Math.abs(ry), -a0 * deg, -sweep * deg, cmd === 'U')
        break
      }
      case 'A':
      case 'B':
      case 'W':
      case 'V': {
        const [x1, y1, x2, y2, x3, y3, x4, y4] = p
        const cx = (x1 + x2) / 2
        const cy = (y1 + y2) / 2
        const rx = Math.abs(x2 - x1) / 2
        const ry = Math.abs(y2 - y1) / 2
        if (!rx || !ry) {
          b.lineTo(x4, y4)
          break
        }
        const ts = Math.atan2((y3 - cy) / ry, (x3 - cx) / rx)
        const te = Math.atan2((y4 - cy) / ry, (x4 - cx) / rx)
        let dt = te - ts
        const cw = cmd === 'W' || cmd === 'V'
        if (cw) {
          if (dt <= 0) dt += 2 * Math.PI
        } else if (dt >= 0) dt -= 2 * Math.PI
        b.arc(cx, cy, rx, ry, ts, dt, cmd === 'B' || cmd === 'V')
        break
      }
      case 'X':
      case 'Y': {
        // a quarter ellipse from the current point, starting along x (X) or y (Y); the direction alternates
        const along = (cmd === 'X') === (quadrant % 2 === 0)
        quadrant++
        const [x, y] = p
        const x0 = b.x
        const y0 = b.y
        const k = 0.5522847498
        if (along) b.cubic(x0 + k * (x - x0), y0, x, y + k * (y0 - y), x, y)
        else b.cubic(x0, y0 + k * (y - y0), x + k * (x0 - x), y, x, y)
        break
      }
      case 'G': {
        // Office Open XML arcTo: radii, start angle and sweep (degrees, clockwise), from the current point
        const [wr, hr, st, sw] = p
        if (!wr || !hr) break
        const param = (a: number) => Math.atan2(wr * Math.sin(a * deg), hr * Math.cos(a * deg))
        const t0 = param(st)
        let dt = param(st + sw) - t0
        if (Math.abs(sw) >= 360) dt = Math.sign(sw) * 2 * Math.PI
        else if (sw > 0 && dt < 0) dt += 2 * Math.PI
        else if (sw < 0 && dt > 0) dt -= 2 * Math.PI
        const cx = b.x - wr * Math.cos(t0)
        const cy = b.y - hr * Math.sin(t0)
        b.arc(cx, cy, Math.abs(wr), Math.abs(hr), t0, dt, false)
        break
      }
    }
  }
  b.end()
  return b.paths.length > 0
}

/** a draw:custom-shape's geometry in a w × h (pt) box */
export function customGeom(eg: ONode | undefined, w: number, h: number): Geom {
  if (!eg) return { xml: RECT, flipH: false, flipV: false, open: false }
  const a = eg.attrs
  const type = a['draw:type'] ?? ''
  const mirrorH = a['draw:mirror-horizontal'] === 'true'
  const mirrorV = a['draw:mirror-vertical'] === 'true'
  const mods = (a['draw:modifiers'] ?? '').trim().split(/\s+/).filter(Boolean).map(Number)
  const turn = mirrorH !== mirrorV
  const exact = exactPreset(type, mods, w, h)
  if (exact) return { xml: exact, flipH: mirrorH, flipV: mirrorV, open: false, turn }
  const path = a['drawooo:enhanced-path'] ?? a['draw:enhanced-path']
  if (path) {
    const W = emu(w)
    const H = emu(h)
    const vb = (a['svg:viewBox'] ?? '').trim().split(/[\s,]+/).map(Number)
    const [vl, vt, vw, vh] = vb.length === 4 && vb.every(Number.isFinite) ? vb : [0, 0, 21600, 21600]
    // logical size: 1/100 mm
    const lw = (w * 2540) / 72
    const lh = (h * 2540) / 72
    const env: Record<string, number> = {
      left: vl, top: vt, right: vl + vw, bottom: vt + vh, width: vw, height: vh, logwidth: lw, logheight: lh,
      xstretch: Number(a['draw:path-stretchpoint-x'] ?? 0) || 0, ystretch: Number(a['draw:path-stretchpoint-y'] ?? 0) || 0, hasstroke: 1, hasfill: 1,
    }
    const eq = new Equations(eg, env)
    // coordinates: the view box, the sizes of the paths (shapes from Office Open XML), else 1/100 mm
    const sub = (a['drawooo:sub-view-size'] ?? '').trim().split(/\s+/).filter(Boolean).map(Number)
    let section = 0
    const scale = (): [number, number, number, number] => {
      if (vw > 0 && vh > 0) return [vl, vt, W / vw, H / vh]
      const sw = sub[section * 2] ?? sub[0]
      const sh = sub[section * 2 + 1] ?? sub[1]
      if (sw > 0 && sh > 0) return [0, 0, W / sw, H / sh]
      return [0, 0, lw ? W / lw : 0, lh ? H / lh : 0]
    }
    const map = (x: number, y: number): [number, number] => {
      const [ox, oy, kx, ky] = scale()
      const X = (x - ox) * kx
      const Y = (y - oy) * ky
      return [mirrorH ? W - X : X, mirrorV ? H - Y : Y]
    }
    const b = new PathBuilder(map)
    const end = b.end.bind(b)
    b.end = () => {
      end()
      section++
    }
    try {
      if (runEnhanced(path, eq, b)) {
        section = 0
        // the text area: as insets, so that every reader places the text alike
        let textArea: [number, number, number, number] | undefined
        const areas = (a['draw:text-areas'] ?? '').trim().split(/\s+/).filter(Boolean)
        if (areas.length >= 4 && W > 0 && H > 0) {
          const v = areas.slice(0, 4).map((t) => eq.value(t))
          const [l, t] = map(v[0], v[1])
          const [r, bt] = map(v[2], v[3])
          const k = 1 / 12700
          const area = [Math.min(l, r) * k, Math.min(t, bt) * k, (W - Math.max(l, r)) * k, (H - Math.max(t, bt)) * k]
          if (area.every((x) => Number.isFinite(x) && x >= 0) && area[0] + area[2] < w && area[1] + area[3] < h) textArea = area as [number, number, number, number]
        }
        const open = b.paths.every((p) => !p.fill)
        return { xml: custGeom(b.paths, W, H), flipH: false, flipV: false, open, turn, textArea }
      }
    } catch {
      // unreadable path: the preset by name below
    }
  }
  const name = BY_NAME[type] ?? (/^ooxml-([a-zA-Z0-9]+)$/.exec(type)?.[1] !== 'non' ? /^ooxml-([a-zA-Z0-9]+)$/.exec(type)?.[1] : undefined)
  return { xml: name ? prst(name) : RECT, flipH: mirrorH, flipV: mirrorV, open: false, turn }
}

// ---------------------------------------------------------------- SVG paths, polygons, ellipses

const viewBoxOf = (el: ONode, w: number, h: number): [number, number, number, number] => {
  const vb = (el.attrs['svg:viewBox'] ?? '').trim().split(/[\s,]+/).map(Number)
  return vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0 ? (vb as [number, number, number, number]) : [0, 0, w || 1, h || 1]
}

/** maps view box coordinates into the box (EMU) */
function boxMap(el: ONode, w: number, h: number) {
  const [vl, vt, vw, vh] = viewBoxOf(el, w, h)
  const W = emu(w)
  const H = emu(h)
  return { W, H, map: (x: number, y: number): [number, number] => [((x - vl) / vw) * W, ((y - vt) / vh) * H] }
}

/** svg:d → path commands */
function runSvgPath(d: string, b: PathBuilder): void {
  const toks = d.match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? []
  let i = 0
  let cmd = ''
  let lastCtrl: [number, number] | undefined
  let lastQuad: [number, number] | undefined
  const nums = (n: number): number[] | undefined => {
    if (i + n > toks.length) return undefined
    const out = toks.slice(i, i + n).map(Number)
    if (out.some((v) => !Number.isFinite(v))) return undefined
    i += n
    return out
  }
  for (let steps = 0; i < toks.length && steps < 200000; steps++) {
    if (/[a-zA-Z]/.test(toks[i])) {
      cmd = toks[i++]
      if (cmd === 'Z' || cmd === 'z') {
        b.close()
        lastCtrl = lastQuad = undefined
      }
      continue
    }
    const rel = cmd === cmd.toLowerCase()
    const ox = rel ? b.x : 0
    const oy = rel ? b.y : 0
    let ctrl: [number, number] | undefined
    let quad: [number, number] | undefined
    switch (cmd.toUpperCase()) {
      case 'M': {
        const p = nums(2)
        if (!p) return
        b.moveTo(ox + p[0], oy + p[1])
        cmd = rel ? 'l' : 'L'
        break
      }
      case 'L': {
        const p = nums(2)
        if (!p) return
        b.lineTo(ox + p[0], oy + p[1])
        break
      }
      case 'H': {
        const p = nums(1)
        if (!p) return
        b.lineTo(ox + p[0], b.y)
        break
      }
      case 'V': {
        const p = nums(1)
        if (!p) return
        b.lineTo(b.x, oy + p[0])
        break
      }
      case 'C': {
        const p = nums(6)
        if (!p) return
        b.cubic(ox + p[0], oy + p[1], ox + p[2], oy + p[3], ox + p[4], oy + p[5])
        ctrl = [ox + p[2], oy + p[3]]
        break
      }
      case 'S': {
        const p = nums(4)
        if (!p) return
        const c1: [number, number] = lastCtrl ? [2 * b.x - lastCtrl[0], 2 * b.y - lastCtrl[1]] : [b.x, b.y]
        b.cubic(c1[0], c1[1], ox + p[0], oy + p[1], ox + p[2], oy + p[3])
        ctrl = [ox + p[0], oy + p[1]]
        break
      }
      case 'Q': {
        const p = nums(4)
        if (!p) return
        b.quad(ox + p[0], oy + p[1], ox + p[2], oy + p[3])
        quad = [ox + p[0], oy + p[1]]
        break
      }
      case 'T': {
        const p = nums(2)
        if (!p) return
        const c: [number, number] = lastQuad ? [2 * b.x - lastQuad[0], 2 * b.y - lastQuad[1]] : [b.x, b.y]
        b.quad(c[0], c[1], ox + p[0], oy + p[1])
        quad = c
        break
      }
      case 'A': {
        const p = nums(7)
        if (!p) return
        svgArc(b, p[0], p[1], p[2], !!p[3], !!p[4], ox + p[5], oy + p[6])
        break
      }
      default:
        return
    }
    lastCtrl = ctrl
    lastQuad = quad
  }
}

/** an SVG elliptical arc (endpoint parameterization) as Béziers */
function svgArc(b: PathBuilder, rx: number, ry: number, rotDeg: number, large: boolean, sweep: boolean, x: number, y: number) {
  const x0 = b.x
  const y0 = b.y
  rx = Math.abs(rx)
  ry = Math.abs(ry)
  if (!rx || !ry || (x0 === x && y0 === y)) return b.lineTo(x, y)
  // rotated ellipses are drawn unrotated (rare in presentations)
  void rotDeg
  const dx = (x0 - x) / 2
  const dy = (y0 - y) / 2
  const lambda = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry)
  if (lambda > 1) {
    rx *= Math.sqrt(lambda)
    ry *= Math.sqrt(lambda)
  }
  const num = rx * rx * ry * ry - rx * rx * dy * dy - ry * ry * dx * dx
  const den = rx * rx * dy * dy + ry * ry * dx * dx
  let k = Math.sqrt(Math.max(0, num / (den || 1)))
  if (large === sweep) k = -k
  const cxp = (k * rx * dy) / ry
  const cyp = (-k * ry * dx) / rx
  const cx = cxp + (x0 + x) / 2
  const cy = cyp + (y0 + y) / 2
  const t0 = Math.atan2((y0 - cy) / ry, (x0 - cx) / rx)
  let dt = Math.atan2((y - cy) / ry, (x - cx) / rx) - t0
  if (sweep && dt < 0) dt += 2 * Math.PI
  else if (!sweep && dt > 0) dt -= 2 * Math.PI
  b.arc(cx, cy, rx, ry, t0, dt, false)
}

/** the bounds of an svg:d (all points, control points included) */
export function svgPathBounds(d: string): [number, number, number, number] | undefined {
  const box = [Infinity, Infinity, -Infinity, -Infinity]
  const b = new PathBuilder((x, y) => {
    box[0] = Math.min(box[0], x)
    box[1] = Math.min(box[1], y)
    box[2] = Math.max(box[2], x)
    box[3] = Math.max(box[3], y)
    return [0, 0]
  })
  try {
    runSvgPath(d, b)
  } catch {
    return undefined
  }
  return box.every(Number.isFinite) ? (box as [number, number, number, number]) : undefined
}

/** draw:path (svg:d in its svg:viewBox) as a custom geometry; `origin` overrides the view box origin */
export function svgPathGeom(el: ONode, w: number, h: number, origin?: [number, number, number, number]): Geom | undefined {
  const { W, H, map } = origin
    ? { W: emu(w), H: emu(h), map: (x: number, y: number): [number, number] => [((x - origin[0]) / (origin[2] || 1)) * emu(w), ((y - origin[1]) / (origin[3] || 1)) * emu(h)] }
    : boxMap(el, w, h)
  const b = new PathBuilder(map)
  try {
    runSvgPath(el.attrs['svg:d'] ?? '', b)
    b.end()
  } catch {
    return undefined
  }
  if (!b.paths.length) return undefined
  const open = b.unclosed
  if (open) for (const p of b.paths) p.fill = false
  return { xml: custGeom(b.paths, W, H), flipH: false, flipV: false, open }
}

/** draw:polygon / draw:polyline (draw:points in the svg:viewBox) */
export function polyGeom(el: ONode, w: number, h: number, closed: boolean): Geom | undefined {
  const { W, H, map } = boxMap(el, w, h)
  const pts = (el.attrs['draw:points'] ?? '').trim().split(/\s+/).slice(0, 100000).map((p) => p.split(',').map(Number)).filter((p) => p.length === 2 && p.every(Number.isFinite))
  if (pts.length < 2) return undefined
  const b = new PathBuilder(map)
  pts.forEach(([x, y], k) => (k ? b.lineTo(x, y) : b.moveTo(x, y)))
  if (closed) b.close()
  else b.noFill()
  b.end()
  return { xml: custGeom(b.paths, W, H), flipH: false, flipV: false, open: !closed }
}

/** draw:ellipse / draw:circle: full, or a section, cut or arc between draw:start-angle and draw:end-angle */
export function ellipseGeom(el: ONode, w: number, h: number): Geom {
  const kind = el.attrs['draw:kind'] ?? 'full'
  const s = Number(el.attrs['draw:start-angle'] ?? 0)
  const e = Number(el.attrs['draw:end-angle'] ?? 360)
  if (kind === 'full' || !Number.isFinite(s) || !Number.isFinite(e)) return { xml: prst('ellipse'), flipH: false, flipV: false, open: false }
  const W = emu(w)
  const H = emu(h)
  const b = new PathBuilder((x, y) => [x * W, y * H])
  let sweep = e - s
  if (sweep <= 0) sweep += 360
  const deg = Math.PI / 180
  if (kind === 'section') b.moveTo(0.5, 0.5)
  b.arc(0.5, 0.5, 0.5, 0.5, -s * deg, -sweep * deg, kind !== 'section')
  if (kind === 'arc') b.noFill()
  else b.close()
  b.end()
  return { xml: custGeom(b.paths, W, H), flipH: false, flipV: false, open: kind === 'arc' }
}

/** draw:regular-polygon: a polygon or star with draw:corners corners */
export function regularGeom(el: ONode, w: number, h: number): Geom {
  const n = Math.min(100, Math.max(3, Number(el.attrs['draw:corners'] ?? 5) || 5))
  const star = el.attrs['draw:concave'] === 'true'
  const sharp = Math.min(1, Math.max(0, parseFloat(el.attrs['draw:sharpness'] ?? '50') / 100 || 0.5))
  const W = emu(w)
  const H = emu(h)
  const b = new PathBuilder((x, y) => [x * W, y * H])
  const count = star ? n * 2 : n
  for (let i = 0; i < count; i++) {
    const t = -Math.PI / 2 + (i * 2 * Math.PI) / count
    const r = star && i % 2 ? 0.5 * (1 - sharp) : 0.5
    const x = 0.5 + r * Math.cos(t)
    const y = 0.5 + r * Math.sin(t)
    if (i) b.lineTo(x, y)
    else b.moveTo(x, y)
  }
  b.close()
  b.end()
  return { xml: custGeom(b.paths, W, H), flipH: false, flipV: false, open: false }
}

/** draw:rect: a rectangle, rounded by draw:corner-radius */
export function rectGeom(el: ONode, w: number, h: number): Geom {
  const r = toPt(el.attrs['draw:corner-radius']) ?? 0
  const ss = Math.min(w, h)
  if (r > 0 && ss > 0) return { xml: prst('roundRect', `<a:gd name="adj" fmla="val ${Math.min(50000, Math.round((r / ss) * 100000))}"/>`), flipH: false, flipV: false, open: false }
  return { xml: RECT, flipH: false, flipV: false, open: false }
}
