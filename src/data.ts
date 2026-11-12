import type { Feature, FeatureCollection, Geometry } from 'geojson'

export const YEARS = [2006, 2011, 2016, 2021, 2026] as const
export type Year = (typeof YEARS)[number]

export const CAMPUS_CENTER: [number, number] = [31.6668, 26.4598]

export type Cat =
  | 'faculty' | 'admin' | 'housing' | 'lecture' | 'mosque' | 'service' | 'kiosk' | 'cafe'
  | 'caravan' | 'construction' | 'sports' | 'parking' | 'green' | 'farm' | 'canopy'
  | 'building' | 'boundary' | 'pole' | 'power' | 'gate' | 'road'

export interface CampusProps {
  id: string
  c: Cat
  n?: string
  h?: number
  b?: number
  p?: string
  px?: string[]
  rt?: string
  r?: number
}
export type CampusFeature = Feature<Geometry, CampusProps>
export type Campus = FeatureCollection<Geometry, CampusProps>

export interface Floor { floor: string; rooms: string[] }
export interface Profile {
  key: string
  name: string
  desc: string
  floors: Floor[]
  images: string[]
  size?: { length: string; width: string; height: string }
  mapped: boolean
}
export interface YearStats { features: number; byCat: Partial<Record<Cat, number>>; roadKm: number; builtM2: number }
export interface Stats { years: Record<string, YearStats>; categories: Record<Cat, string> }

export const CAT_META: Record<Cat, { label: string; color: string; group: 'build' | 'infra' | 'land' }> = {
  faculty: { label: 'الكليات', color: '#f5b544', group: 'build' },
  lecture: { label: 'المدرجات', color: '#f472b6', group: 'build' },
  admin: { label: 'مبانٍ إدارية', color: '#a78bfa', group: 'build' },
  housing: { label: 'المدن الجامعية', color: '#60a5fa', group: 'build' },
  mosque: { label: 'المساجد', color: '#fff1c9', group: 'build' },
  service: { label: 'خدمات حكومية', color: '#34d399', group: 'build' },
  cafe: { label: 'الكافتيريات', color: '#fb923c', group: 'build' },
  kiosk: { label: 'أكشاك خدمات', color: '#2dd4bf', group: 'build' },
  caravan: { label: 'الكرفانات', color: '#94a3b8', group: 'build' },
  construction: { label: 'تحت الإنشاء', color: '#ff6a3d', group: 'build' },
  building: { label: 'مبانٍ أخرى', color: '#cbd5e1', group: 'build' },
  pole: { label: 'أعمدة الإنارة', color: '#ffd27a', group: 'infra' },
  power: { label: 'أكشاك الكهرباء', color: '#facc15', group: 'infra' },
  road: { label: 'الطرق', color: '#4cc9f0', group: 'infra' },
  gate: { label: 'البوابات', color: '#7dd3fc', group: 'infra' },
  canopy: { label: 'المظلات', color: '#e2e8f0', group: 'infra' },
  sports: { label: 'الملاعب', color: '#22c55e', group: 'land' },
  green: { label: 'مساحات خضراء', color: '#4ade80', group: 'land' },
  farm: { label: 'المزرعة', color: '#a3e635', group: 'land' },
  parking: { label: 'المواقف', color: '#64748b', group: 'land' },
  boundary: { label: 'حدود الحرم', color: '#f5b544', group: 'land' },
}

export const EXTRUDED: Cat[] = ['faculty', 'lecture', 'admin', 'housing', 'mosque', 'service', 'cafe', 'kiosk', 'caravan', 'construction', 'building', 'canopy']

export const YEAR_STORY: Record<Year, { title: string; line: string }> = {
  2006: { title: 'البداية', line: 'أرض صحراوية وأول حدود مرسومة للموقع.' },
  2011: { title: 'أول الكليات', line: 'التربية والآداب والتجارة والهندسة ترتفع، وأول 237 عمود إنارة.' },
  2016: { title: 'مدينة جامعية', line: 'إحدى عشرة عمارة سكنية للطلاب، ومسجد، وشبكة طرق 30 كم.' },
  2021: { title: 'حرم يتنفس', line: 'مظلات ومساحات خضراء وكرفانات وخدمات للطلاب.' },
  2026: { title: 'التوأم الرقمي', line: '1,856 عمود إنارة، 70 كم طرق، ومزرعة كلية الزراعة.' },
}

const cache = new Map<number, Promise<Campus>>()
export function loadYear(y: number): Promise<Campus> {
  if (!cache.has(y)) {
    cache.set(y, fetch(`/data/years/${y}.geojson`).then((r) => r.json()).then((fc: Campus) => rankLights(fc)))
  }
  return cache.get(y)!
}

/** give each light / point a 0..1 rank by distance from the campus heart, used for the "wave of light" reveal */
function rankLights(fc: Campus): Campus {
  const pts = fc.features.filter((f) => f.geometry.type === 'Point')
  const d = (f: CampusFeature) => {
    const [x, y] = (f.geometry as GeoJSON.Point).coordinates
    return Math.hypot((x - CAMPUS_CENTER[0]) * 0.895, y - CAMPUS_CENTER[1])
  }
  const max = Math.max(...pts.map(d), 1e-9)
  pts.forEach((f) => (f.properties.r = d(f) / max))
  return fc
}

export async function loadProfiles(): Promise<Profile[]> {
  return fetch('/data/profiles.json').then((r) => r.json())
}
export async function loadStats(): Promise<Stats> {
  return fetch('/data/stats.json').then((r) => r.json())
}

export function norm(s: string | undefined) {
  return (s || '')
    .normalize('NFKC')
    .replace(/[ـ\s_\-–·]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ً-ْ]/g, '')
    .toLowerCase()
}

export function centroid(g: Geometry): [number, number] {
  const ring =
    g.type === 'Polygon' ? g.coordinates[0] :
    g.type === 'MultiPolygon' ? g.coordinates[0][0] :
    g.type === 'Point' ? [g.coordinates] :
    g.type === 'LineString' ? g.coordinates : []
  let x = 0, y = 0
  ring.forEach((c) => { x += c[0]; y += c[1] })
  return [x / ring.length, y / ring.length]
}

/** footprint area in m², courtyards (inner rings) subtracted */
export function areaM2(g: Geometry): number {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []
  const ringArea = (ring: number[][]) => {
    const lat0 = ring[0][1] * Math.PI / 180
    const kx = 111320 * Math.cos(lat0), ky = 110540
    let a = 0
    for (let i = 0; i < ring.length - 1; i++) {
      a += ring[i][0] * kx * ring[i + 1][1] * ky - ring[i + 1][0] * kx * ring[i][1] * ky
    }
    return Math.abs(a / 2)
  }
  return polys.reduce((sum, rings) => sum + ringArea(rings[0]) - rings.slice(1).reduce((h, r) => h + ringArea(r), 0), 0)
}

export const fmt = (n: number, d = 0) => n.toLocaleString('en-US', { maximumFractionDigits: d })
