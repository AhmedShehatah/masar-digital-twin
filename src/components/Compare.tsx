import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { CampusEngine } from '../map/engine'
import type { BasemapId } from '../map/basemaps'
import { YEARS, YEAR_STORY, fmt, loadYear, type Cat, type Stats, type Year } from '../data'

const noop = () => {}

/**
 * Before / after view: a second map showing `left` is laid over the main map and
 * clipped to the left of a draggable divider. The overlay copies the main map's
 * camera on every frame, so pan / zoom / tilt on the main map moves both.
 */
export function CompareView({ main, left, right, night, hidden, basemap }: {
  main: CampusEngine; left: Year; right: Year; night: boolean; hidden: Cat[]; basemap: BasemapId
}) {
  const el = useRef<HTMLDivElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const eng = useRef<CampusEngine | null>(null)
  const [w, setW] = useState(window.innerWidth)
  const [x, setX] = useState(window.innerWidth) // slides in from the edge
  const [dragging, setDragging] = useState(false)
  const nightRef = useRef(night); nightRef.current = night
  const hiddenRef = useRef(hidden); hiddenRef.current = hidden

  // create the overlay map once and keep it locked to the main camera
  useEffect(() => {
    const e = new CampusEngine(el.current!, { onSelect: noop, onHover: noop, onMove: noop }, { attribution: false, basemap })
    eng.current = e
    e.setInteractive(false)
    const sync = () => {
      const m = main.map
      e.map.jumpTo({ center: m.getCenter(), zoom: m.getZoom(), bearing: m.getBearing(), pitch: m.getPitch() })
    }
    sync()
    main.map.on('move', sync)
    e.ready().then(() => { e.setNight(nightRef.current); e.setHidden(hiddenRef.current) })
    const t = window.setTimeout(() => setX(window.innerWidth / 2), 250)
    const onResize = () => { setW(window.innerWidth); setX((v) => Math.min(v, window.innerWidth - 24)) }
    window.addEventListener('resize', onResize)
    return () => { clearTimeout(t); window.removeEventListener('resize', onResize); main.map.off('move', sync); e.destroy(); eng.current = null }
  }, [main])

  useEffect(() => {
    const e = eng.current
    if (!e) return
    let alive = true
    Promise.all([e.ready(), loadYear(left)]).then(([, fc]) => { if (alive) e.showYear(fc, true) })
    return () => { alive = false }
  }, [left])
  useEffect(() => { eng.current?.ready().then(() => eng.current?.setNight(night)) }, [night])
  useEffect(() => { eng.current?.setHidden(hidden) }, [hidden])
  useEffect(() => { eng.current?.setBasemap(basemap) }, [basemap])

  const onDown = (ev: React.PointerEvent) => {
    ;(ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId)
    setDragging(true)
  }
  const onMove = (ev: React.PointerEvent) => {
    if (!dragging) return
    setX(Math.max(24, Math.min(w - 24, ev.clientX)))
  }
  const onUp = () => setDragging(false)

  // keyboard nudging when the handle has focus
  const onKey = (ev: React.KeyboardEvent) => {
    if (ev.key === 'ArrowLeft') setX((v) => Math.max(24, v - 40))
    if (ev.key === 'ArrowRight') setX((v) => Math.min(w - 24, v + 40))
  }

  return (
    <div className={`compare ${dragging ? 'dragging' : ''}`} ref={wrap}>
      <div className="compare-map" ref={el} style={{ clipPath: `inset(0 ${Math.max(0, w - x)}px 0 0)` }} />
      <div className="divider" style={{ left: x }}>
        <div className="line" />
        <button className="handle" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onKeyDown={onKey}
          aria-label="اسحب للمقارنة" title="اسحب للمقارنة">
          <ChevronLeft size={16} /><ChevronRight size={16} />
        </button>
      </div>
      <div className="ytag left" style={{ right: w - x + 16, opacity: x > 140 ? 1 : 0 }}>
        <span className="y num">{left}</span><span className="t">{YEAR_STORY[left].title}</span>
      </div>
      <div className="ytag right" style={{ left: x + 16, opacity: w - x > 140 ? 1 : 0 }}>
        <span className="y num">{right}</span><span className="t">{YEAR_STORY[right].title}</span>
      </div>
    </div>
  )
}

export function CompareBar({ left, right, stats, onLeft, onRight, onExit }: {
  left: Year; right: Year; stats: Stats | null; onLeft: (y: Year) => void; onRight: (y: Year) => void; onExit: () => void
}) {
  const a = stats?.years[String(left)], b = stats?.years[String(right)]
  const diff = (va: number, vb: number, unit = '', d = 0) => {
    const v = vb - va
    return <b className={`num ${v > 0 ? 'up' : v < 0 ? 'down' : ''}`}>{v > 0 ? '+' : v < 0 ? '−' : ''}{fmt(Math.abs(v), d)}{unit}</b>
  }
  return (
    <motion.section className="comparebar glass" style={{ x: '-50%' }} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 28 }}>
      <div className="cb-row">
        <div className="cb-pick">
          <span className="cb-l">قبل</span>
          <div className="seg">{YEARS.map((y) => (
            <button key={y} className={y === left ? 'on' : ''} disabled={y >= right} onClick={() => onLeft(y)}>{y}</button>
          ))}</div>
        </div>
        <div className="cb-pick">
          <span className="cb-l">بعد</span>
          <div className="seg">{YEARS.map((y) => (
            <button key={y} className={y === right ? 'on' : ''} disabled={y <= left} onClick={() => onRight(y)}>{y}</button>
          ))}</div>
        </div>
        <button className="cb-exit" onClick={onExit} title="إنهاء المقارنة"><X size={16} /><span>إنهاء</span></button>
      </div>
      <AnimatePresence mode="wait">
        {a && b && (
          <motion.div key={`${left}-${right}`} className="cb-diff" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <span>من <b className="num">{left}</b> إلى <b className="num">{right}</b>:</span>
            <span>{diff(a.byCat.pole ?? 0, b.byCat.pole ?? 0)} عمود إنارة</span>
            <span>{diff(a.roadKm, b.roadKm, ' كم', 1)} طرق</span>
            <span>{diff(a.builtM2 / 1000, b.builtM2 / 1000, ' ألف م²', 1)} مسطح مبانٍ</span>
            <span>{diff(a.features, b.features)} عنصر</span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  )
}
