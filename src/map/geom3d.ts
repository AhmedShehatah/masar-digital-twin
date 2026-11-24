import * as THREE from 'three'
import { CAMPUS_CENTER } from '../data'

/** shared helpers for the 3D campus models (scene units: metres, x east, y north, z up) */

export const PX = 36 // texture pixels per metre

/** every model shares one anchor so they draw in a single pass with one campus-wide shadow map */
export const [ANCHOR_LON, ANCHOR_LAT] = CAMPUS_CENTER
const KX = 111320 * Math.cos((ANCHOR_LAT * Math.PI) / 180), KY = 110540
export const toLocal = (lon: number, lat: number): P => [(lon - ANCHOR_LON) * KX, (lat - ANCHOR_LAT) * KY]

// ---------- small helpers ----------
export function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export type P = [number, number]

/** Douglas-Peucker on a closed ring (metres) */
export function simplify(ring: P[], tol: number): P[] {
  const pts = ring.slice(0, -1)
  if (pts.length < 5) return pts
  const dist = (p: P, a: P, b: P) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy
    const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
  }
  const dp = (s: P[]): P[] => {
    let max = 0, idx = 0
    for (let i = 1; i < s.length - 1; i++) { const d = dist(s[i], s[0], s[s.length - 1]); if (d > max) { max = d; idx = i } }
    return max > tol ? [...dp(s.slice(0, idx + 1)).slice(0, -1), ...dp(s.slice(idx))] : [s[0], s[s.length - 1]]
  }
  // split at the point farthest from the first so the ring keeps its corners
  let far = 0
  pts.forEach((p, i) => { if (Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]) > Math.hypot(pts[far][0] - pts[0][0], pts[far][1] - pts[0][1])) far = i })
  const a = dp(pts.slice(0, far + 1)), b = dp([...pts.slice(far), pts[0]])
  return [...a.slice(0, -1), ...b.slice(0, -1)]
}

export const signedArea = (r: P[]) => r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + p[0] * q[1] - q[0] * p[1] }, 0) / 2

export function inside(p: P, rings: P[][]) {
  let c = false
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      if ((r[i][1] > p[1]) !== (r[j][1] > p[1]) && p[0] < ((r[j][0] - r[i][0]) * (p[1] - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c
    }
  }
  return c
}
export function edgeDist(p: P, rings: P[][]) {
  let m = Infinity
  for (const r of rings) for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length]
    const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy
    const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0
    m = Math.min(m, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy))
  }
  return m
}

export function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = Math.round(w); c.height = Math.round(h)
  return [c, c.getContext('2d')!] as const
}

/** fine noise so large plaster areas don't look like flat paint */
export function grain(g: CanvasRenderingContext2D, w: number, h: number, r: () => number, alpha: number) {
  for (let i = 0; i < (w * h) / 60; i++) {
    g.fillStyle = r() > 0.5 ? `rgba(255,255,255,${alpha * r()})` : `rgba(60,40,30,${alpha * r()})`
    g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2)
  }
}

export function glass(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: () => number) {
  const grad = g.createLinearGradient(x, y, x + w * 0.4, y + h)
  grad.addColorStop(0, '#9fb8cf'); grad.addColorStop(0.45, '#4f6f8e'); grad.addColorStop(1, '#2b4058')
  g.fillStyle = grad
  g.fillRect(x, y, w, h)
  // sky reflection streak
  g.fillStyle = `rgba(255,255,255,${0.08 + r() * 0.1})`
  g.beginPath(); g.moveTo(x + w * 0.15, y); g.lineTo(x + w * 0.4, y); g.lineTo(x + w * 0.1, y + h); g.lineTo(x, y + h); g.lineTo(x, y + h * 0.6); g.fill()
}

export function walls(rings: P[][], band: { z0: number; z1: number }, tileW: number) {
  const pos: number[] = [], uv: number[] = []
  for (const ring of rings) {
    let u = 0
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length]
      const len = Math.hypot(b[0] - a[0], b[1] - a[1])
      const u0 = u / tileW, u1 = (u + len) / tileW
      pos.push(a[0], a[1], band.z0, b[0], b[1], band.z0, b[0], b[1], band.z1, a[0], a[1], band.z0, b[0], b[1], band.z1, a[0], a[1], band.z1)
      uv.push(u0, 0, u1, 0, u1, 1, u0, 0, u1, 1, u0, 1)
      u += len
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.computeVertexNormals()
  return g
}

/** stair / lift housings and water tanks, spread over the roof away from the edges */
