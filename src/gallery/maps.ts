/**
 * The map atlas shown in the gallery: the hand-written catalog (catalog.ts) joined with the images
 * synced from Google Drive at build time (images.gen.json, written by scripts/sync-maps.ts).
 */
import { CHAPTERS, ENTRIES, type ChapterId, type VegIndex } from './catalog'
import generated from './images.gen.json'

export { CHAPTERS, type ChapterId, type VegIndex }
export const VEG_INDICES: VegIndex[] = ['NDVI', 'SAVI', 'CCI']

export interface MapShot {
  id: string
  chapter: ChapterId
  title: string
  /** grid label */
  short: string
  desc: string
  w: number
  h: number
  /** camera focus for the slow push-in, in % of the image (x, y) */
  focus: [number, number]
  /** shots with the same reel share one frame and one continuous camera move (time-lapse) */
  reel: string
  kind: 'map' | 'render'
  index?: VegIndex
  year?: number
  src: string
  thumb: string
}

interface GenShot { id: string; entry: string; year?: number; src: string; thumb: string; w: number; h: number }

const byKey = new Map(ENTRIES.map((e) => [e.key, e]))

export const SHOTS: MapShot[] = (generated.shots as GenShot[]).map((g) => {
  const e = byKey.get(g.entry)
  if (!e) throw new Error(`images.gen.json lists "${g.entry}", which is not in catalog.ts; run npm run maps`)
  const note = g.year ? e.yearNotes?.[g.year] : undefined
  return {
    id: g.id,
    chapter: e.chapter,
    title: e.title,
    short: e.short ?? e.title,
    desc: note ? `${note} ${e.desc}` : e.desc,
    w: g.w,
    h: g.h,
    focus: e.focus ?? [30, 45],
    reel: e.mode === 'years' ? e.key : g.id,
    kind: e.kind ?? 'map',
    index: e.index,
    year: g.year,
    src: g.src,
    thumb: g.thumb,
  }
})

const reels = new Map<string, MapShot[]>()
for (const s of SHOTS) reels.set(s.reel, [...(reels.get(s.reel) ?? []), s])
export const reelOf = (s: MapShot): MapShot[] => reels.get(s.reel)!

export const src = (s: MapShot) => s.src
export const thumb = (s: MapShot) => s.thumb
