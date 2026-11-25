import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Pause, Play, SkipForward, Volume2, VolumeX, X } from 'lucide-react'
import type { CampusEngine } from '../map/engine'
import { narrator, readMs } from '../voice/narrator'
import { ambient } from '../voice/ambient'
import { CAMPUS_CENTER, YEARS, centroid, fmt, type Campus, type CampusFeature, type Profile, type Stats, type Year } from '../data'

export interface FilmCtx {
  engine: CampusEngine
  fc: Campus
  profiles: Map<string, Profile>
  stats: Stats
  switchYear: (y: Year) => Promise<void>
  setNight: (n: boolean) => void
}

interface Shot { center: [number, number]; zoom: number; pitch: number; bearing: number; drift?: number; dz?: number }
interface Card { title: string; items: string[] }
interface Chapter {
  title: string
  say: string
  shot: Shot
  card?: Card
  night?: boolean
  /** runs while the subtitles play; gets their expected duration */
  action?: (ms: number, alive: () => boolean) => Promise<void> | void
}

const avg = (fs: CampusFeature[]): [number, number] | null => {
  if (!fs.length) return null
  const cs = fs.map((f) => centroid(f.geometry))
  return [cs.reduce((s, c) => s + c[0], 0) / cs.length, cs.reduce((s, c) => s + c[1], 0) / cs.length]
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function buildScript(ctx: FilmCtx): Chapter[] {
  const { fc, profiles, stats, engine, switchYear } = ctx
  const by = (t: (f: CampusFeature) => boolean) => fc.features.filter(t)
  const s26 = stats.years['2026'], s11 = stats.years['2011']
  const poles26 = s26.byCat.pole ?? 0, poles11 = s11?.byCat.pole ?? 0
  const farm = by((f) => f.properties.c === 'farm')
  const dentP = profiles.get('كلية طب الأسنان')
  const dentRooms = dentP?.floors.reduce((s, x) => s + x.rooms.length, 0) ?? 0
  const pick = (arr: string[], n: number) => arr.filter((r, i, a) => a.indexOf(r) === i && r.length < 22).slice(0, n)
  const dentSample = pick((dentP?.floors ?? []).flatMap((f) => f.rooms.filter((r) => /عياد|اشع|أشع|معمل|مدرج|مكتب/.test(r))), 7)

  const ch: (Chapter | null)[] = []
  ch.push({
    title: 'مسار',
    say: 'مرحبًا بكم في مسار، التوأم الرقمي لحرم جامعة سوهاج الجديدة في الكوامل. ما تشاهدونه ليس صورة، بل نسخة رقمية حيّة من الحرم، مبنًى بمبنى، وعمودًا بعمود.',
    shot: { center: CAMPUS_CENTER, zoom: 14.7, pitch: 38, bearing: 10, drift: -30, dz: 0.5 },
  })
  ch.push({
    title: 'من الأرشيف إلى الخريطة',
    say: 'بدأت الحكاية بخمسة ملفات رفع مساحي بصيغة أوتوكاد، لخمس محطات زمنية من 2006 إلى 2026. حوّلناها إلى خرائط جغرافية دقيقة، واستخرجنا منها أسماء المباني وارتفاعاتها وتصنيفاتها.',
    shot: { center: CAMPUS_CENTER, zoom: 15.2, pitch: 52, bearing: -20, drift: 18, dz: 0.2 },
    card: { title: 'ملفات المصدر', items: YEARS.map((y) => `${y}.dwg`) },
    action: async (ms, alive) => {
      const step = Math.max(1600, (ms - 1500) / YEARS.length)
      for (const y of YEARS) {
        if (!alive()) return
        await Promise.all([switchYear(y), sleep(step)])
      }
    },
  })
  ch.push({
    title: 'عشرون عامًا من النمو',
    say: `في 2006 لم يكن هنا سوى حدود مرسومة على الرمال. وفي 2011 ارتفعت أولى الكليات، ومعها ${poles11} عمود إنارة. واليوم يضم الحرم ${poles26} عمودًا، وأكثر من ${Math.floor(s26.roadKm)} كيلومترًا من الطرق.`,
    shot: { center: CAMPUS_CENTER, zoom: 15.6, pitch: 66, bearing: -45, drift: 40, dz: 0.3 },
    card: { title: 'بالأرقام', items: [`${fmt(poles26)} عمود إنارة`, `${fmt(s26.roadKm, 1)} كم طرق`, `${fmt(s26.features)} عنصر مكاني`, '5 محطات زمنية'] },
    night: true,
    action: async () => {
      engine.map.setGlobalStateProperty('lights', 0)
      await sleep(1800)
      await engine.tween('lights', 1, 4200)
    },
  })
  const fac = avg(by((f) => ['كلية الهندسة', 'كلية الآداب', 'كلية التجارة', 'كلية التربية'].includes(f.properties.p ?? '')))
  if (fac) ch.push({
    title: 'محور الكليات',
    say: 'في قلب الحرم تصطف أربع كليات توأم: الهندسة والآداب والتجارة والتربية. كل مبنى منها بطول 71 مترًا وعرض 116 مترًا، ويرتفع 30 مترًا، تمامًا كما في القياسات الأصلية.',
    shot: { center: fac, zoom: 16.9, pitch: 66, bearing: 25, drift: 35, dz: 0.25 },
    card: { title: 'القياسات الأصلية', items: ['الطول 71 م', 'العرض 116 م', 'الارتفاع 30 م'] },
  })
  const dent = by((f) => f.properties.p === 'كلية طب الأسنان')
  const dc = avg(dent)
  if (dc) ch.push({
    title: 'داخل المباني',
    say: `ولم نتوقف عند الشكل الخارجي. لكل مبنى أدواره ومحتوياته. كلية طب الأسنان مثلًا تضم ${dentP?.floors.length ?? 6} أدوار و${dentRooms} مساحة، من العيادات التشخيصية إلى معامل الأشعة، ويمكنك البحث عن أي غرفة باسمها.`,
    shot: { center: dc, zoom: 17.9, pitch: 68, bearing: -40, drift: 50, dz: 0.2 },
    card: { title: `كلية طب الأسنان · ${dentRooms} مساحة`, items: dentSample },
    action: () => { engine.select(dent[0].properties.id) },
  })
  // aim at one mosque: the parts clustered around the first prayer hall
  const mosAll = by((f) => f.properties.c === 'mosque')
  const hall = mosAll.find((f) => /المصل/.test(f.properties.n ?? '')) ?? mosAll[0]
  const hc = hall ? centroid(hall.geometry) : null
  const mos = hc ? avg(mosAll.filter((f) => { const c = centroid(f.geometry); return Math.hypot((c[0] - hc[0]) * 99700, (c[1] - hc[1]) * 110540) < 60 })) : null
  if (mos) ch.push({
    title: 'المساجد',
    say: 'المسجدان مرسومان بتفاصيلهما المعمارية: قاعة الصلاة، والقبة، والمئذنة، وغرفة الوضوء، كلٌّ بارتفاعه.',
    shot: { center: mos, zoom: 18.6, pitch: 58, bearing: 30, drift: 70, dz: 0.1 },
    action: () => engine.select(null),
  })
  const hou = avg(by((f) => f.properties.c === 'housing'))
  if (hou) ch.push({
    title: 'المدينة الجامعية',
    say: 'وعلى أطراف الحرم تقف المدينة الجامعية، عمارات لسكن الطالبات وأعضاء هيئة التدريس، بارتفاعات تصل إلى 25 مترًا.',
    shot: { center: hou, zoom: 16.6, pitch: 62, bearing: -70, drift: -35, dz: 0.3 },
  })
  const fm = avg(farm)
  if (fm) ch.push({
    title: 'مزرعة كلية الزراعة',
    say: `وفي الشمال تمتد مزرعة كلية الزراعة، ${farm.length} قطعة تحوّل الصحراء إلى حقل للتجارب.`,
    shot: { center: fm, zoom: 15.5, pitch: 55, bearing: 10, drift: -25, dz: 0.3 },
  })
  ch.push({
    title: 'الحرم ليلًا',
    say: `وحين يحلّ الليل، تضيء الحرم شبكة من ${poles26} عمود إنارة، كل عمود منها في موقعه الحقيقي.`,
    shot: { center: CAMPUS_CENTER, zoom: 15.9, pitch: 70, bearing: -30, drift: 70, dz: 0.2 },
    night: true,
    action: async () => {
      engine.map.setGlobalStateProperty('lights', 0)
      await sleep(900)
      await engine.tween('lights', 1, 5200)
    },
  })
  ch.push({
    title: 'الحرم بين يديك',
    say: 'هذا هو مسار. الحرم الآن بين يديك: ابحث عن أي قاعة، وتنقّل عبر عشرين عامًا من الزمن، أو اسأل المساعد الصوتي. أهلًا بك.',
    shot: { center: CAMPUS_CENTER, zoom: 15.1, pitch: 50, bearing: -25, drift: -20, dz: -0.3 },
  })
  return ch.filter(Boolean) as Chapter[]
}

export function Film({ ctx, onEnd }: { ctx: FilmCtx; onEnd: () => void }) {
  const script = useMemo(() => buildScript(ctx), [ctx])
  const [idx, setIdx] = useState(0)
  const [word, setWord] = useState(-1)
  const [titleOn, setTitleOn] = useState(true)
  const [paused, setPaused] = useState(false)
  const [muted, setMuted] = useState(ambient.muted)
  const [ending, setEnding] = useState(false)
  const pausedRef = useRef(false)
  const skipRef = useRef<() => void>(() => {})
  const onEndRef = useRef(onEnd)
  onEndRef.current = onEnd

  useEffect(() => {
    let alive = true
    const { engine } = ctx
    const map = engine.map
    engine.stopOrbit()
    engine.setInteractive(false)
    ambient.start()
    const waitWhilePaused = async () => { while (alive && pausedRef.current) await sleep(150) }

    const run = async () => {
      await sleep(400)
      for (let i = 0; i < script.length && alive; i++) {
        const c = script[i]
        setIdx(i); setWord(-1); setTitleOn(true)
        ambient.whoosh(2400)
        if (c.night !== undefined) ctx.setNight(c.night)
        await new Promise<void>((res) => {
          map.flyTo({ center: c.shot.center, zoom: c.shot.zoom, pitch: c.shot.pitch, bearing: c.shot.bearing, duration: 3400, curve: 1.25, essential: true })
          map.once('moveend', () => res())
        })
        if (!alive) break
        ambient.hit()
        await sleep(700)
        setTitleOn(false)
        await waitWhilePaused()
        const ms = readMs(c.say)
        // slow cinematic drift for the length of the narration
        map.easeTo({ bearing: c.shot.bearing + (c.shot.drift ?? 20), zoom: c.shot.zoom + (c.shot.dz ?? 0.2), duration: ms + 2500, easing: (t) => t, essential: true })
        // "next" ends both the subtitles and any running animation of this chapter
        let skipped = false
        const skip = new Promise<void>((r) => { skipRef.current = () => { skipped = true; r() } })
        const act = c.action?.(ms, () => alive && !skipped)
        await narrator.caption(c.say, (w) => alive && setWord(w))
        await Promise.race([Promise.resolve(act), skip])
        await waitWhilePaused()
        await sleep(900)
      }
      if (!alive) return
      setEnding(true)
      await sleep(3600)
      if (alive) onEndRef.current()
    }
    run()
    return () => {
      alive = false
      narrator.cancel()
      ambient.stop()
      map.stop()
      engine.select(null)
      engine.setInteractive(true)
      map.setGlobalStateProperty('lights', 1)
    }
  }, [ctx, script])

  const togglePause = () => {
    const p = !paused
    setPaused(p); pausedRef.current = p
    if (p) { narrator.pause(); ctx.engine.map.stop() } else narrator.resume()
  }
  const next = () => { skipRef.current(); narrator.cancel() }
  const toggleMute = () => {
    const m = !muted
    setMuted(m); ambient.setMuted(m)
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === ' ') { e.preventDefault(); togglePause() }
      if (e.key === 'ArrowLeft') next()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })

  const c = script[idx]
  const words = c.say.split(/\s+/)
  // subtitles show the current sentence only
  const sentences: [number, number][] = []
  let start = 0
  words.forEach((w, i) => { if (/[.!؟?]$/.test(w) || i === words.length - 1) { sentences.push([start, i]); start = i + 1 } })
  const cur = sentences.find(([a, b]) => word >= a && word <= b) ?? sentences[0]
  const cardItems = c.card?.items ?? []

  return (
    <div className="film">
      <motion.div className="bar top" initial={{ y: '-100%' }} animate={{ y: 0 }} transition={{ duration: 1.1, ease: [0.2, 0.8, 0.2, 1] }} />
      <motion.div className="bar bottom" initial={{ y: '100%' }} animate={{ y: 0 }} transition={{ duration: 1.1, ease: [0.2, 0.8, 0.2, 1] }} />
      <div className="grain" />

      <AnimatePresence>
        {titleOn && !ending && (
          <motion.div key={`t${idx}`} className="chapter" style={{ x: '-50%' }}
            initial={{ opacity: 0, y: 24, filter: 'blur(12px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -16, filter: 'blur(10px)' }} transition={{ duration: 0.9, ease: 'easeOut' }}>
            <h2>{c.title}</h2>
            <motion.i className="rule" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.3, duration: 1.2 }} />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!titleOn && !ending && c.card && (
          <motion.aside key={`c${idx}`} className="film-card glass" initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.6 }}>
            <div className="fc-t">{c.card.title}</div>
            {cardItems.map((it, i) => (
              <motion.div key={it} className="fc-i" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 + i * 0.22 }}>{it}</motion.div>
            ))}
          </motion.aside>
        )}
      </AnimatePresence>

      <div className="subs">
        <AnimatePresence mode="wait">
          {!titleOn && !ending && word >= 0 && (
            <motion.p key={`${idx}-${cur[0]}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
              {words.slice(cur[0], cur[1] + 1).map((w, i) => (
                <span key={i} className={cur[0] + i <= word ? 'on' : ''}>{w} </span>
              ))}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {ending && (
          <motion.div className="endcard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1.2 }}>
            <img src="/logo.png" alt="" />
            <div className="brand-xl">MASAR</div>
            <div className="tag">التوأم الرقمي لجامعة سوهاج الجديدة</div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="film-ctrls">
        <div className="dots">{script.map((_, i) => <i key={i} className={i < idx ? 'done' : i === idx ? 'on' : ''} />)}</div>
        <button onClick={togglePause} title="إيقاف مؤقت (مسافة)">{paused ? <Play size={16} /> : <Pause size={16} />}</button>
        <button onClick={next} title="المشهد التالي">{<SkipForward size={16} style={{ transform: 'scaleX(-1)' }} />}</button>
        <button onClick={toggleMute} title="الموسيقى">{muted ? <VolumeX size={16} /> : <Volume2 size={16} />}</button>
        <button onClick={() => onEndRef.current()} title="إنهاء"><X size={16} /></button>
      </div>
    </div>
  )
}
