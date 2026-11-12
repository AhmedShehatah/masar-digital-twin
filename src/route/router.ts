/**
 * Shortest paths on the campus road network (Dijkstra).
 * The graph is built once by scripts/build_data.py from the 2026 roads,
 * split at every crossing. Start / end points are snapped onto the nearest
 * road; the short off-road legs to the actual point are returned separately
 * so they can be drawn as dashed "walk" lines.
 */
import type { Geometry } from 'geojson'

type LngLat = [number, number]
interface Graph { nodes: LngLat[]; edges: [number, number, number, number, LngLat[]][] }

export interface RouteResult {
  /** the road part, start snap → end snap */
  path: LngLat[]
  /** off-road legs: point → road, and road → point */
  legA: LngLat[]
  legB: LngLat[]
  roadMeters: number
  walkMeters: number
  /** off-road metres at the start and at the end */
  aMeters: number
  bMeters: number
  meters: number
  junctions: number
}

const LAT0 = 26.46
const KX = 111320 * Math.cos((LAT0 * Math.PI) / 180)
const KY = 110540
const xy = (p: LngLat) => [p[0] * KX, p[1] * KY] as const
const dist = (a: LngLat, b: LngLat) => Math.hypot((a[0] - b[0]) * KX, (a[1] - b[1]) * KY)

interface Snap { edge: number; t: number; at: number; point: LngLat; d: number; seg: number }

class MinHeap {
  private a: [number, number][] = []
  push(v: [number, number]) {
    const a = this.a; a.push(v); let i = a.length - 1
    while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p }
  }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop()!
    if (a.length) { a[0] = last; let i = 0
      for (;;) { const l = 2 * i + 1, r = l + 1; let m = i
        if (l < a.length && a[l][0] < a[m][0]) m = l
        if (r < a.length && a[r][0] < a[m][0]) m = r
        if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m } }
    return top
  }
  get size() { return this.a.length }
}

export class Router {
  private cum: number[][] // cumulative metres along each edge polyline
  private adj: { to: number; e: number }[][]

  constructor(private g: Graph) {
    this.cum = g.edges.map(([, , , , c]) => {
      const out = [0]
      for (let i = 1; i < c.length; i++) out.push(out[i - 1] + dist(c[i - 1], c[i]))
      return out
    })
    this.adj = g.nodes.map(() => [])
    g.edges.forEach(([a, b], e) => { this.adj[a].push({ to: b, e }); this.adj[b].push({ to: a, e }) })
  }

  /** nearest point on the network to p */
  snap(p: LngLat, avoid = false): Snap | null {
    const [px, py] = xy(p)
    let best: Snap | null = null
    this.g.edges.forEach(([, , , cons, c], e) => {
      if (avoid && cons) return
      for (let i = 0; i < c.length - 1; i++) {
        const [ax, ay] = xy(c[i]), [bx, by] = xy(c[i + 1])
        const dx = bx - ax, dy = by - ay
        const L2 = dx * dx + dy * dy || 1e-9
        const u = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2))
        const qx = ax + u * dx, qy = ay + u * dy
        const d = Math.hypot(px - qx, py - qy)
        if (!best || d < best.d) {
          const at = this.cum[e][i] + u * Math.sqrt(L2)
          best = { edge: e, seg: i, t: at / (this.cum[e].at(-1) || 1), at, point: [qx / KX, qy / KY], d }
        }
      }
    })
    return best
  }

  /** best point to start/finish for a feature: a building vertex closest to the roads */
  anchor(geom: Geometry, avoid = false): { point: LngLat; snap: Snap } | null {
    let pts: LngLat[] = []
    if (geom.type === 'Point') pts = [geom.coordinates as LngLat]
    else if (geom.type === 'Polygon') pts = geom.coordinates[0] as LngLat[]
    else if (geom.type === 'MultiPolygon') pts = geom.coordinates.flatMap((p) => p[0]) as LngLat[]
    else if (geom.type === 'LineString') pts = geom.coordinates as LngLat[]
    const step = Math.max(1, Math.floor(pts.length / 60))
    let best: { point: LngLat; snap: Snap } | null = null
    for (let i = 0; i < pts.length; i += step) {
      const s = this.snap(pts[i], avoid)
      if (s && (!best || s.d < best.snap.d)) best = { point: pts[i], snap: s }
    }
    return best
  }

  /** split an edge's polyline at a snap: [start→snap, snap→end] */
  private split(s: Snap): [LngLat[], LngLat[]] {
    const c = this.g.edges[s.edge][4]
    return [[...c.slice(0, s.seg + 1), s.point], [s.point, ...c.slice(s.seg + 1)]]
  }

  route(fromPt: LngLat, toPt: LngLat, opts: { avoidConstruction?: boolean; fromSnap?: Snap; toSnap?: Snap } = {}): RouteResult | null {
    const avoid = !!opts.avoidConstruction
    const A = opts.fromSnap ?? this.snap(fromPt, avoid)
    const B = opts.toSnap ?? this.snap(toPt, avoid)
    if (!A || !B) return null
    const E = this.g.edges
    const lenA = this.cum[A.edge].at(-1)!, lenB = this.cum[B.edge].at(-1)!
    const N = this.g.nodes.length
    const S = N, T = N + 1 // virtual start / end nodes
    const dist = new Float64Array(N + 2).fill(Infinity)
    const prev = new Int32Array(N + 2).fill(-1)
    const prevEdge = new Int32Array(N + 2).fill(-1)
    // virtual edges: S → ends of A's edge, ends of B's edge → T
    const [aFrom, aTo] = [E[A.edge][0], E[A.edge][1]]
    const [bFrom, bTo] = [E[B.edge][0], E[B.edge][1]]
    const extra = new Map<number, { to: number; w: number; tag: number }[]>()
    const add = (u: number, v: number, w: number, tag: number) => { if (!extra.has(u)) extra.set(u, []); extra.get(u)!.push({ to: v, w, tag }) }
    add(S, aFrom, A.at, -2); add(S, aTo, lenA - A.at, -3)
    add(bFrom, T, B.at, -4); add(bTo, T, lenB - B.at, -5)
    let direct = Infinity
    if (A.edge === B.edge) direct = Math.abs(A.at - B.at)

    dist[S] = 0
    const h = new MinHeap(); h.push([0, S])
    while (h.size) {
      const [d, u] = h.pop()
      if (d > dist[u]) continue
      if (u === T) break
      const relax = (v: number, w: number, tag: number) => {
        const nd = d + w
        if (nd < dist[v]) { dist[v] = nd; prev[v] = u; prevEdge[v] = tag; h.push([nd, v]) }
      }
      if (u < N) for (const { to, e } of this.adj[u]) { if (!(avoid && E[e][3])) relax(to, E[e][2], e) }
      for (const x of extra.get(u) ?? []) relax(x.to, x.w, x.tag)
    }
    if (dist[T] === Infinity && direct === Infinity) return null

    let path: LngLat[] = []
    let junctions = 0
    if (direct <= dist[T]) {
      const c = E[A.edge][4]
      const lo = A.at < B.at ? A : B, hi = A.at < B.at ? B : A
      path = [lo.point, ...c.slice(lo.seg + 1, hi.seg + 1), hi.point]
      if (lo !== A) path.reverse()
    } else {
      const [aLeft, aRight] = this.split(A)
      const [bLeft, bRight] = this.split(B)
      const pieces: LngLat[][] = []
      let v = T
      while (v !== S) {
        const u = prev[v], tag = prevEdge[v]
        if (tag === -2) pieces.push([...aLeft].reverse())           // S → aFrom: walk snap → start of edge
        else if (tag === -3) pieces.push(aRight)                    // S → aTo
        else if (tag === -4) pieces.push(bLeft)                     // bFrom → T
        else if (tag === -5) pieces.push([...bRight].reverse())     // bTo → T
        else {
          const [ea] = E[tag]
          const c = E[tag][4]
          pieces.push(ea === u ? c : [...c].reverse())
          junctions++
        }
        v = u
      }
      pieces.reverse().forEach((p) => path.push(...(path.length ? p.slice(1) : p)))
    }
    const roadMeters = Math.min(direct, dist[T])
    const legA: LngLat[] = A.d > 1 ? [fromPt, A.point] : []
    const legB: LngLat[] = B.d > 1 ? [B.point, toPt] : []
    const walkMeters = A.d + B.d
    return { path, legA, legB, roadMeters, walkMeters, aMeters: A.d, bMeters: B.d, meters: roadMeters + walkMeters, junctions }
  }
}

let cached: Promise<Router> | null = null
export function loadRouter() {
  cached ??= fetch('/data/roads.json').then((r) => r.json()).then((g: Graph) => new Router(g))
  return cached
}

export const WALK_M_PER_MIN = 80
export const DRIVE_M_PER_MIN = 400 // ~24 km/h inside campus
export const fmtDist = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} كم` : m < 20 ? `${Math.round(m)} م` : `${Math.round(m / 10) * 10} م`)
export const fmtMin = (min: number) => (min < 1 ? 'أقل من دقيقة' : `${Math.round(min)} دقيقة`)
