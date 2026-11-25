import type { Map as MLMap, LayerSpecification, SourceSpecification } from 'maplibre-gl'

/** raster tone for one light mode */
interface Tone { max: number; sat: number; con: number }

interface Tiles {
  tiles: string[]
  maxzoom: number
  attribution: string
  night: Tone
  day: Tone
}

const esri = (path: string) => [`https://server.arcgisonline.com/ArcGIS/rest/services/${path}/MapServer/tile/{z}/{y}/{x}`]

const OSM = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
/** light cartographic maps are dimmed at night so the campus glow still reads */
const DIM: Tone = { max: 0.55, sat: -0.35, con: 0.05 }
const PLAIN: Tone = { max: 1, sat: 0, con: 0 }

/**
 * Every tile set a base map can draw, in stacking order (bottom first).
 * Each becomes a source and a raster layer named `base-<key>`.
 */
const TILES = {
  sat: {
    tiles: esri('World_Imagery'), maxzoom: 18,
    attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
    night: { max: 0.42, sat: -0.55, con: 0.12 }, day: { max: 1, sat: 0.05, con: 0.05 },
  },
  streets: { tiles: esri('World_Street_Map'), maxzoom: 19, attribution: 'Tiles © Esri', night: DIM, day: PLAIN },
  topo: { tiles: esri('World_Topo_Map'), maxzoom: 19, attribution: 'Tiles © Esri', night: DIM, day: PLAIN },
  osm: { tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], maxzoom: 19, attribution: OSM, night: DIM, day: PLAIN },
  terrain: {
    tiles: ['a', 'b', 'c'].map((s) => `https://${s}.tile.opentopomap.org/{z}/{x}/{y}.png`), maxzoom: 17,
    attribution: `${OSM}, SRTM · Style © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)`,
    night: DIM, day: PLAIN,
  },
  // Esri's canvas maps stop at z16 and are overscaled past it
  light: { tiles: esri('Canvas/World_Light_Gray_Base'), maxzoom: 16, attribution: 'Tiles © Esri', night: DIM, day: PLAIN },
  dark: { tiles: esri('Canvas/World_Dark_Gray_Base'), maxzoom: 16, attribution: 'Tiles © Esri', night: PLAIN, day: PLAIN },
  // label overlays
  lightLabels: { tiles: esri('Canvas/World_Light_Gray_Reference'), maxzoom: 16, attribution: 'Labels © Esri', night: DIM, day: PLAIN },
  darkLabels: { tiles: esri('Canvas/World_Dark_Gray_Reference'), maxzoom: 16, attribution: 'Labels © Esri', night: PLAIN, day: PLAIN },
  roads: { tiles: esri('Reference/World_Transportation'), maxzoom: 18, attribution: 'Labels © Esri', night: { max: 0.75, sat: -0.2, con: 0 }, day: PLAIN },
  places: { tiles: esri('Reference/World_Boundaries_and_Places'), maxzoom: 18, attribution: 'Labels © Esri', night: { max: 0.85, sat: 0, con: 0 }, day: PLAIN },
} satisfies Record<string, Tiles>

type TileKey = keyof typeof TILES
const TILE_KEYS = Object.keys(TILES) as TileKey[]

export const BASEMAPS = [
  { id: 'sat', label: 'قمر صناعي', swatch: 'linear-gradient(135deg, #2f4a2a, #7a6a45, #3b5d6e)', layers: ['sat'] },
  { id: 'hybrid', label: 'هجين', swatch: 'linear-gradient(135deg, #2f4a2a, #7a6a45 60%, #f5d76e 61%, #f5d76e 66%, #3b5d6e 67%)', layers: ['sat', 'roads', 'places'] },
  { id: 'streets', label: 'شوارع', swatch: 'linear-gradient(135deg, #f2efe9, #fcd6a4 50%, #f2efe9 51%, #aad3df)', layers: ['streets'] },
  { id: 'osm', label: 'OpenStreetMap', swatch: 'linear-gradient(135deg, #f2efe9, #f7fabf 45%, #e892a2 50%, #add19e)', layers: ['osm'] },
  { id: 'topo', label: 'طبوغرافية', swatch: 'linear-gradient(135deg, #e8e4d4, #c9dcb4, #b5d0e0)', layers: ['topo'] },
  { id: 'terrain', label: 'تضاريس', swatch: 'repeating-linear-gradient(135deg, #e9e4c9 0 4px, #c8b98a 4px 5px)', layers: ['terrain'] },
  { id: 'light', label: 'فاتحة', swatch: 'linear-gradient(135deg, #fafaf8, #e3e3df)', layers: ['light', 'lightLabels'] },
  { id: 'dark', label: 'داكنة', swatch: 'linear-gradient(135deg, #262626, #0e0e0e)', layers: ['dark', 'darkLabels'] },
] as const satisfies readonly { id: string; label: string; swatch: string; layers: readonly TileKey[] }[]

export type BasemapId = (typeof BASEMAPS)[number]['id']
export const DEFAULT_BASEMAP: BasemapId = 'sat'
export const isBasemap = (v: unknown): v is BasemapId => BASEMAPS.some((b) => b.id === v)

const layerId = (k: TileKey) => `base-${k}`

const shown = (id: BasemapId) => BASEMAPS.find((b) => b.id === id)!.layers as readonly TileKey[]

const tonePaint = (t: Tone) => ({ 'raster-brightness-max': t.max, 'raster-saturation': t.sat, 'raster-contrast': t.con })

export function basemapSources(): Record<string, SourceSpecification> {
  return Object.fromEntries(TILE_KEYS.map((k) => {
    const t: Tiles = TILES[k]
    return [layerId(k), { type: 'raster', tiles: t.tiles, tileSize: 256, maxzoom: t.maxzoom, attribution: t.attribution }]
  }))
}

export function basemapLayers(initial: BasemapId, night: boolean): LayerSpecification[] {
  const on = shown(initial)
  return TILE_KEYS.map((k) => ({
    id: layerId(k), type: 'raster', source: layerId(k),
    layout: { visibility: on.includes(k) ? 'visible' : 'none' },
    paint: {
      ...tonePaint(night ? TILES[k].night : TILES[k].day),
      'raster-fade-duration': 250,
      'raster-brightness-max-transition': { duration: 1400 },
      'raster-saturation-transition': { duration: 1400 },
    },
  }))
}

/** show only the tile layers that make up `id` (hidden layers fetch no tiles) */
export function applyBasemap(m: MLMap, id: BasemapId) {
  const on = shown(id)
  for (const k of TILE_KEYS) m.setLayoutProperty(layerId(k), 'visibility', on.includes(k) ? 'visible' : 'none')
}

export function applyBasemapTone(m: MLMap, night: boolean) {
  for (const k of TILE_KEYS) {
    const t = night ? TILES[k].night : TILES[k].day
    m.setPaintProperty(layerId(k), 'raster-brightness-max', t.max)
    m.setPaintProperty(layerId(k), 'raster-saturation', t.sat)
    m.setPaintProperty(layerId(k), 'raster-contrast', t.con)
  }
}
