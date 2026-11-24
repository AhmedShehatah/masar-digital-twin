import * as THREE from 'three'
import type { Campus, CampusFeature } from '../data'
import { norm, loadAnalysis, loadYear, YEARS } from '../data'
import { PX, toLocal, rng, simplify, signedArea, inside, edgeDist, canvas, grain, glass, walls, type P } from './geom3d'

/**
 * Mosques and street furniture for the 3D campus, built from the map data alone:
 *   mosques   prayer halls with pointed-arch windows, a drum and dome, a minaret with balconies
 *   lamps     every light pole as a green post with a mushroom head that glows at night
 *   canopies  the shade gazebos: four steel posts under a pyramid roof
 *   gates     two piers and a lintel spanning the road each gate sits on
 *   greenery  shade trees and palms on the green areas and planted plots
 * Lamps and canopies are instanced, so thousands of them cost a handful of draw calls.
 */

export interface Props { mosques: THREE.Group; street: THREE.Group; green: THREE.Group; glowing: THREE.MeshLambertMaterial[] }

const STEEL = '#2f6b55' // the green of the lamp posts and gazebo frames in the campus photos
const STONE = '#efe8dc'

const ringOf = (f: CampusFeature): P[] => {
  const g = f.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon
  const ring = g.type === 'Polygon' ? g.coordinates[0] : g.coordinates[0][0]
  return ring.map(([x, y]) => toLocal(x, y))
}
const centre = (r: P[]): P => {
  const pts = r.slice(0, -1)
  return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length]
}
const radiusOf = (r: P[]) => Math.sqrt(Math.abs(signedArea(r.slice(0, -1))) / Math.PI)

// ---------- mosque ----------
function mosqueTexture(height: number) {
  const W = 9 * PX, H = height * PX
  const [c, g] = canvas(W, H), [gc, glow] = canvas(W, H)
  const r = rng(11)
  g.fillStyle = STONE; g.fillRect(0, 0, W, H)
  grain(g, W, H, r, 0.1)
  glow.fillStyle = '#000'; glow.fillRect(0, 0, W, H)
  // a carved band and crenellation along the top
  g.fillStyle = '#c9b48a'; g.fillRect(0, 0.35 * PX, W, 0.25 * PX)
  for (let x = 0; x < W; x += 0.9 * PX) { g.fillStyle = '#dccfb5'; g.fillRect(x, 0, 0.5 * PX, 0.35 * PX) }
  // three pointed-arch windows per 9 m
  if (height >= 3.5) for (let i = 0; i < 3; i++) {
    const w = 1.3 * PX, x = (i * 3 + 1.5) * PX - w / 2, bottom = H - 0.9 * PX, top = Math.max(1.0 * PX, H - (height - 1.2) * PX)
    const arch = (ctx: CanvasRenderingContext2D, inset: number) => {
      const x0 = x + inset, x1 = x + w - inset, spring = top + w * 0.55
      ctx.beginPath(); ctx.moveTo(x0, bottom); ctx.lineTo(x0, spring)
      ctx.quadraticCurveTo(x0, top + inset, (x0 + x1) / 2, top + inset)
      ctx.quadraticCurveTo(x1, top + inset, x1, spring); ctx.lineTo(x1, bottom); ctx.closePath(); ctx.fill()
    }
    g.fillStyle = '#c9b48a'; arch(g, -0.12 * PX)
    g.fillStyle = '#3a5a6a'; arch(g, 0)
    g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x + w / 2 - 1, top + w * 0.3, 2, bottom - top - w * 0.3) // mullion
    glow.fillStyle = 'rgb(255,220,160)'; arch(glow, 0)
  }
  const tex = (cv: HTMLCanvasElement) => {
    const t = new THREE.CanvasTexture(cv); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t
  }
  return { map: tex(c), glow: tex(gc) }
}

function finial(z: number) {
  const gold = new THREE.MeshLambertMaterial({ color: '#d9b45a', emissive: '#6b5214' })
  const g = new THREE.Group()
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 6), gold)
  rod.rotation.x = Math.PI / 2; rod.position.z = z + 0.7
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), gold); ball.position.z = z + 0.6
  const crescent = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.06, 6, 20, Math.PI * 1.4), gold)
  crescent.rotation.set(Math.PI / 2, 0, Math.PI * 0.8); crescent.position.z = z + 1.55
  g.add(rod, ball, crescent)
  return g
}

function buildMosques(fc: Campus, glowing: THREE.MeshLambertMaterial[]) {
  const group = new THREE.Group()
  group.userData.cat = 'mosque'
  const plain = new THREE.MeshLambertMaterial({ color: STONE })
  const dome = new THREE.MeshLambertMaterial({ color: '#e6ddca' })
  const roofMat = new THREE.MeshLambertMaterial({ color: '#d8d0c2' })
  const textures = new Map<number, THREE.MeshLambertMaterial>()
  const facade = (h: number) => {
    const k = Math.round(h * 2) / 2
    if (!textures.has(k)) {
      const t = mosqueTexture(k)
      const m = new THREE.MeshLambertMaterial({ map: t.map, emissiveMap: t.glow, emissive: '#ffffff', emissiveIntensity: 0, side: THREE.DoubleSide })
      textures.set(k, m); glowing.push(m)
    }
    return textures.get(k)!
  }

  for (const f of fc.features) {
    if (f.properties.c !== 'mosque' || !/Polygon/.test(f.geometry.type)) continue
    const n = norm(f.properties.n), h = f.properties.h ?? 7, b = f.properties.b ?? 0
    const ring = ringOf(f), [cx, cy] = centre(ring), rad = Math.max(1.2, radiusOf(ring))
    if (n.includes('ماذن')) {
      // minaret: octagonal shaft, two balconies, slimmer upper shaft, pointed cap
      const r = Math.min(rad, 2.6)
      const add = (geo: THREE.BufferGeometry, z: number, mat = plain) => {
        const m = new THREE.Mesh(geo, mat); m.rotation.x = Math.PI / 2; m.position.set(cx, cy, z); m.castShadow = m.receiveShadow = true; group.add(m)
      }
      const z1 = h * 0.62, z2 = h * 0.84
      add(new THREE.CylinderGeometry(r * 0.92, r, z1, 8), z1 / 2)
      add(new THREE.CylinderGeometry(r * 1.45, r * 1.2, 0.5, 16), z1 + 0.25)
      add(new THREE.CylinderGeometry(r * 1.45, r * 1.45, 0.9, 16, 1, true), z1 + 0.95, new THREE.MeshLambertMaterial({ color: '#c9b48a', side: THREE.DoubleSide }))
      add(new THREE.CylinderGeometry(r * 0.68, r * 0.75, z2 - z1 - 0.5, 12), (z1 + 0.5 + z2) / 2)
      add(new THREE.CylinderGeometry(r * 1.05, r * 0.85, 0.4, 16), z2 + 0.2)
      add(new THREE.CylinderGeometry(r * 0.55, r * 0.55, (h - z2) * 0.35, 12), z2 + 0.4 + (h - z2) * 0.175)
      add(new THREE.ConeGeometry(r * 0.62, (h - z2) * 0.65, 12), h - (h - z2) * 0.325, dome)
      group.add(finial(h))
    } else if (n === 'القبه') {
      // dome: a half-ellipsoid from its base height up to the top
      const m = new THREE.Mesh(new THREE.SphereGeometry(rad, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), dome)
      m.rotation.x = Math.PI / 2
      m.scale.set(1, Math.max(0.6, (h - b) / rad), 1)
      m.position.set(cx, cy, b)
      m.castShadow = m.receiveShadow = true
      group.add(m, finial(h))
    } else if (n.includes('اساسالقبه')) {
      // drum under the dome, ringed with small arched windows
      const mat = facade(Math.max(2, h - b))
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, h - b, 40, 1, true), mat)
      mat.map!.repeat.set(Math.max(1, Math.round((2 * Math.PI * rad) / 9)), 1)
      m.rotation.x = Math.PI / 2; m.position.set(cx, cy, b + (h - b) / 2)
      m.castShadow = m.receiveShadow = true
      group.add(m)
    } else {
      // prayer hall, entrance, ablution block: arched walls and a flat roof
      const rings = [simplify(ring, 0.3)]
      if (signedArea(rings[0]) < 0) rings[0].reverse()
      const wall = new THREE.Mesh(walls(rings, { z0: b, z1: h }, 9), facade(h - b))
      wall.castShadow = wall.receiveShadow = true
      const roof = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(rings[0].map(([x, y]) => new THREE.Vector2(x, y)))), roofMat)
      roof.position.z = h; roof.receiveShadow = true
      group.add(wall, roof)
    }
  }
  return group
}

// ---------- street furniture ----------
function pyramid() {
  const v = [[-0.5, -0.5, 0], [0.5, -0.5, 0], [0.5, 0.5, 0], [-0.5, 0.5, 0]], apex = [0, 0, 1]
  const pos: number[] = []
  for (let i = 0; i < 4; i++) pos.push(...v[i], ...v[(i + 1) % 4], ...apex)
  pos.push(...v[0], ...v[2], ...v[1], ...v[0], ...v[3], ...v[2]) // underside
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}
const upright = (geo: THREE.BufferGeometry, len: number) => geo.rotateX(Math.PI / 2).translate(0, 0, len / 2)

function buildStreet(fc: Campus, glowing: THREE.MeshLambertMaterial[]) {
  const group = new THREE.Group()
  const steel = new THREE.MeshLambertMaterial({ color: STEEL })
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1)

  // lamps
  const poles = fc.features.filter((f) => f.properties.c === 'pole' && f.geometry.type === 'Point')
  if (poles.length) {
    const post = new THREE.InstancedMesh(upright(new THREE.CylinderGeometry(0.06, 0.1, 5.8, 6), 5.8), steel, poles.length)
    const cap = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 1, 0.55), steel, poles.length)
    const bulbMat = new THREE.MeshLambertMaterial({ color: '#f4efe2', emissive: '#ffd590', emissiveIntensity: 0 })
    glowing.push(bulbMat)
    const bulb = new THREE.InstancedMesh(new THREE.SphereGeometry(0.34, 10, 6), bulbMat, poles.length)
    poles.forEach((f, i) => {
      const [x, y] = toLocal(...((f.geometry as GeoJSON.Point).coordinates as [number, number]))
      post.setMatrixAt(i, m4.makeTranslation(x, y, 0))
      cap.setMatrixAt(i, m4.makeTranslation(x, y, 6.05))
      bulb.setMatrixAt(i, m4.makeTranslation(x, y, 5.72))
    })
    post.castShadow = true
    for (const m of [post, cap, bulb]) m.userData.cat = 'pole'
    group.add(post, cap, bulb)
  }

  // canopies: small ones (about 4 × 4 m) are round umbrellas on a single pole,
  // the larger ones gazebos with four posts under a pyramid roof oriented to their longest side
  const canopies = fc.features.filter((f) => f.properties.c === 'canopy' && /Polygon/.test(f.geometry.type)).map((f) => {
    const ring = simplify(ringOf(f), 0.2)
    let best = 0, ang = 0
    ring.forEach((a, k) => { const b2 = ring[(k + 1) % ring.length]; const l = Math.hypot(b2[0] - a[0], b2[1] - a[1]); if (l > best) { best = l; ang = Math.atan2(b2[1] - a[1], b2[0] - a[0]) } })
    const ux = Math.cos(ang), uy = Math.sin(ang)
    const us = ring.map(([x, y]) => x * ux + y * uy), vs = ring.map(([x, y]) => -x * uy + y * ux)
    const w = Math.max(...us) - Math.min(...us), d = Math.max(...vs) - Math.min(...vs)
    const mu = (Math.max(...us) + Math.min(...us)) / 2, mv = (Math.max(...vs) + Math.min(...vs)) / 2
    return { cx: mu * ux - mv * uy, cy: mu * uy + mv * ux, w, d, ang, ux, uy }
  })
  const umbrellas = canopies.filter((c) => c.w * c.d < 25), gazebos = canopies.filter((c) => c.w * c.d >= 25)
  if (umbrellas.length) {
    const r = rng(5)
    const fabric = new THREE.MeshLambertMaterial({ color: '#ffffff', side: THREE.DoubleSide })
    const top = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 0.55, 8, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.275), fabric, umbrellas.length)
    const pole = new THREE.InstancedMesh(upright(new THREE.CylinderGeometry(0.045, 0.045, 2.5, 6), 2.5), steel, umbrellas.length)
    const shades = ['#e9dcc0', '#d8c3a0', '#c96f4a', '#f1ead8']
    const col = new THREE.Color()
    umbrellas.forEach((c, i) => {
      const rad = Math.max(1.4, Math.min(c.w, c.d) / 2 + 0.2)
      top.setMatrixAt(i, m4.compose(p.set(c.cx, c.cy, 2.35), q.setFromAxisAngle(Z, r() * Math.PI), s.set(rad, rad, 1)))
      top.setColorAt(i, col.set(shades[Math.floor(r() * shades.length)]))
      pole.setMatrixAt(i, m4.makeTranslation(c.cx, c.cy, 0))
    })
    top.castShadow = top.receiveShadow = true
    pole.castShadow = true
    top.userData.cat = pole.userData.cat = 'canopy'
    group.add(top, pole)
  }
  if (gazebos.length) {
    const roofMat = new THREE.MeshLambertMaterial({ color: '#c9b38d', side: THREE.DoubleSide })
    const roof = new THREE.InstancedMesh(pyramid(), roofMat, gazebos.length)
    const legs = new THREE.InstancedMesh(upright(new THREE.CylinderGeometry(0.07, 0.07, 2.7, 6), 2.7), steel, gazebos.length * 4)
    gazebos.forEach(({ cx, cy, w, d, ang, ux, uy }, i) => {
      q.setFromAxisAngle(Z, ang)
      const pitch = Math.min(1.6, Math.min(w, d) * 0.28)
      roof.setMatrixAt(i, m4.compose(p.set(cx, cy, 2.7), q, s.set(w + 0.5, d + 0.5, pitch)))
      ;[[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, c2], k) => {
        const lx = cx + ((a * (w / 2 - 0.3)) * ux - (c2 * (d / 2 - 0.3)) * uy)
        const ly = cy + ((a * (w / 2 - 0.3)) * uy + (c2 * (d / 2 - 0.3)) * ux)
        legs.setMatrixAt(i * 4 + k, m4.makeTranslation(lx, ly, 0))
      })
    })
    roof.castShadow = roof.receiveShadow = true
    legs.castShadow = true
    roof.userData.cat = legs.userData.cat = 'canopy'
    group.add(roof, legs)
  }

  // gates: span the nearest road
  const roads = fc.features.filter((f) => f.properties.c === 'road' && f.geometry.type === 'LineString')
    .map((f) => (f.geometry as GeoJSON.LineString).coordinates.map(([x, y]) => toLocal(x, y)))
  const stone = new THREE.MeshLambertMaterial({ color: '#e7d3bb' })
  const band = new THREE.MeshLambertMaterial({ color: '#8a3a31' })
  for (const f of fc.features) {
    if (f.properties.c !== 'gate' || f.geometry.type !== 'Point') continue
    const [x, y] = toLocal(...((f.geometry as GeoJSON.Point).coordinates as [number, number]))
    let best = Infinity, dir = 0
    for (const line of roads) for (let i = 0; i < line.length - 1; i++) {
      const [a, b2] = [line[i], line[i + 1]]
      const dx = b2[0] - a[0], dy = b2[1] - a[1], l = dx * dx + dy * dy
      const t = l ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l)) : 0
      const d = Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy)
      if (d < best) { best = d; dir = Math.atan2(dy, dx) }
    }
    const gate = new THREE.Group()
    const span = 11
    const box = (w: number, d: number, h: number, mat: THREE.Material, px: number, pz: number, py = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, d, h), mat); m.position.set(px, py, pz); m.castShadow = m.receiveShadow = true; gate.add(m)
    }
    box(1.4, 1.4, 6.2, stone, -span / 2, 3.1); box(1.4, 1.4, 6.2, stone, span / 2, 3.1)
    box(span + 1.4, 1.2, 1.3, stone, 0, 6.25)
    box(span - 1, 1.26, 0.55, band, 0, 6.1)
    // lintel runs across the road: perpendicular to its direction
    gate.rotation.z = dir + Math.PI / 2
    gate.position.set(x, y, 0)
    gate.userData.cat = 'gate'
    group.add(gate)
  }
  return group
}

// ---------- greenery ----------
/**
 * Trees scattered over the campus green areas and the small planted plots (the big farm field
 * is left to the satellite image: the data doesn't say whether it is orchard or crops).
 * A jittered grid keeps them evenly spaced; about one in four is a palm.
 */
function buildGreen(fc: Campus) {
  const group = new THREE.Group()
  const spots: { x: number; y: number; palm: boolean; s: number; cat: string }[] = []
  for (const f of fc.features) {
    const { c, id } = f.properties
    if ((c !== 'green' && c !== 'farm') || f.geometry.type !== 'Polygon') continue
    const ring = ringOf(f).slice(0, -1)
    const area = Math.abs(signedArea(ring))
    if (area < 25 || area > 20000) continue
    const r = rng([...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7))
    const xs = ring.map((q2) => q2[0]), ys = ring.map((q2) => q2[1])
    const step = area < 200 ? 5 : 7.5
    let n = 0
    for (let x = Math.min(...xs) + step / 2; x < Math.max(...xs); x += step)
      for (let y = Math.min(...ys) + step / 2; y < Math.max(...ys); y += step) {
        const pt: P = [x + (r() - 0.5) * step * 0.6, y + (r() - 0.5) * step * 0.6]
        if (!inside(pt, [ring]) || edgeDist(pt, [ring]) < 1.2) continue
        spots.push({ x: pt[0], y: pt[1], palm: r() < 0.25, s: 0.75 + r() * 0.6, cat: c })
        n++
      }
    if (!n) { const [x, y] = centre([...ring, ring[0]]); spots.push({ x, y, palm: false, s: 0.7, cat: c }) }
  }
  if (!spots.length) return group
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1)
  const col = new THREE.Color(), r = rng(99)
  const bark = new THREE.MeshLambertMaterial({ color: '#6b5440' })
  const leaf = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true })
  const round = spots.filter((t) => !t.palm), palms = spots.filter((t) => t.palm)
  const add = (mesh: THREE.InstancedMesh) => { mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh }

  // round shade trees: short trunk, two overlapping foliage blobs
  const trunk = add(new THREE.InstancedMesh(upright(new THREE.CylinderGeometry(0.14, 0.2, 2.4, 6), 2.4), bark, round.length))
  const crown = add(new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), leaf, round.length * 2))
  round.forEach((t, i) => {
    trunk.setMatrixAt(i, m4.compose(p.set(t.x, t.y, 0), q.identity(), s.set(1, 1, t.s)))
    const g = 0.75 + r() * 0.35
    for (let k = 0; k < 2; k++) {
      const rad = (1.8 + r() * 0.8) * t.s
      crown.setMatrixAt(i * 2 + k, m4.compose(p.set(t.x + (r() - 0.5) * 0.9, t.y + (r() - 0.5) * 0.9, (2.4 + rad * 0.7) * t.s + k * 0.5),
        q.setFromAxisAngle(Z, r() * 6), s.set(rad, rad, rad * 0.8)))
      crown.setColorAt(i * 2 + k, col.setRGB(0.24 * g, 0.42 * g, 0.2 * g))
    }
  })
  // palms: tall slim trunk and a drooping crown of fronds
  if (palms.length) {
    const pTrunk = add(new THREE.InstancedMesh(upright(new THREE.CylinderGeometry(0.16, 0.24, 7, 6), 7), bark, palms.length))
    // fronds: an open cone, apex up, so the leaves droop from the top of the trunk
    const frondMat = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true, side: THREE.DoubleSide })
    const fronds = add(new THREE.InstancedMesh(new THREE.ConeGeometry(2.6, 1.4, 9, 1, true).rotateX(Math.PI / 2), frondMat, palms.length))
    palms.forEach((t, i) => {
      pTrunk.setMatrixAt(i, m4.compose(p.set(t.x, t.y, 0), q.identity(), s.set(1, 1, t.s)))
      fronds.setMatrixAt(i, m4.compose(p.set(t.x, t.y, 7 * t.s - 0.2), q.setFromAxisAngle(Z, r() * 6), s.set(t.s, t.s, t.s)))
      fronds.setColorAt(i, col.setRGB(0.28, 0.45 + r() * 0.1, 0.22))
    })
  }
  group.traverse((o) => { if ((o as THREE.InstancedMesh).isInstancedMesh) o.userData.cat = 'green' })
  return group
}

export function buildProps(fc: Campus): Props {
  const glowing: THREE.MeshLambertMaterial[] = []
  return { mosques: buildMosques(fc, glowing), street: buildStreet(fc, glowing), green: buildGreen(fc), glowing }
}

// ---------- orchard ----------
/**
 * The faculty farm is an orchard: round trees about 6 m apart in rows, in blocks split by tracks.
 * Trees follow the field's main direction, and each one is sized from that year's NDVI map
 * (the campus raster in public/data/analysis), so bare patches stay empty and the orchard
 * grows from year to year.
 */
const SPACING = 6
const BLOCK = 16 // trees per block before an access track
const OLIVE = ['#3d5a2a', '#46632f', '#4f6b33', '#3a5228', '#55703a']

/** NDVI greenness 0..1 per lon/lat from the year's raster (cream = bare … dark green = dense) */
async function ndviSampler(year: number): Promise<(lon: number, lat: number) => number | null> {
  const index = await loadAnalysis().catch(() => null)
  const frame = index?.rasters.find((r) => r.id === 'ndvi')?.frames.find((f) => f.year === year)
  if (!frame) return () => null
  const img = new Image()
  img.src = frame.url
  await img.decode()
  const [cv, g] = canvas(img.width, img.height)
  g.drawImage(img, 0, 0)
  const data = g.getImageData(0, 0, cv.width, cv.height).data
  const [[w, n], [e], , [, s]] = frame.coords
  return (lon, lat) => {
    const x = Math.floor(((lon - w) / (e - w)) * cv.width), y = Math.floor(((n - lat) / (n - s)) * cv.height)
    if (x < 0 || y < 0 || x >= cv.width || y >= cv.height) return null
    const i = (y * cv.width + x) * 4
    if (data[i + 3] < 128) return null // outside the raster's footprint
    return Math.max(0, Math.min(1, (255 - data[i]) / 220)) // red falls as the ramp turns green
  }
}

export async function buildOrchard(fc: Campus): Promise<THREE.Group> {
  const group = new THREE.Group()
  const year = Number(String(fc.features[0]?.properties.id).split('-')[0])
  const bigFields = (c: Campus) => c.features.filter((f) => f.properties.c === 'farm' && f.geometry.type === 'Polygon' && Math.abs(signedArea(ringOf(f).slice(0, -1))) > 20000)
  let fields = bigFields(fc)
  if (!fields.length) {
    // a gap in the survey (2021 has no farm outline): borrow the nearest earlier year's field,
    // but only when a later year has it too, so a field that really disappeared stays gone
    const earlier = YEARS.filter((y) => y < year).reverse(), later = YEARS.filter((y) => y > year)
    const laterHas = (await Promise.all(later.map((y) => loadYear(y)))).some((c) => bigFields(c).length)
    if (laterHas) for (const y of earlier) {
      const found = bigFields(await loadYear(y))
      if (found.length) { fields = found; break }
    }
  }
  if (!fields.length) return group
  const ndvi = await ndviSampler(year)
  const trees: { x: number; y: number; s: number }[] = []
  const r = rng(year)
  for (const f of fields) {
    const geo = f.geometry as GeoJSON.Polygon
    const ring = ringOf(f).slice(0, -1)
    // rows run along the field's longest side
    let best = 0, ang = 0
    ring.forEach((a, k) => { const b = ring[(k + 1) % ring.length]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l > best) { best = l; ang = Math.atan2(b[1] - a[1], b[0] - a[0]) } })
    const ux = Math.cos(ang), uy = Math.sin(ang)
    const us = ring.map(([x, y]) => x * ux + y * uy), vs = ring.map(([x, y]) => -x * uy + y * ux)
    const [lon0, lat0] = geo.coordinates[0][0], [x0, y0] = toLocal(lon0, lat0)
    for (let i = 0, u = Math.min(...us) + SPACING / 2; u < Math.max(...us); u += SPACING, i++) {
      if (i % (BLOCK + 1) === BLOCK) continue // a track between blocks
      for (let j = 0, v = Math.min(...vs) + SPACING / 2; v < Math.max(...vs); v += SPACING, j++) {
        if (j % (BLOCK + 1) === BLOCK) continue
        const x = u * ux - v * uy + (r() - 0.5) * 0.5, y = u * uy + v * ux + (r() - 0.5) * 0.5
        if (!inside([x, y], [ring]) || edgeDist([x, y], [ring]) < 3) continue
        // back to lon/lat for the NDVI lookup (inverse of toLocal around this field's first vertex)
        const lon = lon0 + (x - x0) / (111320 * Math.cos((lat0 * Math.PI) / 180)), lat = lat0 + (y - y0) / 110540
        const g = ndvi(lon, lat)
        const v2 = g === null ? 0.75 : g
        // NDVI at 30 m mixes crowns with the bare soil between them, so it mostly sets size;
        // only clearly bare ground stays empty
        if (v2 < 0.04 || r() < 0.04) continue
        trees.push({ x, y, s: 0.55 + 0.6 * v2 })
      }
    }
  }
  if (!trees.length) return group
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1)
  const col = new THREE.Color()
  const trunk = new THREE.InstancedMesh(upright(new THREE.CylinderGeometry(0.1, 0.14, 1.3, 5), 1.3), new THREE.MeshLambertMaterial({ color: '#6b5440' }), trees.length)
  const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), trees.length)
  trees.forEach((t, i) => {
    trunk.setMatrixAt(i, m4.compose(p.set(t.x, t.y, 0), q.identity(), s.set(1, 1, t.s)))
    const rad = 1.9 * t.s
    crown.setMatrixAt(i, m4.compose(p.set(t.x, t.y, 1.2 * t.s + rad * 0.75), q.setFromAxisAngle(Z, r() * 6), s.set(rad, rad, rad * 0.85)))
    crown.setColorAt(i, col.set(OLIVE[Math.floor(r() * OLIVE.length)])) // sRGB hex: the dark olive / citrus greens of the orchard
  })
  for (const m of [trunk, crown]) { m.castShadow = m.receiveShadow = true; m.userData.cat = 'farm'; group.add(m) }
  return group
}

// ---------- construction sites & lecture halls ----------
/** all rings of a polygon feature in local metres, outer counter-clockwise and holes clockwise */
function ringsOf(f: CampusFeature, tol = 0.4): P[][] {
  const g = f.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon
  const poly = g.type === 'Polygon' ? g.coordinates : g.coordinates[0]
  const rings = poly.map((ring) => simplify(ring.map(([x, y]) => toLocal(x, y)), tol)).filter((r) => r.length >= 3)
  rings.forEach((r, i) => { if ((signedArea(r) > 0) !== (i === 0)) r.reverse() })
  return rings
}
const shapeOf = (rings: P[][]) => {
  const sh = new THREE.Shape(rings[0].map(([x, y]) => new THREE.Vector2(x, y)))
  sh.holes = rings.slice(1).map((h) => new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))))
  return sh
}
const repeatTex = (cv: HTMLCanvasElement) => {
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t
}

/** red-brick infill between the frame, with dark openings left for windows; one storey tall, 6 m wide */
function brickTexture(storey: number) {
  const W = 6 * PX, H = storey * PX, r = rng(21)
  const [c, g] = canvas(W, H)
  g.fillStyle = '#b5623f'; g.fillRect(0, 0, W, H)
  for (let y = 0, row = 0; y < H; y += 0.2 * PX, row++) {
    g.fillStyle = 'rgba(70,35,20,.35)'; g.fillRect(0, y, W, 1.2)
    for (let x = row % 2 ? 0.12 * PX : 0; x < W; x += 0.25 * PX) { g.fillRect(x, y, 1, 0.2 * PX); g.fillStyle = `rgba(${150 + r() * 60},${70 + r() * 30},${40 + r() * 20},.25)`; g.fillRect(x + 1, y + 1, 0.25 * PX - 2, 0.2 * PX - 2); g.fillStyle = 'rgba(70,35,20,.35)' }
  }
  g.fillStyle = '#2a2622' // two raw window openings per 6 m
  for (const x of [1.0, 4.0]) g.fillRect(x * PX, H - (storey - 0.9) * PX, 1.4 * PX, 1.4 * PX)
  g.fillStyle = '#9d9890'; g.fillRect(0, 0, W, 0.3 * PX) // the slab edge above
  return repeatTex(c)
}

/** yellow lattice for the crane mast and jib */
function latticeTexture() {
  const [c, g] = canvas(64, 64)
  g.strokeStyle = '#e9b31a'; g.lineWidth = 5
  g.strokeRect(2, 2, 60, 60)
  g.beginPath(); g.moveTo(2, 2); g.lineTo(62, 62); g.moveTo(62, 2); g.lineTo(2, 62); g.stroke()
  return repeatTex(c)
}

function crane(x: number, y: number, top: number, ang: number, glowing: THREE.MeshLambertMaterial[]) {
  const g = new THREE.Group()
  const lattice = latticeTexture()
  const mast = new THREE.MeshLambertMaterial({ map: lattice, alphaTest: 0.5, side: THREE.DoubleSide })
  const mastTex = lattice.clone(); mastTex.repeat.set(1, top / 1.8); mastTex.needsUpdate = true
  const m = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.8, top), new THREE.MeshLambertMaterial({ map: mastTex, alphaTest: 0.5, side: THREE.DoubleSide }))
  m.position.set(0, 0, top / 2)
  const jibTex = lattice.clone(); jibTex.repeat.set(45 / 1.4, 1); jibTex.needsUpdate = true
  const jib = new THREE.Mesh(new THREE.BoxGeometry(45, 1.4, 1.4), new THREE.MeshLambertMaterial({ map: jibTex, alphaTest: 0.5, side: THREE.DoubleSide }))
  jib.position.set(12, 0, top + 1.2) // 34 m jib out front, 11 m counter-jib behind
  const weight = new THREE.Mesh(new THREE.BoxGeometry(4, 2.2, 2.2), new THREE.MeshLambertMaterial({ color: '#9d9890' }))
  weight.position.set(-8.5, 0, top + 0.4)
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2, 2.2), new THREE.MeshLambertMaterial({ color: '#e9b31a' }))
  cab.position.set(1.5, -1.6, top - 0.6)
  const peak = new THREE.Mesh(new THREE.ConeGeometry(1.1, 6, 4).rotateX(Math.PI / 2), mast)
  peak.position.set(0, 0, top + 4.2)
  const hookZ = top * 0.45
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, top - hookZ, 4).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#333' }))
  cable.position.set(26, 0, (top + hookZ) / 2)
  const load = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1, 0.8), new THREE.MeshLambertMaterial({ color: '#8a6a4a' }))
  load.position.set(26, 0, hookZ - 0.5)
  const beaconMat = new THREE.MeshLambertMaterial({ color: '#7a1010', emissive: '#ff2a2a', emissiveIntensity: 0 })
  glowing.push(beaconMat)
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), beaconMat)
  beacon.position.set(0, 0, top + 7.3)
  g.add(m, jib, weight, cab, peak, cable, load, beacon)
  g.traverse((o) => { o.castShadow = true })
  g.position.set(x, y, 0)
  g.rotation.z = ang
  return g
}

function buildConstruction(fc: Campus, glowing: THREE.MeshLambertMaterial[]) {
  const group = new THREE.Group()
  const concrete = new THREE.MeshLambertMaterial({ color: '#bdb8af' })
  for (const f of fc.features) {
    if (f.properties.c !== 'construction' || !/Polygon/.test(f.geometry.type)) continue
    const h = f.properties.h ?? 8
    const rings = ringsOf(f)
    if (!rings.length) continue
    const r = rng(f.properties.id.length * 977 + Math.round(h * 10))
    const storey = 3.6, floors = Math.max(1, Math.round(h / storey))
    const site = new THREE.Group()
    // columns: at every corner and on a 6 m grid inside
    const cols: P[] = rings.flat()
    const xs = rings[0].map((p) => p[0]), ys = rings[0].map((p) => p[1])
    for (let x = Math.min(...xs) + 3; x < Math.max(...xs); x += 6)
      for (let y = Math.min(...ys) + 3; y < Math.max(...ys); y += 6)
        if (inside([x, y], rings) && edgeDist([x, y], rings) > 1.5) cols.push([x, y])
    const colMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.45, 0.45, storey).translate(0, 0, storey / 2), concrete, cols.length * floors)
    const m4 = new THREE.Matrix4()
    let k = 0
    for (let fl = 0; fl < floors; fl++) for (const [x, y] of cols) colMesh.setMatrixAt(k++, m4.makeTranslation(x, y, fl * storey))
    colMesh.castShadow = colMesh.receiveShadow = true
    site.add(colMesh)
    // slabs on every finished floor; the top storey is still bare columns
    const slab = new THREE.ExtrudeGeometry(shapeOf(rings), { depth: 0.3, bevelEnabled: false })
    for (let fl = 1; fl < floors; fl++) {
      const s = new THREE.Mesh(slab, concrete); s.position.z = fl * storey - 0.3; s.castShadow = s.receiveShadow = true; site.add(s)
    }
    // brick infill on the lower floors
    const brickFloors = floors > 2 ? Math.ceil(floors * 0.4) : floors > 1 ? 1 : 0
    if (brickFloors) {
      const tex = brickTexture(storey); tex.repeat.set(1, brickFloors)
      const wall = new THREE.Mesh(walls(rings, { z0: 0, z1: brickFloors * storey }, 6), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }))
      wall.castShadow = wall.receiveShadow = true
      site.add(wall)
    }
    // a tower crane on the taller sites, standing in the building's open middle or beside it
    if (h >= 12) {
      const [cx, cy] = centre([...rings[0], rings[0][0]])
      const spot: P = inside([cx, cy], rings) && edgeDist([cx, cy], rings) > 3 ? [cx, cy] : cols[Math.floor(cols.length / 2)]
      site.add(crane(spot[0], spot[1], h + 14, r() * Math.PI * 2, glowing))
    }
    site.userData.cat = 'construction'
    group.add(site)
  }
  return group
}

/** lecture halls: tall plaster walls with narrow full-height window slots over a stone base, and a cornice */
function hallTexture(height: number) {
  const W = 18 * PX, H = height * PX, r = rng(31)
  const [c, g] = canvas(W, H), [gc, glow] = canvas(W, H)
  g.fillStyle = '#e8d5c2'; g.fillRect(0, 0, W, H)
  grain(g, W, H, r, 0.1)
  glow.fillStyle = '#000'; glow.fillRect(0, 0, W, H)
  g.fillStyle = '#7c4a42'; g.fillRect(0, H - 1.6 * PX, W, 1.6 * PX) // stone base
  g.fillStyle = '#cdb5a1'; g.fillRect(0, 0, W, 1.0 * PX) // cornice
  g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, 1.0 * PX, W, 4)
  for (let i = 0; i < 4; i++) {
    const x = (i * 4.5 + 1.8) * PX, w = 0.9 * PX, top = 2.2 * PX, bottom = H - 2.4 * PX
    g.fillStyle = '#cdb5a1'; g.fillRect(x - 0.15 * PX, top - 0.15 * PX, w + 0.3 * PX, bottom - top + 0.3 * PX)
    glass(g, x, top, w, bottom - top, r)
    for (let y = top + 1.2 * PX; y < bottom; y += 1.2 * PX) { g.fillStyle = '#e6e0d8'; g.fillRect(x, y, w, 3) }
    if (r() < 0.6) { glow.fillStyle = 'rgb(255,214,150)'; glow.fillRect(x, top, w, bottom - top) }
  }
  return { map: repeatTex(c), glow: repeatTex(gc) }
}

function buildHalls(fc: Campus, glowing: THREE.MeshLambertMaterial[]) {
  const group = new THREE.Group()
  const roofMat = new THREE.MeshLambertMaterial({ color: '#d2cabe' })
  const mats = new Map<number, THREE.MeshLambertMaterial>()
  const facade = (h: number) => {
    const k = Math.round(h)
    if (!mats.has(k)) {
      const t = hallTexture(k)
      const m = new THREE.MeshLambertMaterial({ map: t.map, emissiveMap: t.glow, emissive: '#ffffff', emissiveIntensity: 0, side: THREE.DoubleSide })
      mats.set(k, m); glowing.push(m)
    }
    return mats.get(k)!
  }
  for (const f of fc.features) {
    if (f.properties.c !== 'lecture' || !/Polygon/.test(f.geometry.type)) continue
    const h = f.properties.h ?? 15, n = norm(f.properties.n)
    const rings = ringsOf(f)
    if (!rings.length) continue
    if (n === 'القبهزجاجيه') {
      // the glass dome: a ribbed glass half-ellipsoid on a short ring wall, sitting on its base block
      const [cx, cy] = centre([...rings[0], rings[0][0]]), rad = radiusOf([...rings[0], rings[0][0]])
      const z0 = h
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, 1.2, 48, 1, true).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#cdb5a1', side: THREE.DoubleSide }))
      ring.position.set(cx, cy, z0 + 0.6)
      const geo = new THREE.SphereGeometry(rad, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 1, 0.72)
      const glassMat = new THREE.MeshLambertMaterial({ color: '#9fcbe2', transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, emissive: '#ffd9a0', emissiveIntensity: 0 })
      glowing.push(glassMat)
      const dome = new THREE.Mesh(geo, glassMat)
      const ribs = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#eef2f4', wireframe: true, transparent: true, opacity: 0.7 }))
      for (const m of [dome, ribs]) m.position.set(cx, cy, z0 + 1.2)
      dome.castShadow = true
      const g = new THREE.Group(); g.add(ring, dome, ribs, finial(z0 + 1.2 + rad * 0.72))
      g.userData.cat = 'lecture'
      group.add(g)
      continue
    }
    const wall = new THREE.Mesh(walls(rings, { z0: 0, z1: h }, 18), facade(h))
    wall.castShadow = wall.receiveShadow = true
    const roof = new THREE.Mesh(new THREE.ShapeGeometry(shapeOf(rings)), roofMat)
    roof.position.z = h; roof.receiveShadow = true
    const g = new THREE.Group(); g.add(wall, roof)
    g.userData.cat = 'lecture'
    group.add(g)
  }
  return group
}

/** the covered sports hall (a barrel-vaulted metal roof over tall walls) and the small sports building */
function buildSports(fc: Campus, glowing: THREE.MeshLambertMaterial[]) {
  const group = new THREE.Group()
  for (const f of fc.features) {
    if (f.properties.c !== 'sports' || !/Polygon/.test(f.geometry.type)) continue
    const n = norm(f.properties.n)
    const hall = n.includes('صالهالالعاب'), block = n.includes('مبنيالملاعب')
    if (!hall && !block) continue
    const rings = ringsOf(f)
    if (!rings.length) continue
    const wallH = hall ? 8 : 7.5
    const t = hallTexture(wallH)
    const mat = new THREE.MeshLambertMaterial({ map: t.map, emissiveMap: t.glow, emissive: '#ffffff', emissiveIntensity: 0, side: THREE.DoubleSide })
    glowing.push(mat)
    const wall = new THREE.Mesh(walls(rings, { z0: 0, z1: wallH }, 18), mat)
    wall.castShadow = wall.receiveShadow = true
    const g = new THREE.Group(); g.add(wall)
    if (hall) {
      // vault along the hall's long side, rising a fifth of its span
      const ring = rings[0]
      let best = 0, ang = 0
      ring.forEach((a, k) => { const b2 = ring[(k + 1) % ring.length]; const l = Math.hypot(b2[0] - a[0], b2[1] - a[1]); if (l > best) { best = l; ang = Math.atan2(b2[1] - a[1], b2[0] - a[0]) } })
      const ux = Math.cos(ang), uy = Math.sin(ang)
      const us = ring.map(([x, y]) => x * ux + y * uy), vs = ring.map(([x, y]) => -x * uy + y * ux)
      const w = Math.max(...us) - Math.min(...us), d = Math.max(...vs) - Math.min(...vs)
      const mu = (Math.max(...us) + Math.min(...us)) / 2, mv = (Math.max(...vs) + Math.min(...vs)) / 2
      const vault = new THREE.Mesh(
        new THREE.CylinderGeometry(1, 1, 1, 32, 1, false, -Math.PI / 2, Math.PI).rotateZ(-Math.PI / 2).scale(w + 0.6, d / 2 + 0.3, Math.max(3, d * 0.2)),
        new THREE.MeshLambertMaterial({ color: '#b9c2c8', side: THREE.DoubleSide }))
      vault.rotation.z = ang
      vault.position.set(mu * ux - mv * uy, mu * uy + mv * ux, wallH)
      vault.castShadow = vault.receiveShadow = true
      g.add(vault)
    } else {
      const roof = new THREE.Mesh(new THREE.ShapeGeometry(shapeOf(rings)), new THREE.MeshLambertMaterial({ color: '#d2cabe' }))
      roof.position.z = wallH; roof.receiveShadow = true
      g.add(roof)
    }
    g.userData.cat = 'sports'
    group.add(g)
  }
  return group
}

export function buildSites(fc: Campus) {
  const glowing: THREE.MeshLambertMaterial[] = []
  const group = new THREE.Group()
  group.add(buildConstruction(fc, glowing), buildHalls(fc, glowing), buildSports(fc, glowing))
  return { group, glowing }
}
