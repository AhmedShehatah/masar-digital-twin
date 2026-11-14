/** The map atlas shown in the gallery. Images live in public/images/maps (thumbs in /thumb). */

export type VegIndex = 'NDVI' | 'SAVI' | 'CCI'
export const VEG_INDICES: VegIndex[] = ['NDVI', 'SAVI', 'CCI']
export const VEG_YEARS = [2006, 2011, 2021, 2026] as const

export interface Chapter {
  id: 'campus' | 'veg'
  kicker: string
  title: string
  sub: string
}

export interface MapShot {
  id: string
  chapter: Chapter['id']
  title: string
  desc: string
  w: number
  h: number
  /** camera focus for the slow push-in, in % of the image (x, y) */
  focus: [number, number]
  /** shots with the same reel share one frame and one continuous camera move (time-lapse) */
  reel: string
  index?: VegIndex
  year?: number
}

export const CHAPTERS: Chapter[] = [
  { id: 'campus', kicker: 'الفصل الأول', title: 'الحرم تحت المجهر', sub: 'تحليلات مكانية وشبكية لحرم جامعة سوهاج الجديدة' },
  { id: 'veg', kicker: 'الفصل الثاني', title: 'عشرون عامًا من الخُضرة', sub: 'ثلاثة مؤشرات نباتية من صور الأقمار الصناعية، من 2006 إلى 2026' },
]

const campus = (id: string, title: string, desc: string, w: number, h: number, focus: [number, number]): MapShot =>
  ({ id, chapter: 'campus', title, desc, w, h, focus, reel: id })

const VEG_INFO: Record<VegIndex, { title: string; desc: string }> = {
  NDVI: { title: 'مؤشر الغطاء النباتي · NDVI', desc: 'يقيس كثافة النبات من الفرق بين انعكاس الأشعة تحت الحمراء القريبة والضوء الأحمر.' },
  SAVI: { title: 'مؤشر النبات المعدّل للتربة · SAVI', desc: 'مثل NDVI مع تصحيح لأثر التربة المكشوفة، فيكون أدق في البيئة الصحراوية.' },
  CCI: { title: 'مؤشر محتوى الكلوروفيل · CCI', desc: 'يقدّر تركيز الكلوروفيل في الأوراق، أي صحة الغطاء الأخضر لا مساحته فقط.' },
}
const YEAR_NOTE: Record<number, string> = {
  2006: 'مزرعة كثيفة في الركن الشمالي الشرقي، وبقية الحرم أرض فضاء.',
  2011: 'الرقعة الخضراء تتسع غربًا على طول الحد الشمالي.',
  2021: 'الخضرة تنكمش إلى بقعة صغيرة مع امتداد المباني.',
  2026: 'خضرة متناثرة بين المباني: حدائق وتشجير بدل المزرعة الواحدة.',
}

const veg: MapShot[] = VEG_INDICES.flatMap((ix) =>
  VEG_YEARS.map((y) => ({
    id: `${ix.toLowerCase()}-${y}`,
    chapter: 'veg' as const,
    title: VEG_INFO[ix].title,
    desc: `${YEAR_NOTE[y]} ${VEG_INFO[ix].desc}`,
    w: 1462, h: 1034,
    focus: [27, 40] as [number, number],
    reel: `veg-${ix}`,
    index: ix,
    year: y,
  })),
)

export const SHOTS: MapShot[] = [
  campus('landuse', 'خريطة استخدامات الأرض', 'المباني بحسب وظيفتها: كليات، إدارة، سكن، خدمات ومساجد. ومعها الطرق والبوابات وأعمدة الإنارة والمساحات الخضراء، وموقع الحرم بين أسيوط وسوهاج.', 1280, 905, [42, 32]),
  campus('solar', 'الإشعاع الشمسي', 'تدرّج الإشعاع الشمسي على أرض الحرم، ضمن خريطة المحافظة التي تتراوح بين 5.2 وأكثر من 7.6 كيلوواط ساعة لكل متر مربع. مؤشر على إمكانات الطاقة الشمسية.', 1221, 864, [30, 45]),
  campus('route-network', 'أفضل مسار عبر الشبكة', 'مسار يمر بثماني عشرة محطة توقف على طرق الحرم الفعلية، محسوب بتحليل الشبكات.', 904, 1280, [62, 30]),
  campus('route-direct', 'ترتيب المحطات', 'المحطات نفسها موصولة بخطوط مستقيمة، لمقارنة المسافة المباشرة بالمسافة على الطريق.', 904, 1280, [55, 35]),
  campus('service-area', 'نطاقات الخدمة', 'المساحة التي تغطيها كل منشأة عبر شبكة الطرق، في ثلاثة نطاقات قطع: 10 و100 و350.', 904, 1280, [65, 30]),
  campus('closest-facility', 'أقرب منشأة خدمية', 'أقصر طريق من كل موقع إلى أقرب كافتيريا أو مسجد أو بوابة.', 904, 1280, [72, 32]),
  campus('od-matrix', 'مصفوفة الأصل والوجهة', 'ربط كل كلية بمواقف وجراجات السيارات لقياس سهولة الوصول إليها.', 904, 1280, [65, 28]),
  ...veg,
]

export const src = (s: MapShot) => `/images/maps/${s.id}.jpg`
export const thumb = (s: MapShot) => `/images/maps/thumb/${s.id}.jpg`
