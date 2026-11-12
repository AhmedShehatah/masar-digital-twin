import { CAT_META, YEARS, YEAR_STORY, fmt, norm, type Campus, type Cat, type Profile, type Stats, type Year } from '../data'

export type Intent =
  | { kind: 'goto'; profile?: string; place?: string; room?: string; reply: string }
  | { kind: 'year'; year: Year; reply: string }
  | { kind: 'night' | 'day' | 'tour' | 'overview' | 'help'; reply: string }
  | { kind: 'say'; reply: string }
  | { kind: 'route'; from?: RouteTarget; to?: RouteTarget; reply: string }

export interface RouteTarget { profile?: string; place?: string; room?: string }

export interface IntentCtx {
  profiles: Profile[]
  data: Partial<Record<Year, Campus>>
  stats: Stats | null
  year: Year
}

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩'
const ORDINALS: [RegExp, string][] = [
  [/البواب[ةه]\s*(الاولى|الأولى|الاولي|الأولي|واحد)/g, 'البوابة 1'], [/البواب[ةه]\s*(الثانية|التانية|الثانيه|التانيه|اتنين)/g, 'البوابة 2'],
  [/البواب[ةه]\s*(الثالثة|التالتة|الثالثه|التالته|تلاته)/g, 'البوابة 3'], [/البواب[ةه]\s*(الرابعة|الرابعه|اربعه)/g, 'البوابة 4'],
  [/البواب[ةه]\s*(الخامسة|الخامسه|خمسه)/g, 'البوابة 5'], [/بوابة\s*رقم\s*/g, 'البوابة '], [/البوابه\s*(\d)/g, 'البوابة $1'],
]
const toLatin = (s: string) => ORDINALS.reduce((t, [re, r]) => t.replace(re, r), s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d))))

const ROUTE_WORDS = /اقصر|أقصر|اروح|أروح|اوصل|أوصل|امشي|أمشي|اتجاه|الطريق\s*(?:الى|إلى|ل)|طريق\s*(?:الى|إلى)|مسار\s*(?:من|الى|إلى)|ازاي\s*اروح|إزاي\s*أروح|كيف\s*اصل|كيف\s*أصل/

function toTarget(i: Intent | null): RouteTarget | undefined {
  return i && i.kind === 'goto' ? { profile: i.profile, place: i.place, room: i.room } : undefined
}
const targetName = (t?: RouteTarget) => t?.room ?? t?.profile ?? (t?.place && /^المصل/.test(t.place) ? 'المسجد' : t?.place)

// most specific first: "ستة وعشرين" and "ستة عشر" both contain "ستة"
const YEAR_WORDS: [RegExp, Year][] = [
  [/2026|سته?\s*و\s*عشرين|الحالي|النهارده|اليوم|دلوقتي/, 2026],
  [/2021|واحد\s*و\s*عشرين/, 2021],
  [/2016|سته?\s*عشر|ستاشر/, 2016],
  [/2011|(احد|حداش)\s*عشر|حداشر/, 2011],
  [/2006|الفين\s*و\s*سته?/, 2006],
]

const COUNT_TOPICS: { re: RegExp; cats?: Cat[]; label: string; road?: boolean }[] = [
  { re: /عمود|اعمده|انار|لمب|نور/, cats: ['pole'], label: 'عمود إنارة' },
  { re: /طريق|طرق|شارع|شوارع|كيلو/, road: true, label: 'كم من الطرق' },
  { re: /كليه|كليات/, cats: ['faculty'], label: 'جزءًا من مباني الكليات' },
  { re: /مسجد|مساجد/, cats: ['mosque'], label: 'جزءًا معماريًا للمساجد' },
  { re: /مظل/, cats: ['canopy'], label: 'مظلة' },
  { re: /سكن|عماره|عمارات/, cats: ['housing'], label: 'مبنى سكني' },
  { re: /كهرب/, cats: ['power'], label: 'كشك كهرباء' },
  { re: /بواب/, cats: ['gate'], label: 'بوابة' },
  { re: /كافيتير|كافتير|مطعم/, cats: ['cafe'], label: 'كافتيريا' },
]

/** a few spoken short forms → profile keys */
const SHORT: Record<string, string> = {
  'هندسه': 'كلية الهندسة', 'اداب': 'كلية الآداب', 'تجاره': 'كلية التجارة', 'تربيهرياضيه': 'كلية التربية الرياضية',
  'تربيه': 'كلية التربية', 'اسنان': 'كلية طب الأسنان', 'صيدله': 'كلية الصيدلة', 'زراعه': 'كلية الزراعة',
  'بيطري': 'كلية الطب البيطري', 'حقوق': 'كلية الحقوق', 'السن': 'كلية الألسن', 'اثار': 'كلية الآثار',
  'حاسبات': 'كلية الحاسبات والذكاء الاصطناعي', 'ذكاءاصطناعي': 'كلية الحاسبات والذكاء الاصطناعي',
  'الاهليه': 'الجامعة الأهلية', 'كريتيفا': 'كريتيفا', 'اختبارات': 'مركز الاختبارات الإلكترونية',
  'الاداره الهندسيه': 'الإدارة الهندسية', 'الادارهالهندسيه': 'الإدارة الهندسية',
}

const floorsAr = (n: number) => (n === 1 ? 'دورًا واحدًا' : n === 2 ? 'دورين' : n <= 10 ? `${n} أدوار` : `${n} دورًا`)

export function understand(raw: string, ctx: IntentCtx, targetOnly = false): Intent {
  const text = toLatin(raw)
  const n = norm(text)
  const has = (re: RegExp) => re.test(n) || re.test(text)

  if (!n) return { kind: 'say', reply: 'لم أسمع شيئًا. جرّب مرة أخرى.' }

  // shortest path: "من البوابة 1 إلى كلية الهندسة", "ازاي اروح معمل 309"
  if (!targetOnly) {
    const m = text.match(/(?:^|\s)من\s+(.+?)\s+(?:إلى|الى|لحد|لغاية|لغايه|حتى|لـ)\s*(.+)$/) ?? text.match(/(?:^|\s)من\s+(.+?)\s+ل(\S.*)$/)
    if (m || ROUTE_WORDS.test(text)) {
      const fromT = m ? toTarget(understand(m[1], ctx, true)) : undefined
      const toPart = m ? m[2] : text.replace(ROUTE_WORDS, ' ')
      const toT = toTarget(understand(toPart, ctx, true))
      if (toT) {
        return { kind: 'route', from: fromT, to: toT,
          reply: `هذا أقصر طريق${fromT ? ` من ${targetName(fromT)}` : ' من البوابة 1'} إلى ${targetName(toT)}.` }
      }
    }
  }

  if (!targetOnly && has(/^(مرحبا|اهلا|السلام|هاي|صباح|مساء)/) && n.length < 18)
    return { kind: 'help', reply: 'أهلًا بك في مسار! يمكنني أن آخذك إلى أي كلية أو قاعة، أو أعرض الحرم في أي سنة، أو أشغّل الجولة السينمائية.' }
  if (!targetOnly && has(/ساعد|تعمل\s*ايه|تقدر|ممكن\s*تعمل|مساعده/))
    return { kind: 'help', reply: 'قل مثلًا: خذني إلى كلية الهندسة، أو أين معمل 309، أو اعرض الحرم في 2011، أو كم عمود إنارة.' }
  if (!targetOnly && has(/جول|فيلم|اشرح|عرض\s*سينمائي|احكي/))
    return { kind: 'tour', reply: 'حسنًا، لنبدأ الجولة السينمائية.' }
  if (!targetOnly && has(/ليل|ضلم|ظلم|نور\s*الانار|ولع/) && !has(/كم|عدد/))
    return { kind: 'night', reply: 'وضع الليل، ومعه إنارة الحرم.' }
  if (!targetOnly && has(/نهار|صباح|شمس|فاتح/))
    return { kind: 'day', reply: 'وضع النهار.' }
  if (!targetOnly && (has(/الحرم\s*كله|كامل|نظره\s*عامه|من\s*فوق|ارجع/) || /الحرمكله|نظرهعامه/.test(n)))
    return { kind: 'overview', reply: 'هذا هو الحرم كاملًا.' }

  // counts
  if (!targetOnly && has(/كم|عدد|قد\s*ايه/)) {
    const y = YEAR_WORDS.find(([re]) => re.test(n) || re.test(text))?.[1] ?? ctx.year
    const s = ctx.stats?.years[String(y)]
    const t = COUNT_TOPICS.find((t) => t.re.test(n))
    if (s && t) {
      if (t.road) return { kind: 'say', reply: `في خريطة ${y} يبلغ طول الطرق نحو ${fmt(s.roadKm, 1)} كيلومتر.` }
      if (t.cats?.[0] === 'faculty') {
        const n = ctx.profiles.filter((p) => p.name.startsWith('كلية')).length
        return { kind: 'say', reply: `يضم مسار بيانات ${n} كلية، أغلبها على محور الكليات في قلب الحرم.` }
      }
      const v = (t.cats ?? []).reduce((acc, c) => acc + (s.byCat[c] ?? 0), 0)
      return { kind: 'say', reply: `في خريطة ${y} يوجد ${fmt(v)} ${t.label}.` }
    }
    if (s) return { kind: 'say', reply: `خريطة ${y} تضم ${fmt(s.features)} عنصرًا مكانيًا، منها ${fmt(s.byCat.pole ?? 0)} عمود إنارة و${fmt(s.roadKm, 1)} كيلومتر من الطرق.` }
  }

  // rooms first (more specific): "معمل 309", "شئون الطلاب"
  let best: { score: number; intent: Intent } | null = null
  const consider = (score: number, intent: Intent) => { if (!best || score > best.score) best = { score, intent } }
  for (const p of ctx.profiles) {
    const pn = norm(p.name)
    const short = pn.replace(/^كليه/, '')
    const noAl = pn.replace(/^ال/, '')
    if (n.includes(pn) || (short.length > 3 && n.includes(short)) || (noAl !== pn && noAl.length > 5 && n.includes(noAl))) {
      const rooms = p.floors.reduce((s, f) => s + f.rooms.length, 0)
      consider(pn.length + 5, { kind: 'goto', profile: p.key, reply: `هذه ${p.name}.${p.floors.length ? ` تضم ${floorsAr(p.floors.length)} و${rooms} مساحة.` : ''}${p.size ? ` أبعادها ${p.size.length} في ${p.size.width}، وارتفاعها ${p.size.height}.` : ''}` })
    }
    p.floors.forEach((f) => f.rooms.forEach((r) => {
      const rn = norm(r)
      if (rn.length >= 4 && n.includes(rn)) {
        const others = ctx.profiles.filter((o) => o !== p && o.floors.some((fl) => fl.rooms.some((x) => norm(x) === rn))).length
        const more = others === 1 ? ' ويوجد أيضًا في مبنى آخر.' : others === 2 ? ' ويوجد أيضًا في مبنيين آخرين.' : others > 2 ? ` ويوجد أيضًا في ${others} مبانٍ أخرى.` : ''
        consider(rn.length + (/\d/.test(rn) ? 8 : 0), { kind: 'goto', profile: p.key, room: r, reply: `${r} موجود في ${p.name}، ${f.floor}.${more}` })
      }
    }))
  }
  // "the engineering cafeteria", "the second mosque": category word + a distinguishing word
  const CAT_WORDS: [RegExp, Cat[]][] = [[/كافيتير|كافتير|مطعم/, ['cafe']], [/مسجد|جامع/, ['mosque']], [/بريد|شهر\s*عقاري|توثيق/, ['service']],
    [/كشك|فوري|اتصالات/, ['kiosk']], [/جراج|موقف|ركن/, ['parking']], [/كرفان/, ['caravan']], [/ملعب|ملاعب|صاله/, ['sports']]]
  const cw = CAT_WORDS.find(([re]) => re.test(n))
  if (cw) {
    const pool = (ctx.data[ctx.year] ?? ctx.data[2026])?.features.filter((f) => cw[1].includes(f.properties.c) && f.properties.n) ?? []
    const scored = pool.map((f) => {
      const parts = (f.properties.n ?? '').split(/\s+/).map(norm).filter((w) => w.length > 2 && !cw[0].test(w))
      return { f, sc: parts.filter((w) => n.includes(w.replace(/^ال/, ''))).length }
    }).sort((a, b) => b.sc - a.sc)
    if (cw[1][0] === 'mosque') {
      const hall = pool.find((f) => /^المصل[يى]$/.test(norm(f.properties.n))) ?? pool[0]
      if (hall) consider(14, { kind: 'goto', place: hall.properties.n, reply: 'هذا أحد مسجدَي الحرم، مرسوم بقاعة الصلاة والقبة والمئذنة وغرفة الوضوء.' })
    } else if (scored[0]) consider(scored[0].sc ? 40 : 12, { kind: 'goto', place: scored[0].f.properties.n, reply: `هذا ${scored[0].f.properties.n}.${pool.length > 1 && !scored[0].sc ? ` يوجد ${pool.length} في الحرم؛ هذا أحدها.` : ''}` })
  }
  for (const [k, key] of Object.entries(SHORT)) {
    if (n.includes(norm(k))) consider(norm(k).length, { kind: 'goto', profile: key, reply: `هذه ${key}.` })
  }
  // places on the map (cafeterias, kiosks, post office…)
  const seen = new Set<string>()
  for (const y of [ctx.year, 2026] as Year[]) {
    ctx.data[y]?.features.forEach((f) => {
      const nm = f.properties.n
      if (!nm || seen.has(nm)) return
      seen.add(nm)
      const k = norm(nm)
      if (k.length >= 4 && n.includes(k)) consider(k.length, { kind: 'goto', place: nm, reply: `هذا ${nm}، ضمن ${CAT_META[f.properties.c].label}.` })
    })
  }
  if (best) return (best as { intent: Intent }).intent

  // years
  const y = YEAR_WORDS.find(([re]) => re.test(n) || re.test(text))?.[1]
  if (y && YEARS.includes(y)) return { kind: 'year', year: y, reply: `الحرم في ${y}: ${YEAR_STORY[y].title}. ${YEAR_STORY[y].line}` }

  return { kind: 'say', reply: 'لم أفهم تمامًا. جرّب: خذني إلى كلية الهندسة، أو أين معمل 309، أو اعرض 2011.' }
}
