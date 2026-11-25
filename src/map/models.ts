/**
 * Buildings drawn as detailed 3D models, keyed by profile.
 * Kept free of three.js so the engine can read it without loading the 3D code.
 *
 * Facade styles, painted per storey:
 *   granite   ground-floor stone cladding with large glazed openings (height = groundHeight)
 *   band      plaster wall with a coloured strip behind each window row
 *   plaster   plaster wall with punched windows (optionally in white box surrounds)
 *   balcony   residential: French windows with a railed balcony on alternate bays
 *   ribbon    continuous strip windows with plaster spandrels
 *   curtain   full-height glass between thin mullions
 *   cladding  flat panels (colors.band) with joints (colors.coping) at every bay and storey and
 *             punched windows; a wide `joint` reads as an exposed concrete frame, `brick` fills it
 *   parapet   roof parapet with coping (height = parapet)
 * Bands are listed bottom to top; `floors` is the number of storeys a band holds.
 */
export type FacadeStyle = 'granite' | 'band' | 'plaster' | 'balcony' | 'ribbon' | 'curtain' | 'cladding' | 'parapet'

export interface ModelSpec {
  /** width of one window bay (m) */
  bay: number
  /** typical storey height (m) */
  storey: number
  groundHeight: number
  parapet: number
  colors: { plaster: string; band: string; base: string; frame: string; coping: string }
  window: { width: number; height: number; surround: boolean; ac: number }
  bands: { style: FacadeStyle; floors: number }[]
  /** cladding joint width (m), default 3 cm */
  joint?: number
  /** brick infill in the cladding panels */
  brick?: boolean
}

type Bands = ModelSpec['bands']
const b = (style: FacadeStyle, floors = 1) => ({ style, floors })

export const MODEL_SPECS: Record<string, ModelSpec> = {
  // Faculty of Commerce: red granite ground floor, two storeys with the maroon window band,
  // four plaster storeys with white framed windows and AC units, ~30 m with the roof housings.
  'كلية التجارة': {
    bay: 3.6, storey: 3.75, groundHeight: 4.5, parapet: 1.2,
    colors: { plaster: '#ead5c8', band: '#8a3a31', base: '#6e2f2a', frame: '#f6f3ee', coping: '#cdb3a3' },
    window: { width: 1.9, height: 1.5, surround: true, ac: 0.65 },
    bands: [
      { style: 'granite', floors: 1 },
      { style: 'band', floors: 2 },
      { style: 'plaster', floors: 4 },
      { style: 'parapet', floors: 1 },
    ],
  },

  // Design A, shared by Arts, Education and Engineering: short granite plinth, a recessed
  // centre block with coloured strips behind four window rows, a plain top storey.
  'كلية الآداب': designA('#f0dccb', '#a95a4f', '#8a4a42', '#e6cdb5'),
  'كلية التربية': designA('#ebe3d6', '#9b5345', '#6b4a40', '#c8a07c'),
  'كلية الهندسة': designA('#f0b49a', '#9a4c44', '#6e4a44', '#d4a07e'),

  // Design B, like Commerce: granite ground floor, two banded storeys, framed windows above.
  'كلية الحاسبات والذكاء الاصطناعي': designB('#f1b597', '#9c5852', '#6e3a35', '#3f9a3a', '#e6a886'),
  'كلية الطب البيطري': designB('#ecb48e', '#8f4a44', '#6e3a35', '#4e8f3e', '#e2a883'),

  'الإدارة الهندسية': {
    bay: 4.3, storey: 3.2, groundHeight: 1.8, parapet: 1.5,
    colors: { plaster: '#e9cfac', band: '#bf8f5f', base: '#8d5c58', frame: '#e8e6e0', coping: '#e6ceaa' },
    window: { width: 2.4, height: 1.3, surround: false, ac: 0.2 },
    bands: [b('granite'), b('band', 4), b('parapet')],
  },
  'الجامعة الأهلية': {
    bay: 3.8, storey: 4.2, groundHeight: 1.5, parapet: 3.0,
    colors: { plaster: '#e6cfa5', band: '#df8a6e', base: '#4f3a38', frame: '#3b302a', coping: '#dcc49c' },
    window: { width: 2.6, height: 1.4, surround: false, ac: 0.5 },
    bands: [b('granite'), b('band', 4), b('plaster'), b('parapet')],
  },
  'كريتيفا': {
    bay: 4.5, storey: 6.0, groundHeight: 0, parapet: 4.0,
    colors: { plaster: '#d8cfc2', band: '#d6c0b2', base: '#8a8a88', frame: '#b8bcb6', coping: '#eef0ea' },
    window: { width: 1.3, height: 4.2, surround: false, ac: 0 },
    bands: [b('cladding', 3), b('parapet')],
  },
  'كلية التربية الرياضية': {
    bay: 4.3, storey: 3.2, groundHeight: 0, parapet: 1.0, joint: 0.35, brick: true,
    colors: { plaster: '#e8dcc6', band: '#a65a4a', base: '#5a4a44', frame: '#4a4a48', coping: '#e6d8c0' },
    window: { width: 1.6, height: 1.25, surround: false, ac: 0.6 },
    bands: [b('cladding', 6), b('parapet')],
  },
  'كلية الزراعة': {
    bay: 3.6, storey: 3.6, groundHeight: 4.0, parapet: 2.0,
    colors: { plaster: '#dcb58e', band: '#d9c3b8', base: '#5e3e38', frame: '#3d4a40', coping: '#d6ad84' },
    window: { width: 1.6, height: 1.3, surround: false, ac: 0.1 },
    bands: [b('granite'), b('plaster', 6), b('parapet')],
  },
  'كلية الصيدلة': {
    bay: 6.5, storey: 4.5, groundHeight: 4.8, parapet: 2.5,
    colors: { plaster: '#e8c49c', band: '#8e8e8c', base: '#a0706a', frame: '#6b3b30', coping: '#f0b4a4' },
    window: { width: 1.6, height: 1.4, surround: false, ac: 0 },
    bands: [b('granite'), b('cladding', 4), b('parapet')],
  },
  'كلية طب الأسنان': {
    bay: 3.8, storey: 4.4, groundHeight: 2.0, parapet: 2.5,
    colors: { plaster: '#e6bd70', band: '#b8624b', base: '#7a4844', frame: '#2f3946', coping: '#dcc49a' },
    window: { width: 2.7, height: 1.5, surround: false, ac: 0.4 },
    bands: [b('granite'), b('band', 4), b('plaster'), b('parapet')],
  },
  'مركز الاختبارات الإلكترونية': {
    bay: 3.4, storey: 3.5, groundHeight: 1.6, parapet: 1.2,
    colors: { plaster: '#efe7d6', band: '#e2c88f', base: '#6e4442', frame: '#2f7a45', coping: '#e2c88f' },
    window: { width: 2.0, height: 1.3, surround: false, ac: 0.5 },
    bands: [b('granite'), b('plaster', 2), b('cladding', 3), b('parapet')],
  },
}

function designA(plaster: string, band: string, base: string, coping: string): ModelSpec {
  const bands: Bands = [b('granite'), b('band', 4), b('plaster'), b('parapet')]
  return {
    bay: 4.0, storey: 4.5, groundHeight: 1.5, parapet: 2.0,
    colors: { plaster, band, base, frame: '#f1f1ef', coping },
    window: { width: 2.0, height: 1.4, surround: false, ac: 0.2 },
    bands,
  }
}

function designB(plaster: string, band: string, base: string, frame: string, coping: string): ModelSpec {
  return {
    bay: 3.6, storey: 3.9, groundHeight: 4.5, parapet: 2.0,
    colors: { plaster, band, base, frame, coping },
    window: { width: 1.9, height: 1.4, surround: true, ac: 0.85 },
    bands: [b('granite'), b('band', 2), b('plaster', 3), b('parapet')],
  }
}

export const MODELLED = Object.keys(MODEL_SPECS)
/** building categories drawn by the 3D layer: photographed models, category styles, or props (src/map/props3d.ts) */
export const MODELLED_CATS = ['faculty', 'lecture', 'admin', 'housing', 'mosque', 'service', 'cafe', 'kiosk', 'caravan', 'construction', 'building', 'canopy']

// ---------- every other building: a style per category, fitted to the building's own height ----------
const spec = (bay: number, storey: number, groundHeight: number, parapet: number,
  colors: ModelSpec['colors'], window: ModelSpec['window'], bands: Bands, extra: Partial<ModelSpec> = {}): ModelSpec =>
  ({ bay, storey, groundHeight, parapet, colors, window, bands, ...extra })

export const CATEGORY_SPECS: Record<string, ModelSpec> = {
  // staff housing: balconies on alternate bays, AC units under the windows
  housing: spec(3.4, 3.1, 1.2, 1.2,
    { plaster: '#ead8bd', band: '#8f5b43', base: '#7d5a4a', frame: '#f2efe8', coping: '#d9c2a0' },
    { width: 1.6, height: 1.5, surround: false, ac: 0.5 }, [b('granite'), b('balcony', 7), b('parapet')]),
  admin: spec(3.8, 3.8, 1.5, 1.6,
    { plaster: '#ece0cf', band: '#4f7180', base: '#5e4a44', frame: '#eef0f0', coping: '#cdbca5' },
    { width: 2.2, height: 1.5, surround: false, ac: 0.35 }, [b('granite'), b('band', 6), b('parapet')]),
  faculty: designA('#efdcc8', '#9b5a4a', '#7a4a42', '#dcc3aa'),
  service: spec(3.6, 3.4, 0, 0.7,
    { plaster: '#efe3cf', band: '#c9b393', base: '#8a5a4a', frame: '#e9e6e0', coping: '#b89c7c' },
    { width: 1.6, height: 1.4, surround: false, ac: 0.4 }, [b('plaster', 1), b('parapet')]),
  cafe: spec(3.0, 3.0, 0, 0.6,
    { plaster: '#efe3cf', band: '#c96f4a', base: '#6b4a40', frame: '#3a3a3a', coping: '#c96f4a' },
    { width: 1.6, height: 1.6, surround: false, ac: 0 }, [b('curtain', 1), b('parapet')]),
  kiosk: spec(2.4, 2.2, 0, 0.4,
    { plaster: '#f3f1ec', band: '#d8d4cc', base: '#6b6b6b', frame: '#4a4a4a', coping: '#ffffff' },
    { width: 1.0, height: 0.9, surround: false, ac: 0 }, [b('cladding', 1), b('parapet')]),
  caravan: spec(2.4, 2.6, 0, 0.3,
    { plaster: '#eef0f0', band: '#eef0f0', base: '#9aa3ab', frame: '#9aa3ab', coping: '#c3c9ce' },
    { width: 1.0, height: 0.8, surround: false, ac: 0.3 }, [b('cladding', 1), b('parapet')]),
  building: spec(3.6, 3.4, 1.2, 1.0,
    { plaster: '#e9dcc8', band: '#a8806a', base: '#7a5a4a', frame: '#f0eee9', coping: '#cfbfa8' },
    { width: 1.7, height: 1.4, surround: false, ac: 0.4 }, [b('granite'), b('plaster', 3), b('parapet')]),
}

/** buildings with a look of their own, by normalised name; `height` overrides a default height in the data */
const NAMED: [RegExp, ModelSpec, number?][] = [
  // student dorms: plaster with a terracotta band behind each window row
  [/^سكن(الطلاب|طلاب|الطالبات|طابات)|^سكن\d/, spec(3.6, 3.2, 1.5, 1.2,
    { plaster: '#efd9c0', band: '#a35b45', base: '#7a4a42', frame: '#f1efea', coping: '#d8bfa2' },
    { width: 1.4, height: 1.4, surround: false, ac: 0.3 }, [b('granite'), b('band', 7), b('parapet')])],
  // kindergarten: low and cheerful, in the data at the faculty default of 30 m
  [/حضانه/, spec(3.6, 3.3, 1.0, 1.0,
    { plaster: '#fff1d6', band: '#f2a33a', base: '#5aa9e6', frame: '#3a8fd1', coping: '#f2a33a' },
    { width: 1.8, height: 1.3, surround: false, ac: 0.2 }, [b('granite'), b('band', 3), b('parapet')]), 10.5],
  // Suez Canal hall: glass ground floor, blue-grey ribbon windows above
  [/قناهالسويس/, spec(4.0, 4.2, 4.5, 1.4,
    { plaster: '#e9e1d3', band: '#3f5d74', base: '#4a4a4a', frame: '#cfd6dc', coping: '#bfc7cc' },
    { width: 2.4, height: 1.8, surround: false, ac: 0 }, [b('curtain', 1), b('ribbon', 2), b('parapet')], { groundHeight: 0 })],
  [/قاعهالمؤتمرات/, spec(4.5, 5, 4.5, 2,
    { plaster: '#ece0cf', band: '#7c4a42', base: '#5e4a44', frame: '#eef0f0', coping: '#cdbca5' },
    { width: 1.2, height: 3.4, surround: false, ac: 0 }, [b('granite'), b('plaster', 4), b('parapet')])],
  [/بريد/, spec(3.6, 3.4, 0, 0.7,
    { plaster: '#f3ead8', band: '#1f7a4a', base: '#8a5a4a', frame: '#e9e6e0', coping: '#1f7a4a' },
    { width: 1.6, height: 1.4, surround: false, ac: 0.4 }, [b('plaster', 1), b('parapet')])],
  // kiosks in their brands' colours
  [/فوري/, kiosk('#ffd200', '#1b4f9c')], [/المصريهللاتصالات/, kiosk('#6b2d8b', '#ffffff')],
  [/كازابلانكا/, kiosk('#c8102e', '#ffffff')], [/بيتالتطوع/, kiosk('#3f9a4a', '#ffffff')],
]

function kiosk(color: string, joint: string): ModelSpec {
  return { ...CATEGORY_SPECS.kiosk, colors: { ...CATEGORY_SPECS.kiosk.colors, band: color, coping: joint } }
}

const normName = (s?: string) => (s || '').normalize('NFKC').replace(/[ـ\s_\-–·]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')

/** the spec for a building without a photographed model, already fitted to its height */
export function specFor(c: string, name: string | undefined, h: number): { id: string; spec: ModelSpec } | null {
  const n = normName(name)
  const named = NAMED.find(([re]) => re.test(n))
  const base = named?.[1] ?? CATEGORY_SPECS[c]
  if (!base) return null
  const height = named?.[2] ?? h
  const id = `${named ? named[0].source : c}:${height}`
  return { id, spec: fit(base, height) }
}

/** keep the style, re-divide the storeys so the walls end at the building's real height */
function fit(s: ModelSpec, h: number): ModelSpec {
  const small = h < 6
  const ground = small ? 0 : s.groundHeight
  const parapet = small ? Math.min(s.parapet, Math.max(0.3, h * 0.12)) : s.parapet
  const main = s.bands.filter((x) => x.style !== 'granite' && x.style !== 'parapet')
  const total = Math.max(1, Math.round((h - ground - parapet) / s.storey))
  const storey = Math.max(2, (h - ground - parapet) / total)
  // the first main band keeps its storeys (up to all but one), the last takes the rest
  const bands: Bands = []
  if (ground > 0) bands.push(b('granite'))
  if (main.length > 1 && total > 1) {
    const first = Math.min(main[0].floors, total - 1)
    bands.push(b(main[0].style, first), b(main[main.length - 1].style, total - first))
  } else bands.push(b(main[0]?.style ?? 'plaster', total))
  bands.push(b('parapet'))
  return { ...s, storey, groundHeight: ground, parapet, bands }
}
