import type {
  Map as MLMap, ImageSource, LayerSpecification, ExpressionSpecification,
  FillLayerSpecification, LineLayerSpecification, CircleLayerSpecification,
} from 'maplibre-gl'
import type { RasterFrame, VectorLayer } from '../data'

/** raster overlays sit on the base map, under every campus layer */
const RASTER_BEFORE = 'land'
/** vector fills go under the buildings, their lines and points above them but under a directions route */
const FILL_BEFORE = 'model-hit'
const LINE_BEFORE = 'route-glow'

type NoSource<T> = T extends unknown ? Omit<T, 'source'> : never
type Spec = { below: boolean; layer: NoSource<FillLayerSpecification | LineLayerSpecification | CircleLayerSpecification> }

const kind = (...k: string[]): ExpressionSpecification => ['in', ['get', 'k'], ['literal', k]]
const z = (a: number, b: number): ExpressionSpecification => ['interpolate', ['linear'], ['zoom'], 13, a, 18, b]
const dot = (id: string, k: string, color: string, r: [number, number], stroke = '#05080f'): Spec => ({
  below: false,
  layer: {
    id, type: 'circle', filter: kind(k),
    paint: { 'circle-color': color, 'circle-radius': z(...r), 'circle-stroke-color': stroke, 'circle-stroke-width': 1.5 },
  },
})

/** per analysis: the map layers that draw it (ids are prefixed with ana-<id>- when added) */
const SPECS: Record<string, Spec[]> = {
  service: [
    {
      below: true,
      layer: {
        id: 'fill', type: 'fill', filter: kind('area'),
        layout: { 'fill-sort-key': ['-', 0, ['get', 'to']] },
        paint: {
          'fill-color': ['step', ['get', 'to'], '#ffd27a', 11, '#f59e0b', 101, '#b45309'],
          'fill-opacity': ['step', ['get', 'to'], 0.55, 11, 0.3, 101, 0.16],
        },
      },
    },
    {
      below: true,
      layer: {
        id: 'edge', type: 'line', filter: kind('area'),
        paint: { 'line-color': ['step', ['get', 'to'], '#ffd27a', 11, '#f59e0b', 101, '#d97706'], 'line-width': 0.8, 'line-opacity': 0.55 },
      },
    },
    dot('fac', 'facility', '#ffd27a', [3, 7]),
  ],
  closest: [
    {
      below: false,
      layer: {
        id: 'alt', type: 'line', filter: ['all', kind('route'), ['>', ['get', 'rank'], 1]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#3b82f6', 'line-width': z(0.8, 2.4), 'line-opacity': 0.45 },
      },
    },
    {
      below: false,
      layer: {
        id: 'glow', type: 'line', filter: ['all', kind('route'), ['==', ['get', 'rank'], 1]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#7fe3ff', 'line-width': z(5, 16), 'line-blur': z(4, 12), 'line-opacity': 0.4 },
      },
    },
    {
      below: false,
      layer: {
        id: 'best', type: 'line', filter: ['all', kind('route'), ['==', ['get', 'rank'], 1]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#bff2ff', 'line-width': z(1.6, 4.5) },
      },
    },
    dot('inc', 'incident', '#f472b6', [3, 7]),
    dot('fac', 'facility', '#ffd27a', [3, 7]),
  ],
  odmatrix: [
    {
      below: false,
      layer: {
        id: 'second', type: 'line', filter: ['all', kind('line'), ['==', ['get', 'rank'], 2]],
        layout: { 'line-cap': 'round' },
        paint: { 'line-color': '#7c3aed', 'line-width': z(1, 2.6), 'line-dasharray': [2, 2], 'line-opacity': 0.8 },
      },
    },
    {
      below: false,
      layer: {
        id: 'first', type: 'line', filter: ['all', kind('line'), ['==', ['get', 'rank'], 1]],
        layout: { 'line-cap': 'round' },
        paint: { 'line-color': '#c4b5fd', 'line-width': z(1.4, 3.6), 'line-opacity': 0.95 },
      },
    },
    dot('origin', 'origin', '#ffd27a', [2.5, 6]),
    dot('dest', 'dest', '#a78bfa', [4, 10], '#ede9fe'),
  ],
  tour: [
    {
      below: false,
      layer: {
        id: 'glow', type: 'line', filter: kind('route'),
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#4ade80', 'line-width': z(6, 20), 'line-blur': z(4, 14), 'line-opacity': 0.45 },
      },
    },
    {
      below: false,
      layer: {
        id: 'line', type: 'line', filter: kind('route'),
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#bbf7d0', 'line-width': z(1.6, 4.5) },
      },
    },
    dot('stop', 'stop', '#ffffff', [3, 8], '#16a34a'),
  ],
  hydro: [
    {
      below: true,
      layer: { id: 'basin', type: 'fill', filter: kind('basin'), paint: { 'fill-color': '#0ea5e9', 'fill-opacity': 0.1 } },
    },
    {
      below: false,
      layer: {
        id: 'basin-edge', type: 'line', filter: kind('basin'),
        paint: { 'line-color': '#7dd3fc', 'line-width': 1.4, 'line-dasharray': [3, 2], 'line-opacity': 0.75 },
      },
    },
    {
      below: false,
      layer: {
        id: 'stream', type: 'line', filter: kind('stream'),
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['interpolate', ['linear'], ['get', 'order'], 1, '#0369a1', 4, '#7dd3fc'],
          'line-width': ['interpolate', ['linear'], ['get', 'order'], 1, 0.8, 4, 4],
          'line-opacity': 0.9,
        },
      },
    },
    {
      below: false,
      layer: {
        id: 'hazard-halo', type: 'circle', filter: kind('hazard'),
        paint: { 'circle-color': '#ef4444', 'circle-radius': z(8, 22), 'circle-blur': 1, 'circle-opacity': 0.6 },
      },
    },
    dot('hazard', 'hazard', '#ef4444', [3, 7], '#fee2e2'),
  ],
}

/** two image sources that cross-fade, so a year or season change dissolves instead of popping */
export class AnalysisLayers {
  private front: 'a' | 'b' = 'a'
  private shown = ''
  private token = 0

  constructor(private map: MLMap) {}

  async setRaster(frame: RasterFrame | null, opacity: number) {
    const m = this.map
    const cur = `ana-${this.front}`
    const token = ++this.token
    if (!frame) {
      this.shown = ''
      if (m.getLayer(cur)) m.setPaintProperty(cur, 'raster-opacity', 0)
      return
    }
    if (frame.url === this.shown) {
      m.setPaintProperty(cur, 'raster-opacity', opacity)
      return
    }
    // decode first so the fade starts with the image ready
    const img = new Image()
    img.src = frame.url
    await img.decode().catch(() => undefined)
    if (token !== this.token) return
    const nextKey = this.shown ? (this.front === 'a' ? 'b' : 'a') : this.front
    const id = `ana-${nextKey}`
    const src = m.getSource(id) as ImageSource | undefined
    if (src) src.updateImage({ url: frame.url, coordinates: frame.coords })
    else {
      m.addSource(id, { type: 'image', url: frame.url, coordinates: frame.coords })
      m.addLayer({
        id, type: 'raster', source: id,
        paint: { 'raster-opacity': 0, 'raster-opacity-transition': { duration: 700, delay: 0 }, 'raster-fade-duration': 0, 'raster-resampling': 'linear' },
      }, RASTER_BEFORE)
    }
    m.setPaintProperty(id, 'raster-opacity', opacity)
    if (id !== cur && m.getLayer(cur)) m.setPaintProperty(cur, 'raster-opacity', 0)
    this.front = nextKey
    this.shown = frame.url
  }

  /** show exactly the analyses in `on`; returns the ones that were just switched on */
  setVectors(all: VectorLayer[], on: string[]): VectorLayer[] {
    const m = this.map
    const added: VectorLayer[] = []
    for (const v of all) {
      const want = on.includes(v.id)
      const src = `ana-${v.id}`
      const specs = SPECS[v.id] ?? []
      if (want && !m.getSource(src)) m.addSource(src, { type: 'geojson', data: v.url })
      if (!m.getSource(src)) continue
      for (const s of specs) {
        const id = `${src}-${s.layer.id}`
        if (want && !m.getLayer(id)) {
          m.addLayer({ ...s.layer, id, source: src } as LayerSpecification, s.below ? FILL_BEFORE : LINE_BEFORE)
        }
        const vis = want ? 'visible' : 'none'
        if (m.getLayer(id) && m.getLayoutProperty(id, 'visibility') !== vis) {
          m.setLayoutProperty(id, 'visibility', vis)
          if (want && s === specs[0]) added.push(v)
        }
      }
    }
    return added
  }
}
