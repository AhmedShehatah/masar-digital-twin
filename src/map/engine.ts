import * as maplibregl from 'maplibre-gl'
import { type Map as MLMap, type StyleSpecification, type ExpressionSpecification } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { CAMPUS_CENTER, CAT_META, EXTRUDED, type Campus, type CampusFeature, type Cat, type RasterFrame, type VectorLayer } from '../data'
import { AnalysisLayers } from './analysis'
import { MODELLED, MODELLED_CATS } from './models'
import type { Buildings3D } from './buildings3d'

const isModelled: ExpressionSpecification = ['any', ['in', ['get', 'p'], ['literal', MODELLED]], ['in', ['get', 'c'], ['literal', MODELLED_CATS]]]

maplibregl.setWorkerUrl(workerUrl)

const SAT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

const catColor: ExpressionSpecification = [
  'match', ['get', 'c'],
  ...Object.entries(CAT_META).flatMap(([k, v]) => [k, v.color]),
  '#cbd5e1',
] as unknown as ExpressionSpecification

const notHidden: ExpressionSpecification = ['!', ['in', ['get', 'c'], ['global-state', 'hidden']]]
const lit: ExpressionSpecification = ['<=', ['coalesce', ['get', 'r'], 0], ['global-state', 'lights']]
const isCat = (...c: Cat[]): ExpressionSpecification => ['in', ['get', 'c'], ['literal', c]]
const isPoly: ExpressionSpecification = ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]]

export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

function buildStyle(): StyleSpecification {
  return {
    version: 8,
    projection: { type: 'globe' },
    state: { grow: { default: 0 }, lights: { default: 0 }, hidden: { default: [] } },
    sky: {
      'sky-color': '#061024',
      'horizon-color': '#1d3a6b',
      'fog-color': '#0a1530',
      'fog-ground-blend': 0.4,
      'horizon-fog-blend': 0.6,
      'sky-horizon-blend': 0.6,
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 9, 0.8, 13, 0],
    },
    sources: {
      sat: {
        type: 'raster', tiles: [SAT], tileSize: 256, maxzoom: 18,
        attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
      },
      campus: { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, promoteId: 'id' },
      route: { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, lineMetrics: true },
      'route-walk': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      'route-head': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#05080f' } },
      {
        id: 'sat', type: 'raster', source: 'sat',
        paint: { 'raster-brightness-max': 0.42, 'raster-saturation': -0.55, 'raster-contrast': 0.12, 'raster-fade-duration': 250,
          'raster-brightness-max-transition': { duration: 1400 }, 'raster-saturation-transition': { duration: 1400 } },
      },
      {
        id: 'land', type: 'fill', source: 'campus',
        filter: ['all', isPoly, isCat('farm', 'green', 'parking', 'sports'), notHidden],
        paint: {
          'fill-color': catColor,
          'fill-opacity': ['match', ['get', 'c'], 'parking', 0.35, 'farm', 0.28, 0.4],
          'fill-outline-color': catColor,
        },
      },
      {
        id: 'boundary', type: 'line', source: 'campus',
        filter: ['all', isCat('boundary'), notHidden],
        paint: { 'line-color': '#f5b544', 'line-width': 1.6, 'line-dasharray': [3, 2], 'line-opacity': 0.8 },
      },
      {
        id: 'road-glow', type: 'line', source: 'campus',
        filter: ['all', isCat('road'), notHidden],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#4cc9f0',
          'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 13, 3, 18, 26],
          'line-blur': ['interpolate', ['linear'], ['zoom'], 13, 3, 18, 18],
          'line-opacity': ['*', 0.45, ['global-state', 'grow']],
        },
      },
      {
        id: 'road', type: 'line', source: 'campus',
        filter: ['all', isCat('road'), notHidden],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#bdf0ff',
          'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 13, 0.6, 18, 3.2],
          'line-opacity': ['*', 0.9, ['global-state', 'grow']],
        },
      },
      {
        id: 'light-heat', type: 'heatmap', source: 'campus',
        filter: ['all', isCat('pole'), lit, notHidden],
        paint: {
          'heatmap-weight': 0.55,
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 13, 0.6, 18, 1.4],
          'heatmap-radius': ['interpolate', ['exponential', 2], ['zoom'], 13, 4, 16, 18, 19, 110],
          'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(255,170,60,0)', 0.15, 'rgba(255,160,50,0.25)', 0.45, 'rgba(255,196,100,0.55)', 0.8, 'rgba(255,230,170,0.8)', 1, 'rgba(255,250,230,0.95)'],
          'heatmap-opacity': 0.85,
          'heatmap-opacity-transition': { duration: 1200 },
        },
      },
      {
        id: 'buildings', type: 'fill-extrusion', source: 'campus',
        filter: ['all', isPoly, isCat(...EXTRUDED), notHidden],
        paint: {
          'fill-extrusion-color': [
            'case',
            ['boolean', ['feature-state', 'sel'], false], '#ffffff',
            ['boolean', ['feature-state', 'hover'], false], '#ffe8b5',
            catColor,
          ],
          'fill-extrusion-height': ['*', ['coalesce', ['get', 'h'], 10], ['global-state', 'grow']],
          'fill-extrusion-base': ['*', ['coalesce', ['get', 'b'], 0], ['global-state', 'grow']],
          'fill-extrusion-opacity': 0.9,
          'fill-extrusion-vertical-gradient': true,
        },
      },
      {
        // invisible stand-in for buildings drawn as 3D models, so they can still be hovered and picked
        id: 'model-hit', type: 'fill-extrusion', source: 'campus',
        filter: ['all', isPoly, isModelled, notHidden],
        layout: { visibility: 'none' },
        paint: {
          'fill-extrusion-color': '#000000',
          'fill-extrusion-height': ['*', ['coalesce', ['get', 'h'], 10], ['global-state', 'grow']],
          'fill-extrusion-opacity': 0,
        },
      },
      {
        id: 'buildings-hover', type: 'line', source: 'campus',
        filter: ['all', isPoly, isCat(...EXTRUDED), notHidden],
        paint: {
          'line-color': '#ffffff',
          'line-width': ['case', ['boolean', ['feature-state', 'sel'], false], 3, ['boolean', ['feature-state', 'hover'], false], 2, 0],
          'line-opacity': 0.9,
        },
      },
      {
        id: 'points-halo', type: 'circle', source: 'campus',
        filter: ['all', isCat('power', 'gate'), notHidden, ['==', ['geometry-type'], 'Point']],
        paint: {
          'circle-color': catColor,
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 5, 18, 16],
          'circle-blur': 1, 'circle-opacity': ['*', 0.55, ['global-state', 'grow']],
        },
      },
      {
        id: 'points', type: 'circle', source: 'campus',
        filter: ['all', isCat('power', 'gate'), notHidden, ['==', ['geometry-type'], 'Point']],
        paint: {
          'circle-color': catColor,
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 2, 18, 6],
          'circle-stroke-color': '#05080f', 'circle-stroke-width': 1,
          'circle-opacity': ['global-state', 'grow'], 'circle-stroke-opacity': ['global-state', 'grow'],
        },
      },
      {
        id: 'route-glow', type: 'line', source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 13, 8, 18, 34],
          'line-blur': ['interpolate', ['linear'], ['zoom'], 13, 6, 18, 22],
          'line-gradient': ['step', ['line-progress'], 'rgba(255,190,80,0.55)', 0, 'rgba(0,0,0,0)'],
        },
      },
      {
        id: 'route-line', type: 'line', source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 13, 3, 18, 9],
          'line-gradient': ['step', ['line-progress'], '#fff1c9', 0, 'rgba(0,0,0,0)'],
        },
      },
      {
        id: 'route-walk', type: 'line', source: 'route-walk',
        layout: { 'line-cap': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 1.5, 18, 4], 'line-dasharray': [0.6, 1.6], 'line-opacity': 0.9 },
      },
      {
        id: 'route-head', type: 'circle', source: 'route-head',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 5, 18, 12],
          'circle-color': '#ffffff', 'circle-blur': 0.35,
          'circle-stroke-color': '#ffc35a', 'circle-stroke-width': 3, 'circle-stroke-opacity': 0.8,
        },
      },
      {
        id: 'lights', type: 'circle', source: 'campus',
        filter: ['all', isCat('pole'), lit, notHidden],
        paint: {
          'circle-color': '#fff4d6',
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 0.6, 16, 1.6, 19, 4],
          'circle-blur': 0.3,
          'circle-opacity': 0.95,
        },
      },
    ],
  }
}

export interface EngineEvents {
  onSelect: (f: CampusFeature | null) => void
  onHover: (f: CampusFeature | null, x: number, y: number) => void
  onMove: (s: { lng: number; lat: number; zoom: number; bearing: number; pitch: number }) => void
}

export class CampusEngine {
  map: MLMap
  private hoverId: string | null = null
  private selId: string | null = null
  private anims = new Map<string, number>()
  private orbitRaf = 0
  night = true

  constructor(container: HTMLElement, private ev: EngineEvents, opts: { attribution?: boolean } = {}) {
    this.map = new maplibregl.Map({
      container,
      style: buildStyle(),
      center: [28, 24],
      zoom: 1.6,
      pitch: 0,
      bearing: 0,
      maxPitch: 78,
      attributionControl: opts.attribution === false ? false : { compact: true },
      canvasContextAttributes: { antialias: true },
      fadeDuration: 200,
    })
    this.map.dragRotate.enable()
    this.map.touchZoomRotate.enableRotation()
    // keep the canvas sharp and full-size when the window moves between screens
    const watchDpr = () => {
      const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
      mq.addEventListener('change', () => { this.map.setPixelRatio(window.devicePixelRatio); this.map.resize(); watchDpr() }, { once: true })
    }
    watchDpr()
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.map.resize() })
    // the style (not the satellite tiles) is all the app needs to start
    const onStyle = () => {
      if (this.isLoaded) return
      this.isLoaded = true
      if (this.pendingHidden) this.setHidden(this.pendingHidden)
      this.loadModels()
      this.readyWaiters.forEach((r) => r())
      this.readyWaiters = []
    }
    this.map.once('style.load', onStyle)
    this.map.once('load', onStyle)
    this.bind()
  }

  private isLoaded = false
  private pendingHidden: Cat[] | null = null

  private readyWaiters: (() => void)[] = []
  ready(): Promise<void> {
    return new Promise((res) => (this.isLoaded ? res() : this.readyWaiters.push(res)))
  }

  /** resolve when the globe imagery is on screen (or after a timeout) */
  tilesReady(timeout = 3500): Promise<void> {
    return new Promise((res) => {
      if (this.map.areTilesLoaded()) return res()
      const t = setTimeout(res, timeout)
      this.map.once('idle', () => { clearTimeout(t); res() })
    })
  }

  private bind() {
    const m = this.map
    const layers = ['buildings', 'model-hit']
    m.on('mousemove', (e) => {
      const f = m.queryRenderedFeatures(e.point, { layers })[0] as unknown as CampusFeature | undefined
      const id = (f?.properties?.id as string) || null
      if (id !== this.hoverId) {
        if (this.hoverId) m.setFeatureState({ source: 'campus', id: this.hoverId }, { hover: false })
        if (id) m.setFeatureState({ source: 'campus', id }, { hover: true })
        this.hoverId = id
      }
      m.getCanvas().style.cursor = this.picking ? 'crosshair' : id ? 'pointer' : ''
      this.ev.onHover(f ?? null, e.point.x, e.point.y)
    })
    m.on('mouseout', () => this.ev.onHover(null, 0, 0))
    m.on('click', (e) => {
      if (this.picking) {
        const r = this.picking; this.picking = null
        m.getCanvas().style.cursor = ''
        r([e.lngLat.lng, e.lngLat.lat])
        return
      }
      const f = m.queryRenderedFeatures(e.point, { layers })[0] as unknown as CampusFeature | undefined
      this.ev.onSelect(f ? ({ type: 'Feature', geometry: f.geometry, properties: f.properties } as CampusFeature) : null)
    })
    const emit = () => {
      const c = m.getCenter()
      this.ev.onMove({ lng: c.lng, lat: c.lat, zoom: m.getZoom(), bearing: m.getBearing(), pitch: m.getPitch() })
    }
    m.on('move', emit)
    m.on('mousedown', () => this.stopOrbit())
    m.on('touchstart', () => this.stopOrbit())
    m.on('wheel', () => this.stopOrbit())
  }

  /** tween a global-state value */
  tween(key: 'grow' | 'lights', to: number, ms: number, ease = easeInOut): Promise<void> {
    const m = this.map
    cancelAnimationFrame(this.anims.get(key) || 0)
    const from = Number(m.getGlobalState()[key] ?? 0)
    const t0 = performance.now()
    return new Promise((res) => {
      const step = (t: number) => {
        const k = Math.min(1, (t - t0) / ms)
        m.setGlobalStateProperty(key, from + (to - from) * ease(k))
        if (k < 1) this.anims.set(key, requestAnimationFrame(step))
        else res()
      }
      this.anims.set(key, requestAnimationFrame(step))
    })
  }

  setData(fc: Campus) {
    this.lastData = fc
    ;(this.map.getSource('campus') as maplibregl.GeoJSONSource).setData(fc)
    this.models?.setData(fc)
  }

  // ---------- detailed 3D models (three.js, loaded on demand) ----------
  private models: Buildings3D | null = null
  private lastData: Campus | null = null

  private async loadModels() {
    const { Buildings3D } = await import('./buildings3d')
    const models = new Buildings3D(this.map)
    // above the ground outline of hovered / selected buildings, so the outline never cuts across a facade
    this.map.addLayer(models.layer, 'points-halo')
    // swap the plain block for the model, keeping an invisible copy for picking
    this.map.setFilter('buildings', ['all', isPoly, isCat(...EXTRUDED), notHidden, ['!', isModelled]])
    this.map.setLayoutProperty('model-hit', 'visibility', 'visible')
    models.setNight(this.night)
    models.setHidden((this.map.getGlobalState().hidden as string[] | undefined) ?? [])
    if (this.lastData) models.setData(this.lastData)
    this.models = models
  }

  async showYear(fc: Campus, animate = true) {
    if (!animate) {
      this.setData(fc)
      this.map.setGlobalStateProperty('grow', 1)
      this.map.setGlobalStateProperty('lights', 1)
      return
    }
    await Promise.all([this.tween('grow', 0, 380, easeOut), this.tween('lights', 0, 300, easeOut)])
    this.setData(fc)
    this.restoreSelection()
    await Promise.all([this.tween('grow', 1, 1300, easeInOut), this.tween('lights', 1, 1700, easeInOut)])
  }

  setHidden(hidden: Cat[]) {
    if (!this.isLoaded) { this.pendingHidden = hidden; return }
    this.map.setGlobalStateProperty('hidden', hidden)
    this.models?.setHidden(hidden)
  }

  setNight(night: boolean) {
    this.night = night
    if (!this.isLoaded) return
    const m = this.map
    m.setPaintProperty('sat', 'raster-brightness-max', night ? 0.42 : 1)
    m.setPaintProperty('sat', 'raster-saturation', night ? -0.55 : 0.05)
    m.setPaintProperty('sat', 'raster-contrast', night ? 0.12 : 0.05)
    m.setPaintProperty('light-heat', 'heatmap-opacity', night ? 0.85 : 0)
    m.setPaintProperty('lights', 'circle-color', night ? '#fff4d6' : '#ffb020')
    m.setPaintProperty('road-glow', 'line-opacity', ['*', night ? 0.45 : 0.12, ['global-state', 'grow']])
    m.setPaintProperty('road', 'line-color', night ? '#bdf0ff' : '#ffffff')
    m.setPaintProperty('buildings', 'fill-extrusion-opacity', night ? 0.9 : 0.94)
    this.models?.setNight(night)
    m.setSky(night
      ? { 'sky-color': '#061024', 'horizon-color': '#1d3a6b', 'fog-color': '#0a1530', 'fog-ground-blend': 0.4, 'horizon-fog-blend': 0.6, 'sky-horizon-blend': 0.6, 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 9, 0.8, 13, 0] }
      : { 'sky-color': '#7cc4ff', 'horizon-color': '#f3e3c3', 'fog-color': '#f5ead2', 'fog-ground-blend': 0.5, 'horizon-fog-blend': 0.4, 'sky-horizon-blend': 0.5, 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 9, 0.8, 13, 0] })
  }

  select(id: string | null) {
    const m = this.map
    if (!this.isLoaded) return
    if (this.selId) m.setFeatureState({ source: 'campus', id: this.selId }, { sel: false })
    this.selId = id
    if (id) m.setFeatureState({ source: 'campus', id }, { sel: true })
  }
  private restoreSelection() {
    if (this.selId) this.map.setFeatureState({ source: 'campus', id: this.selId }, { sel: true })
  }

  /** the opening shot: globe spin, then a long dive onto the campus */
  async intro(onArrive: () => void) {
    const m = this.map
    await new Promise<void>((res) => {
      const t0 = performance.now()
      const spin = (t: number) => {
        const k = (t - t0) / 1800
        m.jumpTo({ center: [28 + k * 4, 24 + k * 1.2] })
        if (k < 1) requestAnimationFrame(spin)
        else res()
      }
      requestAnimationFrame(spin)
    })
    await new Promise<void>((res) => {
      m.flyTo({
        center: CAMPUS_CENTER, zoom: 16.15, pitch: 62, bearing: -32,
        duration: 7200, curve: 1.55, essential: true,
        easing: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
      })
      m.once('moveend', () => res())
    })
    onArrive()
    await this.tween('grow', 1, 1800, easeInOut)
    await this.tween('lights', 1, 2200, easeInOut)
  }

  skipIntro() {
    this.map.stop()
    this.map.jumpTo({ center: CAMPUS_CENTER, zoom: 16.15, pitch: 62, bearing: -32 })
    this.map.setGlobalStateProperty('grow', 1)
    this.map.setGlobalStateProperty('lights', 1)
  }

  flyTo(center: [number, number], opts: { zoom?: number; pitch?: number; bearing?: number; duration?: number } = {}) {
    this.stopOrbit()
    return new Promise<void>((res) => {
      this.map.flyTo({ center, zoom: opts.zoom ?? 17.4, pitch: opts.pitch ?? 60, bearing: opts.bearing ?? this.map.getBearing(), duration: opts.duration ?? 2200, essential: true })
      this.map.once('moveend', () => res())
    })
  }

  orbit(center?: [number, number], degPerSec = 8) {
    this.stopOrbit()
    let last = performance.now()
    const step = (t: number) => {
      const dt = (t - last) / 1000
      last = t
      this.map.jumpTo({ bearing: this.map.getBearing() + degPerSec * dt, center: center ?? this.map.getCenter() })
      this.orbitRaf = requestAnimationFrame(step)
    }
    this.orbitRaf = requestAnimationFrame(step)
  }
  stopOrbit() {
    cancelAnimationFrame(this.orbitRaf)
    this.orbitRaf = 0
  }
  get orbiting() { return this.orbitRaf !== 0 }

  setInteractive(on: boolean) {
    const m = this.map
    for (const h of [m.dragPan, m.scrollZoom, m.boxZoom, m.dragRotate, m.keyboard, m.doubleClickZoom, m.touchZoomRotate]) {
      if (on) h.enable(); else h.disable()
    }
  }

  // ---------- routes ----------
  private routeRaf = 0
  private picking: ((p: [number, number] | null) => void) | null = null

  showRoute(path: [number, number][], legs: [number, number][][], fit: { padding: { top: number; bottom: number; left: number; right: number } }) {
    const m = this.map
    cancelAnimationFrame(this.routeRaf)
    ;(m.getSource('route') as maplibregl.GeoJSONSource).setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: path } })
    ;(m.getSource('route-walk') as maplibregl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: legs.filter((l) => l.length > 1).map((l) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: l } })),
    })
    const all = [...path, ...legs.flat()]
    const lons = all.map((p) => p[0]), lats = all.map((p) => p[1])
    this.stopOrbit()
    m.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
      { padding: fit.padding, pitch: 50, bearing: m.getBearing(), duration: 1600, maxZoom: 18 })
    // reveal the line from start to finish, then loop a pulse along it
    const cum = [0]
    for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.hypot((path[i][0] - path[i - 1][0]) * 99700, (path[i][1] - path[i - 1][1]) * 110540))
    const total = cum.at(-1) || 1
    const at = (k: number): [number, number] => {
      const d = k * total
      let i = cum.findIndex((c) => c >= d); if (i <= 0) return path[0]
      const t = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1)
      return [path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t]
    }
    const head = m.getSource('route-head') as maplibregl.GeoJSONSource
    const t0 = performance.now() + 700
    const reveal = 1500
    const loop = Math.max(2600, Math.min(9000, total * 4))
    const frame = (now: number) => {
      const e = now - t0
      if (e < reveal) {
        const k = Math.max(0.0001, easeInOut(Math.max(0, e) / reveal))
        m.setPaintProperty('route-line', 'line-gradient', ['step', ['line-progress'], '#fff1c9', k, 'rgba(0,0,0,0)'])
        m.setPaintProperty('route-glow', 'line-gradient', ['step', ['line-progress'], 'rgba(255,190,80,0.55)', k, 'rgba(0,0,0,0)'])
        head.setData({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: at(k) } })
      } else {
        if (e - reveal < 40) {
          m.setPaintProperty('route-line', 'line-gradient', ['interpolate', ['linear'], ['line-progress'], 0, '#7fe3ff', 1, '#ffd27a'])
          m.setPaintProperty('route-glow', 'line-gradient', ['interpolate', ['linear'], ['line-progress'], 0, 'rgba(76,201,240,0.5)', 1, 'rgba(255,190,80,0.55)'])
        }
        head.setData({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: at(((e - reveal) % loop) / loop) } })
      }
      this.routeRaf = requestAnimationFrame(frame)
    }
    this.routeRaf = requestAnimationFrame(frame)
  }

  clearRoute() {
    cancelAnimationFrame(this.routeRaf)
    const empty = { type: 'FeatureCollection' as const, features: [] }
    ;(['route', 'route-walk', 'route-head'] as const).forEach((id) => (this.map.getSource(id) as maplibregl.GeoJSONSource | undefined)?.setData(empty))
  }

  /** resolve with the next clicked map position (or null if cancelled) */
  pickPoint(): Promise<[number, number] | null> {
    this.picking?.(null)
    this.map.getCanvas().style.cursor = 'crosshair'
    return new Promise((res) => { this.picking = res })
  }
  cancelPick() { this.picking?.(null); this.picking = null; this.map.getCanvas().style.cursor = '' }
  get isPicking() { return !!this.picking }

  // ---------- spatial analysis ----------
  private analysis: AnalysisLayers | null = null
  private get ana() { return (this.analysis ??= new AnalysisLayers(this.map)) }

  setRaster(frame: RasterFrame | null, opacity: number) {
    if (this.isLoaded) this.ana.setRaster(frame, opacity)
  }

  /** show the given analyses; one that was just switched on and reaches outside the view is framed */
  setVectors(all: VectorLayer[], on: string[]) {
    if (!this.isLoaded) return
    const added = this.ana.setVectors(all, on)
    const v = added.at(-1)
    if (!v) return
    const view = this.map.getBounds()
    const [[w, s], [e, n]] = v.bounds
    if (view.contains([w, s]) && view.contains([e, n])) return
    this.stopOrbit()
    this.map.fitBounds(v.bounds, { padding: { top: 90, bottom: 150, left: 40, right: 320 }, pitch: 45, bearing: this.map.getBearing(), duration: 1800, maxZoom: 16.5 })
  }

  resetNorth() { this.map.easeTo({ bearing: 0, pitch: 50, duration: 900 }) }
  zoomBy(d: number) { this.map.easeTo({ zoom: this.map.getZoom() + d, duration: 400 }) }
  overview() { return this.flyTo(CAMPUS_CENTER, { zoom: 15.4, pitch: 55, bearing: -25, duration: 2400 }) }

  destroy() {
    this.stopOrbit()
    this.map.remove()
  }
}
