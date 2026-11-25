/**
 * The gallery's chapters and maps. Each entry says where its image comes from in the Drive folder
 * (see scripts/sync-maps.ts); captions and camera focus live here. Imports nothing so Node can load it.
 */

export type ChapterId = 'land' | 'climate' | 'change' | 'veg' | 'campus' | 'model3d' | 'facades'
export type VegIndex = 'NDVI' | 'SAVI' | 'CCI'

export interface Chapter { id: ChapterId; title: string; sub: string }

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

export const CHAPTERS: Chapter[] = [
  { id: 'land', title: 'المكان', sub: 'أين يقع الحرم، وعلى أي أرض يقوم: الصخر والتربة والتضاريس ومجاري السيول' },
  { id: 'climate', title: 'المناخ', sub: 'الحرارة والرطوبة والرياح والشمس، وحرارة سطح الأرض في فصول السنة' },
  { id: 'change', title: 'عشرون عامًا من التحوّل', sub: 'من مزرعة وأرض فضاء إلى حرم جامعي، من صور جوجل إيرث والأقمار الصناعية' },
  { id: 'veg', title: 'عشرون عامًا من الخُضرة', sub: 'ثلاثة مؤشرات نباتية من صور الأقمار الصناعية' },
  { id: 'campus', title: 'الحرم تحت المجهر', sub: 'تحليلات مكانية وشبكية لحرم جامعة سوهاج الجديدة' },
  { id: 'model3d', title: 'الحرم مجسّمًا', sub: 'مشاهد ثلاثية الأبعاد للمباني والطرق والمساحات الخضراء عبر السنين' },
  { id: 'facades', title: 'واجهات الحرم', sub: 'واجهات الكليات والسكن والخدمات كما رُسمت في النموذج المعماري' },
]

const TOPO = 'تحليل طبوغرافي'
const NET = 'تحليل الشبكي'

const VEG_YEAR_NOTES: Record<number, string> = {
  2006: 'مزرعة كثيفة في الركن الشمالي الشرقي، وبقية الحرم أرض فضاء.',
  2011: 'الرقعة الخضراء تتسع غربًا على طول الحد الشمالي.',
  2016: 'الخضرة ما زالت متركزة في المزرعة الشمالية الشرقية، وبقية الحرم شبه خالية من النبات.',
  2021: 'الخضرة تنكمش إلى بقعة صغيرة مع امتداد المباني.',
  2026: 'خضرة متناثرة بين المباني: حدائق وتشجير بدل المزرعة الواحدة.',
}
const veg = (index: VegIndex, title: string, desc: string): Entry =>
  ({ key: index.toLowerCase(), chapter: 'veg', mode: 'years', from: `مؤشرات/${index}`, title, short: index, desc, yearNotes: VEG_YEAR_NOTES, focus: [27, 40], index })

/** an architectural elevation from the 3D model, kept in assets/maps-local/facades (not in Drive) */
const facade = (key: string, title: string, short: string, desc: string): Entry =>
  ({ key: `facade-${key}`, chapter: 'facades', mode: 'single', from: `local:facades/${key}.jpg`, title, short, desc, kind: 'render', focus: [50, 50] })

export const ENTRIES: Entry[] = [
  // ---------- المكان ----------
  { key: 'base', chapter: 'land', mode: 'single', from: 'خريطه الأساس', title: 'موقع الجامعة', short: 'خريطة الأساس', focus: [32, 45],
    desc: 'صورة فضائية للحرم بحدوده بين الهضبة الغربية وطريق المطار الدولي، وموقعه في محافظة سوهاج بين أسيوط وقنا.' },
  { key: 'geology', chapter: 'land', mode: 'single', from: 'خريطه جيولوجيا', title: 'جيولوجيا المنطقة', short: 'الجيولوجيا',
    desc: 'يقوم الحرم على وحدة من الحصى والرمال القديمة، ضمن خريطة جيولوجية للمحافظة تظهر فيها رواسب الأودية وطمي النيل وصخور الإيوسين والفوالق.' },
  { key: 'soil', chapter: 'land', mode: 'single', from: 'خريطه التربه', title: 'خريطة التربة', short: 'التربة',
    desc: 'تربة الحرم فيضية كلسية، وحولها في المحافظة تربة صحراوية كلسية وأخرى صخرية ضحلة.' },
  { key: 'contours', chapter: 'land', mode: 'single', from: `${TOPO}/6048464566376665306.jpg`, title: 'خطوط الكنتور', short: 'الكنتور',
    desc: 'خطوط الارتفاع المتساوي حول الحرم: أرض منبسطة عند قدم الهضبة الغربية التي تتزاحم خطوطها غربًا.' },
  { key: 'dem', chapter: 'land', mode: 'single', from: `${TOPO}/6048464566376665310.jpg`, title: 'نموذج الارتفاع الرقمي', short: 'الارتفاعات',
    desc: 'ارتفاع سطح الأرض في كل خلية من الحرم، ضمن مدى يتراوح في المنطقة بين 51 و701.' },
  { key: 'slope', chapter: 'land', mode: 'single', from: `${TOPO}/6048464566376665309.jpg`, title: 'درجات الانحدار', short: 'الانحدار',
    desc: 'أرض الحرم مصنفة بحسب شدة انحدارها، من الأرض المستوية إلى الانحدار الشديد والجروف.' },
  { key: 'aspect', chapter: 'land', mode: 'single', from: `${TOPO}/6048464566376665308.jpg`, title: 'اتجاه الانحدار', short: 'اتجاه الانحدار',
    desc: 'الاتجاه الذي يميل إليه سطح الأرض في كل خلية: الجهات الأربع وما بينها، أو أرض مستوية.' },
  { key: 'flood-risk', chapter: 'land', mode: 'single', from: 'تحليل الهيدرولوجي', title: 'الأحواض ومخاطر السيول', short: 'مخاطر السيول', focus: [35, 50],
    desc: 'أحواض الأودية غرب الحرم وشبكة مجاريها بحسب رتبها، ونقاط الخطر عند مخارج الأودية قرب حدود الحرم.' },

  // ---------- المناخ ----------
  { key: 'air-temp', chapter: 'climate', mode: 'single', from: 'المناخ/درجه الحراره', title: 'درجة الحرارة', short: 'الحرارة',
    desc: 'حرارة الهواء: يقع الحرم في نطاق واحد ضمن مدى يتراوح في المنطقة بين 14.8 و16.9 درجة.' },
  { key: 'humidity', chapter: 'climate', mode: 'single', from: 'المناخ/الرطوبه', title: 'الرطوبة', short: 'الرطوبة',
    desc: 'الحرم كله في نطاق الرطوبة الخفيفة، بينما تزداد الرطوبة في شمال المنطقة.' },
  { key: 'wind-dir', chapter: 'climate', mode: 'single', from: 'المناخ/إتجاه الرياح', title: 'اتجاه الرياح', short: 'اتجاه الرياح',
    desc: 'الرياح السائدة على الحرم شمالية، وتميل إلى الشمالية الغربية والغربية في شمال المنطقة.' },
  { key: 'wind-speed', chapter: 'climate', mode: 'single', from: 'المناخ/سرعه الرياح', title: 'سرعة الرياح', short: 'سرعة الرياح',
    desc: 'سرعة الرياح على الحرم والمنطقة حوله، مصنفة من الرياح الخفيفة إلى العواصف الشديدة.' },
  { key: 'solar', chapter: 'climate', mode: 'single', from: 'local:solar.jpg', title: 'الإشعاع الشمسي', short: 'الإشعاع الشمسي', focus: [30, 45],
    desc: 'تدرّج الإشعاع الشمسي على أرض الحرم، ضمن خريطة المحافظة التي تتراوح بين 5.2 وأكثر من 7.6 كيلوواط ساعة لكل متر مربع. مؤشر على إمكانات الطاقة الشمسية.' },
  { key: 'lst', chapter: 'climate', mode: 'years', from: 'درجه حراره السطح', title: 'حرارة سطح الأرض', short: 'حرارة السطح', focus: [50, 50],
    desc: 'حرارة سطح الأرض المقيسة من الأقمار الصناعية في فصول السنة الأربعة: الخريف والصيف والشتاء والربيع.' },

  // ---------- التحوّل ----------
  { key: 'landuse', chapter: 'change', mode: 'years', from: 'الشف من جوجل إيرث', title: 'استخدامات الأرض', short: 'استخدامات الأرض', focus: [35, 40],
    desc: 'المباني والطرق والمساحات الخضراء مرسومة من صور جوجل إيرث بحسب وظيفتها.',
    yearNotes: {
      2006: 'مزرعة في الشمال وأرض فضاء، ومبنيان صغيران تحت الإنشاء.',
      2011: 'أولى الكليات والمدرجات وسكن الطالبات، وطرق داخلية وأعمدة إنارة.',
      2021: 'الحرم يمتلئ: كليات ومبانٍ إدارية وسكن وخدمات ومساحات خضراء.',
      2026: 'كليات وإدارة وسكن وخدمات ومساجد، ومعها الطرق والبوابات وأعمدة الإنارة.',
    } },
  { key: 'class', chapter: 'change', mode: 'years', from: 'تصنيف', title: 'تصنيف الغطاء الأرضي', short: 'الغطاء الأرضي', focus: [35, 40],
    desc: 'كل خلية من صورة القمر الصناعي مصنفة إلى عمران أو زراعة أو أرض فراغ.',
    yearNotes: {
      2006: 'زراعة في الشمال وبقعتا عمران صغيرتان، وبقية الحرم فراغ.',
      2011: 'العمران يظهر في بقع صغيرة جنوب المزرعة.',
      2021: 'العمران ينتشر في النصف الشمالي ويتداخل مع الزراعة.',
      2026: 'العمران يمتد في بقع متفرقة جنوبًا وغربًا.',
    } },

  // ---------- الخُضرة ----------
  veg('NDVI', 'مؤشر الغطاء النباتي · NDVI', 'يقيس كثافة النبات من الفرق بين انعكاس الأشعة تحت الحمراء القريبة والضوء الأحمر.'),
  veg('SAVI', 'مؤشر النبات المعدّل للتربة · SAVI', 'مثل NDVI مع تصحيح لأثر التربة المكشوفة، فيكون أدق في البيئة الصحراوية.'),
  veg('CCI', 'مؤشر محتوى الكلوروفيل · CCI', 'يقدّر تركيز الكلوروفيل في الأوراق، أي صحة الغطاء الأخضر لا مساحته فقط.'),

  // ---------- الحرم تحت المجهر ----------
  { key: 'route-network', chapter: 'campus', mode: 'single', from: `${NET}/5769252582164468400.jpg`, title: 'أفضل مسار عبر الشبكة', short: 'أفضل مسار', focus: [62, 30],
    desc: 'مسار يمر بثماني عشرة محطة توقف على طرق الحرم الفعلية، محسوب بتحليل الشبكات.' },
  { key: 'route-direct', chapter: 'campus', mode: 'single', from: 'local:route-direct.jpg', title: 'ترتيب المحطات', short: 'ترتيب المحطات', focus: [55, 35],
    desc: 'المحطات نفسها موصولة بخطوط مستقيمة، لمقارنة المسافة المباشرة بالمسافة على الطريق.' },
  { key: 'service-area', chapter: 'campus', mode: 'single', from: `${NET}/5769252582164468399.jpg`, title: 'نطاقات الخدمة', short: 'نطاقات الخدمة', focus: [65, 30],
    desc: 'المساحة التي تغطيها كل منشأة عبر شبكة الطرق، في ثلاثة نطاقات قطع: 10 و100 و350.' },
  { key: 'closest-facility', chapter: 'campus', mode: 'single', from: 'local:closest-facility.jpg', title: 'أقرب منشأة خدمية', short: 'أقرب منشأة', focus: [72, 32],
    desc: 'أقصر طريق من كل موقع إلى أقرب كافتيريا أو مسجد أو بوابة.' },
  { key: 'od-matrix', chapter: 'campus', mode: 'single', from: `${NET}/5769252582164468398.jpg`, title: 'مصفوفة الأصل والوجهة', short: 'الأصل والوجهة', focus: [65, 28],
    desc: 'ربط كل كلية بمواقف وجراجات السيارات لقياس سهولة الوصول إليها.' },

  // ---------- مجسّمًا ----------
  { key: 'model', chapter: 'model3d', mode: 'all', from: 'رفع ثلاثي الابعاد', title: 'الحرم مجسّمًا', short: 'مجسّم', kind: 'render', focus: [50, 50],
    desc: 'مشهد ثلاثي الأبعاد للحرم: المباني والطرق والمساحات الخضراء كما كانت في تلك السنة.' },

  // ---------- الواجهات (assets/maps-local/facades) ----------
  facade('exams-center', 'مركز الاختبارات الإلكترونية', 'الاختبارات الإلكترونية',
    'ستة طوابق حول برج دائري أحمر، وبوابة كبيرة تحمل اسم المبنى أمام المدخل.'),
  facade('computers', 'كلية الحاسبات والمعلومات والذكاء الاصطناعي', 'الحاسبات',
    'جناحان من ستة طوابق يحيطان بكتلة وسطى بشرفات حمراء، والمدخل تحت بوابة تحمل اسم الكلية.'),
  facade('engineering', 'كلية الهندسة', 'الهندسة',
    'واجهة طويلة من ستة طوابق بإطار بارز حول النوافذ الوسطى، وسلالم دائرية بشرفات على الطرفين.'),
  facade('commerce', 'كلية التجارة', 'التجارة',
    'واجهة من ستة طوابق بإطار بارز يحمل اسم الكلية فوق المدخلين، وأجنحة بشرفات على الجانبين.'),
  facade('education', 'كلية التربية', 'التربية',
    'واجهة متناظرة بإطار بارز فوق المدخلين، وسلالم دائرية بارزة في الجناحين.'),
  facade('arts', 'كلية الآداب', 'الآداب',
    'واجهة من ستة طوابق بإطار بارز يحمل اسم الكلية، وسلالم دائرية بشرفات على الطرفين.'),
  facade('dentistry', 'كلية طب الفم والأسنان', 'طب الأسنان',
    'كتلة وسطى بشرفات حمراء يعلوها اسم الكلية، وجناحان بأقواس طويلة تمتد على ستة طوابق.'),
  facade('housing-balconies', 'مبنى سكني بالشرفات', 'مبنى بالشرفات',
    'ستة طوابق من الشرفات المتكررة حول برج سلالم دائري في الوسط.'),
  facade('housing-blocks', 'عمارات بشرفات دائرية', 'عمارات متجاورة',
    'عمارات متجاورة من ستة طوابق، لكل منها مدخل وشرفات دائرية حمراء عند الأركان.'),
  facade('six-storey', 'مبنى من ستة طوابق', 'مبنى ستة طوابق',
    'واجهة من ستة طوابق بجزء منحنٍ في الوسط فوق المدخل.'),
  facade('orange-blocks', 'مبانٍ بأشرطة برتقالية', 'الأشرطة البرتقالية',
    'مجموعة مبانٍ بأشرطة برتقالية وأبراج سلالم مشبّكة، ومدخل في الكتلة الوسطى.'),
  facade('mosque-wing', 'مبنى بجوار المسجد', 'بجوار المسجد',
    'مبنى ممتد من ثلاثة طوابق بأبراج زجاجية، وتظهر مآذن المسجد في طرفه.'),
  facade('college-court', 'ساحة بين الكليات', 'ساحة الكليات',
    'مبانٍ من ستة طوابق تحيط بساحة مفتوحة تنتهي بمدخل كلية في صدرها.'),
  facade('sports-courts', 'الملاعب', 'الملاعب',
    'ملاعب مسوّرة بين مبنى من ستة طوابق ومبنى من طابقين، كما تبدو من الطريق.'),
]
