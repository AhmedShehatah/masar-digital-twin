import * as THREE from 'three'
import { MercatorCoordinate, type Map as MLMap, type CustomLayerInterface, type CustomRenderMethodInput } from 'maplibre-gl'
import type { Campus, CampusFeature } from '../data'
import { PX, ANCHOR_LON, ANCHOR_LAT, toLocal, rng, simplify, signedArea, inside, edgeDist, canvas, grain, glass, walls, type P } from './geom3d'
import { MODEL_SPECS, specFor, type ModelSpec, type FacadeStyle } from './models'
import { buildProps, buildOrchard, buildSites } from './props3d'

/** categories drawn as buildings from a category style when they have no photographed model */
const GENERIC = ['faculty', 'admin', 'housing', 'service', 'cafe', 'kiosk', 'caravan', 'building']

/**
 * Detailed 3D models of selected campus buildings, drawn with three.js inside a MapLibre
 * custom layer. Each model is generated from the building's real footprint (courtyards
 * included) and dressed with painted facade textures that follow the building's photos.
 * Scene units are metres: x east, y north, z up, around an anchor at the footprint.
 */

const BAYS = 8 // bays per texture tile, so lit windows and AC units don't repeat every bay

// ---------- painted facade textures ----------
interface Painted { map: THREE.CanvasTexture; glow: THREE.CanvasTexture; width: number; height: number }

function drawWindow(g: CanvasRenderingContext2D, glow: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, frame: string, r: () => number, litP: number) {
  const f = 0.07 * PX
  g.fillStyle = frame // aluminium frame
  g.fillRect(x - f, y - f, w + 2 * f, h + 2 * f)
  glass(g, x, y, w, h, r)
  g.fillStyle = frame // mullions
  g.fillRect(x + w / 2 - f / 2, y, f, h)
  g.fillRect(x, y + h * 0.28, w, f * 0.8)
  if (r() < litP) {
    const warm = 200 + r() * 55
    glow.fillStyle = `rgb(${warm},${warm * 0.78},${warm * 0.45})`
    glow.fillRect(x, y, w, h)
    if (r() < 0.4) { glow.fillStyle = 'rgb(40,30,20)'; glow.fillRect(x + r() * w * 0.5, y, w * 0.3, h) } // a drawn blind
  }
}

function acUnit(g: CanvasRenderingContext2D, x: number, y: number) {
  const w = 0.82 * PX, h = 0.48 * PX
  g.fillStyle = '#d9d7d2'; g.fillRect(x, y, w, h)
  g.fillStyle = '#b9b6b0'
  for (let i = 1; i < 6; i++) g.fillRect(x + (w * i) / 6, y + 3, 1.5, h - 6)
  g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x, y + h, w, 2)
}

/** one texture tile: BAYS bays wide, `floors` storeys tall, in the building's own colours */
function paint(style: FacadeStyle, spec: ModelSpec, floors: number, height: number, seed: number): Painted {
  const r = rng(seed)
  const { colors: col, window: win } = spec
  const W = BAYS * spec.bay * PX, H = height * PX
  const [c, g] = canvas(W, H)
  const [gc, glow] = canvas(W, H)
  glow.fillStyle = '#000'; glow.fillRect(0, 0, W, H)
  const sH = (height / floors) * PX // storey height in px
  const bay = spec.bay * PX
  const winW = Math.min(win.width, spec.bay - 0.4) * PX, winH = win.height * PX

  if (style === 'granite') {
    g.fillStyle = col.base; g.fillRect(0, 0, W, H)
    grain(g, W, H, r, 0.18)
    g.fillStyle = 'rgba(255,230,210,.12)'
    for (let y = 0.6 * PX; y < H; y += 0.6 * PX) g.fillRect(0, y, W, 1.5) // panel joints
    for (let x = 1.2 * PX; x < W; x += 1.2 * PX) g.fillRect(x, 0, 1.5, H)
    g.fillStyle = col.plaster; g.fillRect(0, 0, W, 0.45 * PX) // light band under the first floor
    // a short plinth (raised ground floor) is plain stone; a full ground floor gets glazed openings
    for (let b = 0; b < (height >= 3 ? BAYS : 0); b += 2) {
      const x = b * bay + 0.5 * PX, w = 2 * bay - 1 * PX, top = 0.9 * PX, h = H - top - 0.35 * PX
      g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(x - 4, top - 4, w + 8, h + 8)
      glass(g, x, top, w, h, r)
      g.fillStyle = '#2d2d2d'
      for (let k = 1; k < 4; k++) g.fillRect(x + (w * k) / 4, top, 3, h)
      if (r() < 0.85) { glow.fillStyle = 'rgb(255,214,150)'; glow.fillRect(x, top, w, h) }
    }
  } else if (style === 'parapet') {
    g.fillStyle = col.plaster; g.fillRect(0, 0, W, H)
    grain(g, W, H, r, 0.12)
    g.fillStyle = col.coping; g.fillRect(0, 0, W, 0.16 * PX) // coping
    g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, 0.16 * PX, W, 3)
  } else if (style === 'cladding') {
    // flat panels (stone / composite, or brick infill in an exposed concrete frame) with punched windows
    const joint = Math.max(2, (spec.joint ?? 0.03) * PX)
    g.fillStyle = col.coping; g.fillRect(0, 0, W, H) // the joints / frame show through between panels
    for (let f = 0; f < floors; f++) {
      const top = H - (f + 1) * sH
      for (let b = 0; b < BAYS; b++) {
        const x = b * bay + joint / 2, y = top + joint / 2, w = bay - joint, h = sH - joint
        g.fillStyle = col.band; g.fillRect(x, y, w, h)
        if (spec.brick) {
          g.fillStyle = 'rgba(60,30,20,.22)'
          for (let yy = y; yy < y + h; yy += 0.075 * PX) {
            g.fillRect(x, yy, w, 1)
            const off = Math.round((yy - y) / (0.075 * PX)) % 2 ? 0.12 * PX : 0
            for (let xx = x + off; xx < x + w; xx += 0.24 * PX) g.fillRect(xx, yy, 1, 0.075 * PX)
          }
        }
        const sill = top + sH - Math.min(1.0 * PX, sH - winH - 0.3 * PX)
        drawWindow(g, glow, b * bay + (bay - winW) / 2, sill - winH, winW, winH, col.frame, r, 0.42)
        if (r() < win.ac) acUnit(g, b * bay + (bay - winW) / 2 + 0.1 * PX, sill + 0.18 * PX)
      }
    }
  } else if (style === 'balcony') {
    // housing: every other bay a French window with a railed balcony, the rest windows with AC units
    g.fillStyle = col.plaster; g.fillRect(0, 0, W, H)
    grain(g, W, H, r, 0.12)
    for (let f = 0; f < floors; f++) {
      const top = H - (f + 1) * sH, floor = top + sH
      g.fillStyle = 'rgba(80,50,40,.08)'; g.fillRect(0, top, W, 2)
      for (let b = 0; b < BAYS; b++) {
        const x = b * bay + (bay - winW) / 2
        if (b % 2 === 0) {
          const doorTop = top + 0.45 * PX, doorH = floor - doorTop - 0.05 * PX
          drawWindow(g, glow, x, doorTop, winW, doorH, col.frame, r, 0.4)
          // balcony slab, its shadow, and the railing in front of the lower door
          g.fillStyle = 'rgba(40,25,20,.35)'; g.fillRect(x - 0.35 * PX, floor, winW + 0.7 * PX, 0.25 * PX)
          g.fillStyle = col.coping; g.fillRect(x - 0.35 * PX, floor - 0.14 * PX, winW + 0.7 * PX, 0.16 * PX)
          g.fillStyle = col.band
          const railTop = floor - 1.05 * PX
          g.fillRect(x - 0.35 * PX, railTop, winW + 0.7 * PX, 0.07 * PX)
          for (let xx = x - 0.3 * PX; xx < x + winW + 0.35 * PX; xx += 0.13 * PX) g.fillRect(xx, railTop, 0.03 * PX, 0.95 * PX)
        } else {
          const sill = floor - 1.0 * PX
          drawWindow(g, glow, x, sill - winH, winW, winH, col.frame, r, 0.4)
          if (r() < win.ac) acUnit(g, x + 0.1 * PX, sill + 0.18 * PX)
        }
      }
    }
  } else if (style === 'curtain') {
    // glass curtain wall: full-height glazing between thin mullions and slab lines
    for (let f = 0; f < floors; f++) {
      const top = H - (f + 1) * sH
      glass(g, 0, top, W, sH, r)
      for (let b = 0; b < BAYS * 2; b++) {
        if (r() < 0.38) { glow.fillStyle = `rgb(${220 + r() * 35},${180 + r() * 30},${120 + r() * 30})`; glow.fillRect((b * bay) / 2, top + 0.2 * PX, bay / 2, sH - 0.9 * PX) }
      }
      g.fillStyle = col.frame
      g.fillRect(0, top + sH - 0.7 * PX, W, 0.7 * PX) // spandrel at the slab
      for (let x = 0; x < W; x += bay / 2) g.fillRect(x, top, 0.08 * PX, sH)
    }
  } else if (style === 'ribbon') {
    // continuous strip windows with solid plaster spandrels between them
    g.fillStyle = col.plaster; g.fillRect(0, 0, W, H)
    grain(g, W, H, r, 0.12)
    for (let f = 0; f < floors; f++) {
      const top = H - (f + 1) * sH, sill = top + sH - 1.0 * PX, winTop = sill - winH
      g.fillStyle = col.band; g.fillRect(0, winTop - 0.12 * PX, W, winH + 0.24 * PX)
      glass(g, 0, winTop, W, winH, r)
      g.fillStyle = col.frame
      for (let x = 0; x < W; x += 1.2 * PX) g.fillRect(x, winTop, 0.07 * PX, winH)
      for (let b = 0; b < BAYS; b++) if (r() < 0.42) { glow.fillStyle = 'rgb(240,200,140)'; glow.fillRect(b * bay, winTop, bay, winH) }
    }
  } else {
    g.fillStyle = col.plaster; g.fillRect(0, 0, W, H)
    grain(g, W, H, r, 0.12)
    for (let f = 0; f < floors; f++) {
      const top = H - (f + 1) * sH // canvas y of this storey's top
      const sill = top + sH - Math.min(1.0 * PX, sH - winH - 0.3 * PX), winTop = sill - winH
      if (style === 'band') {
        // the coloured strip that runs behind the window row
        g.fillStyle = col.band; g.fillRect(0, winTop - 0.3 * PX, W, winH + 0.6 * PX)
        g.fillStyle = 'rgba(0,0,0,.15)'; g.fillRect(0, winTop + winH + 0.3 * PX, W, 3)
      }
      g.fillStyle = 'rgba(80,50,40,.08)'; g.fillRect(0, top, W, 2) // slab line
      for (let b = 0; b < BAYS; b++) {
        const x = b * bay + (bay - winW) / 2
        if (style === 'plaster' && win.surround) {
          // a white box surround that frames window and AC unit together
          g.fillStyle = '#f3eee7'; g.fillRect(x - 0.22 * PX, winTop - 0.22 * PX, winW + 0.44 * PX, winH + 1.05 * PX)
          g.fillStyle = 'rgba(70,45,35,.22)'
          g.fillRect(x + winW + 0.22 * PX, winTop - 0.1 * PX, 4, winH + 1.0 * PX) // its shadow
          g.fillRect(x - 0.1 * PX, winTop + winH + 0.83 * PX, winW + 0.32 * PX, 4)
        }
        drawWindow(g, glow, x, winTop, winW, winH, col.frame, r, 0.42)
        if (r() < win.ac) acUnit(g, x + (r() < 0.5 ? 0.15 : winW / 2 + 0.1 * PX), sill + 0.18 * PX)
      }
    }
  }
  const tex = (cv: HTMLCanvasElement) => {
    const t = new THREE.CanvasTexture(cv)
    t.wrapS = THREE.RepeatWrapping
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    return t
  }
  return { map: tex(c), glow: tex(gc), width: BAYS * spec.bay, height }
}

function roofTexture(seed: number) {
  const r = rng(seed)
  const [c, g] = canvas(512, 512)
  g.fillStyle = '#cbc4ba'; g.fillRect(0, 0, 512, 512)
  grain(g, 512, 512, r, 0.25)
  for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(90,80,70,${0.03 + r() * 0.05})`; g.beginPath(); g.arc(r() * 512, r() * 512, 20 + r() * 70, 0, 7); g.fill() }
  g.strokeStyle = 'rgba(80,70,60,.18)'; g.lineWidth = 2
  for (let x = 0; x <= 512; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 512); g.moveTo(0, x); g.lineTo(512, x); g.stroke() }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  t.repeat.set(1 / 8, 1 / 8)
  return t
}

// ---------- geometry ----------
interface Band { style: FacadeStyle; z0: number; z1: number; floors: number }

function bandsFor(spec: ModelSpec): Band[] {
  const out: Band[] = []
  let z = 0
  for (const b of spec.bands) {
    const h = b.style === 'granite' ? spec.groundHeight : b.style === 'parapet' ? spec.parapet : b.floors * spec.storey
    out.push({ style: b.style, z0: z, z1: z + h, floors: Math.max(1, b.floors) })
    z += h
  }
  return out
}

/** wall strips for every ring edge; u runs continuously along each ring so the bays wrap the corners */
function rooftop(rings: P[][], z: number, r: () => number, mat: THREE.Material, tankMat: THREE.Material) {
  const group = new THREE.Group()
  const xs = rings[0].map((p) => p[0]), ys = rings[0].map((p) => p[1])
  const cand: P[] = []
  for (let x = Math.min(...xs); x < Math.max(...xs); x += 3)
    for (let y = Math.min(...ys); y < Math.max(...ys); y += 3)
      if (inside([x, y], rings) && edgeDist([x, y], rings) > 5) cand.push([x, y])
  const picks: P[] = []
  while (picks.length < 4 && cand.length) {
    const best = cand.reduce((b, p) => {
      const d = picks.length ? Math.min(...picks.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1]))) : edgeDist(p, rings)
      return d > b.d ? { p, d } : b
    }, { p: cand[0], d: -1 })
    picks.push(best.p)
  }
  picks.forEach(([x, y], i) => {
    const w = 5 + r() * 3, d = 4 + r() * 2, h = 3.2
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, d, h), mat)
    box.position.set(x, y, z + h / 2)
    group.add(box)
    if (i < 2) for (let k = 0; k < 3; k++) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.6, 16), tankMat)
      tank.rotation.x = Math.PI / 2
      tank.position.set(x - w / 2 + 1 + k * 1.8, y + d / 2 + 1.4, z + h + 0.8)
      group.add(tank)
    }
  })
  group.traverse((o) => { o.castShadow = true; o.receiveShadow = true })
  return group
}

// ---------- the custom layer ----------
interface Built { key: string; group: THREE.Group; mats: THREE.MeshLambertMaterial[] }


export class Buildings3D {
  readonly layer: CustomLayerInterface
  private renderer: THREE.WebGLRenderer | null = null
  private scene = new THREE.Scene()
  private camera = new THREE.Camera()
  private hemi = new THREE.HemisphereLight('#e6edff', '#b79e86', 1.6)
  private sun = new THREE.DirectionalLight('#fff0d8', 2.6)
  private ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.38 }))
  private built: Built[] = []
  private textures = new Map<string, Painted>()
  private roof = roofTexture(7)
  private night = true
  private matrix: THREE.Matrix4

  constructor(private map: MLMap) {
    this.scene.add(this.hemi, this.sun, this.sun.target, this.ground)
    this.ground.position.z = 0.05
    this.ground.receiveShadow = true
    // sun from the south-west, 40° up
    const az = (215 * Math.PI) / 180, el = (40 * Math.PI) / 180
    this.sun.position.set(Math.sin(az) * Math.cos(el) * 600, Math.cos(az) * Math.cos(el) * 600, Math.sin(el) * 600)
    this.sun.shadow.mapSize.set(4096, 4096)
    this.sun.shadow.bias = -0.0004
    this.sun.shadow.normalBias = 0.5
    this.sun.castShadow = true
    const mc = MercatorCoordinate.fromLngLat([ANCHOR_LON, ANCHOR_LAT], 0)
    const s = mc.meterInMercatorCoordinateUnits()
    this.matrix = new THREE.Matrix4().makeTranslation(mc.x, mc.y, mc.z).scale(new THREE.Vector3(s, -s, s))
    this.layer = {
      id: 'models', type: 'custom', renderingMode: '3d',
      onAdd: (_m, gl) => {
        this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true })
        this.renderer.autoClear = false
        this.renderer.shadowMap.enabled = true
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
        this.renderer.shadowMap.autoUpdate = false
      },
      render: (_gl, args) => this.render(args),
    }
    this.setNight(true)
  }

  /** follow the layers panel: hide the 3D pieces of hidden categories */
  setHidden(hidden: string[]) {
    this.hidden = hidden
    // trees stand on both the green areas and the planted (farm) plots
    const off = (cat: string) => hidden.includes(cat) || (cat === 'green' && hidden.includes('farm'))
    this.scene.traverse((o) => { if (o.userData.cat) o.visible = !off(o.userData.cat) })
    this.map.triggerRepaint()
  }
  private hidden: string[] = []

  setNight(night: boolean) {
    this.night = night
    this.hemi.intensity = night ? 0.75 : 1.6
    this.hemi.color.set(night ? '#8f9cc4' : '#e6edff')
    this.sun.intensity = night ? 0.35 : 2.6
    this.sun.color.set(night ? '#9fb3ff' : '#fff0d8')
    for (const b of this.built) for (const m of b.mats) m.emissiveIntensity = night ? 1 : 0
    this.map.triggerRepaint()
  }

  /** (re)build the models whose buildings exist in this year's data */
  setData(fc: Campus) {
    for (const b of this.built) {
      this.scene.remove(b.group)
      b.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose())
      b.mats.forEach((m) => m.dispose())
    }
    this.built = []
    const isArea = (x: CampusFeature) => x.geometry.type === 'Polygon' || x.geometry.type === 'MultiPolygon'
    // photographed buildings (every part of them), then every other building in its category's style
    for (const [key, spec] of Object.entries(MODEL_SPECS))
      for (const f of fc.features.filter((x) => x.properties.p === key && isArea(x))) this.built.push(this.build(key, spec, f))
    for (const f of fc.features) {
      const { c, p, n, h = 10 } = f.properties
      if (!isArea(f) || !GENERIC.includes(c) || (p && p in MODEL_SPECS)) continue
      const fitted = specFor(c, n, h)
      if (fitted) this.built.push(this.build(fitted.id, fitted.spec, f))
    }
    const props = buildProps(fc)
    this.scene.add(props.mosques, props.street, props.green)
    this.built.push({ key: 'mosques', group: props.mosques, mats: props.glowing }, { key: 'street', group: props.street, mats: [] }, { key: 'green', group: props.green, mats: [] })
    const sites = buildSites(fc)
    this.scene.add(sites.group)
    this.built.push({ key: 'sites', group: sites.group, mats: sites.glowing })
    for (const m of [...props.glowing, ...sites.glowing]) m.emissiveIntensity = this.night ? 1 : 0
    this.fitShadow()
    this.setHidden(this.hidden)
    // the orchard waits for that year's NDVI image; drop it if the year changed meanwhile
    const token = ++this.orchardToken
    buildOrchard(fc).then((g) => {
      if (token !== this.orchardToken) { g.traverse((o) => (o as THREE.Mesh).geometry?.dispose()); return }
      this.scene.add(g)
      this.built.push({ key: 'orchard', group: g, mats: [] })
      this.setHidden(this.hidden)
      this.shadowDirty = true
      this.map.triggerRepaint()
    }).catch(() => undefined)
    this.map.triggerRepaint()
  }

  /** shadow camera and ground plane around all models (in the sun's view), plus room for the shadows */
  private fitShadow() {
    if (!this.built.length) return
    const box = new THREE.Box3()
    // street furniture spans the whole campus; leaving it out keeps the shadow map sharp around the buildings
    for (const b of this.built) if (!['street', 'green', 'orchard'].includes(b.key)) box.expandByObject(b.group)
    const size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3())
    this.ground.scale.set(size.x + 240, size.y + 240, 1)
    this.ground.position.set(mid.x, mid.y, 0.05)
    const dir = this.sun.position.clone().normalize()
    this.sun.target.position.set(mid.x, mid.y, 0)
    this.sun.position.copy(dir.multiplyScalar(600).add(new THREE.Vector3(mid.x, mid.y, 0)))
    const r = Math.hypot(size.x, size.y) / 2 + 70
    const cam = this.sun.shadow.camera as THREE.OrthographicCamera
    Object.assign(cam, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 1400 })
    cam.updateProjectionMatrix()
    this.shadowDirty = true
  }
  private shadowDirty = true
  private orchardToken = 0
  private lastGrow = -1

  private texture(key: string, style: FacadeStyle, spec: ModelSpec, floors: number, height: number) {
    const id = `${key}:${style}:${floors}:${height}`
    if (!this.textures.has(id)) {
      let seed = 0
      for (let i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) | 0
      this.textures.set(id, paint(style, spec, floors, height, seed))
    }
    return this.textures.get(id)!
  }

  private build(key: string, spec: ModelSpec, f: CampusFeature): Built {
    const g = f.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates
    const group = new THREE.Group()
    const mats: THREE.MeshLambertMaterial[] = []
    const bands = bandsFor(spec)
    const top = bands[bands.length - 1].z0 // roof level: under the parapet
    const boxMat = new THREE.MeshLambertMaterial({ color: spec.colors.plaster })
    const tankMat = new THREE.MeshLambertMaterial({ color: '#d8dde2' })
    const roofMat = new THREE.MeshLambertMaterial({ map: this.roof })
    mats.push(boxMat, tankMat, roofMat)

    for (const poly of polys) {
      const rings = poly.map((ring) => simplify(ring.map(([x, y]) => toLocal(x, y)), 0.45))
        .filter((r) => r.length >= 3)
      // outer ring counter-clockwise, holes clockwise (what THREE.Shape expects)
      rings.forEach((r, i) => { if ((signedArea(r) > 0) !== (i === 0)) r.reverse() })
      for (const band of bands) {
        const t = this.texture(key, band.style, spec, band.floors, band.z1 - band.z0)
        const mat = new THREE.MeshLambertMaterial({ map: t.map, emissiveMap: t.glow, emissive: '#ffffff', emissiveIntensity: this.night ? 1 : 0, side: THREE.DoubleSide })
        mats.push(mat)
        const mesh = new THREE.Mesh(walls(rings, band, t.width), mat)
        mesh.castShadow = mesh.receiveShadow = true
        group.add(mesh)
      }
      const shape = new THREE.Shape(rings[0].map(([x, y]) => new THREE.Vector2(x, y)))
      shape.holes = rings.slice(1).map((h) => new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))))
      const roof = new THREE.Mesh(new THREE.ShapeGeometry(shape), roofMat)
      roof.position.z = top
      roof.receiveShadow = true
      group.add(roof)
      group.add(rooftop(rings, top, rng(key.length * 131), boxMat, tankMat))
    }
    group.userData.cat = f.properties.c
    this.scene.add(group)
    return { key, group, mats }
  }

  private render(args: CustomRenderMethodInput) {
    const r = this.renderer
    if (!r || !this.built.length) return
    const grow = Number(this.map.getGlobalState().grow ?? 1)
    // models are built for the flat view; at globe zooms the campus is a dot anyway
    if (this.map.getZoom() < 12.5 || grow < 0.01) return
    for (const b of this.built) b.group.scale.set(1, 1, grow)
    // the shadow map only needs redrawing when the buildings change, not when the camera moves
    if (this.shadowDirty || grow !== this.lastGrow) { r.shadowMap.needsUpdate = true; this.shadowDirty = false; this.lastGrow = grow }
    this.camera.projectionMatrix = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]).multiply(this.matrix)
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert()
    r.resetState()
    r.render(this.scene, this.camera)
  }
}
