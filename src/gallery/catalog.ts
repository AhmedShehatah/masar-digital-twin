/**
 * The gallery's chapters and maps. Each entry says where its image comes from in the Drive folder
 * (see scripts/sync-maps.ts); captions and camera focus live here. Imports nothing so Node can load it.
 */

export type ChapterId = 'land' | 'climate' | 'change' | 'veg' | 'campus' | 'model3d'
export type VegIndex = 'NDVI' | 'SAVI' | 'CCI'

export interface Chapter { id: ChapterId; kicker: string; title: string; sub: string }

export interface Entry {
  key: string
  chapter: ChapterId
  /**
   * single: `from` is a folder holding one image, `folder/file.ext`, or `local:file` (assets/maps-local).
   * years:  every 4-digit subfolder of `from` holding one image is a frame of one time-lapse.
   * all:    every image under `from`, each its own shot; year taken from the nearest 4-digit folder.
   */
  mode: 'single' | 'years' | 'all'
  from: string
  title: string
  /** grid label; defaults to title */
  short?: string
  desc: string
  yearNotes?: Record<number, string>
  /** camera focus for the slow push-in, in % of the image (x, y) */
  focus?: [number, number]
  kind?: 'map' | 'render'
  index?: VegIndex
}

export const CHAPTERS: Chapter[] = []

export const ENTRIES: Entry[] = []
