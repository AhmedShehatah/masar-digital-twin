import { Play, Pause, Columns2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { YEARS, YEAR_STORY, fmt, type Stats, type Year } from '../data'

export function TimeMachine({ className, year, stats, playing, onPlay, onYear, onCompare }: {
  className: string; year: Year; stats: Stats | null; playing: boolean; onPlay: () => void; onYear: (y: Year) => void; onCompare: () => void
}) {
  const idx = YEARS.indexOf(year)
  const pos = (i: number) => `calc(10px + (100% - 20px) * ${i / (YEARS.length - 1)})`
  const s = stats?.years[String(year)]
  return (
    <section className={`timeline glass ${className}`}>
      <div className="story">
        <AnimatePresence mode="wait">
          <motion.div key={year} style={{ display: 'flex', alignItems: 'baseline', gap: 12, minWidth: 0 }}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.35 }}>
            <span className="yy">{year}</span>
            <span className="tt">{YEAR_STORY[year].title}</span>
            <span className="ll">{YEAR_STORY[year].line}</span>
          </motion.div>
        </AnimatePresence>
        {s && (
          <div className="mini-stats">
            <span><b>{fmt(s.byCat.pole ?? 0)}</b>عمود</span>
            <span><b>{fmt(s.roadKm, 1)}</b>كم طرق</span>
            <span><b>{fmt(s.features)}</b>عنصر</span>
          </div>
        )}
      </div>
      <div className="row">
        <button className="play" onClick={onPlay} title={playing ? 'إيقاف' : 'شاهد الحرم ينمو'}>
          {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" style={{ marginLeft: 2 }} />}
        </button>
        <button className="cmp-btn" onClick={onCompare} title="قارن بين سنتين">
          <Columns2 size={17} /><span>قارن</span>
        </button>
        <div className="track">
          <div className="rail" />
          <div className="fill" style={{ width: `calc((100% - 20px) * ${idx / (YEARS.length - 1)})` }} />
          {YEARS.map((y, i) => (
            <button key={y} className={`yr ${i < idx ? 'past' : ''} ${i === idx ? 'cur' : ''}`} style={{ left: pos(i) }} onClick={() => onYear(y)}>
              <span className="knob" />
              <span className="y">{y}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
