import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronLeft, ChevronRight, LayoutGrid, Pause, Play, Volume2, VolumeX, X } from 'lucide-react'
import { CHAPTERS, SHOTS, VEG_INDICES, VEG_YEARS, src, thumb, type MapShot } from '../gallery/maps'
import { ambient } from '../voice/ambient'

const SLIDE_MS = { campus: 7500, veg: 3800 }
const CARD_MS = 2800
const two = (n: number) => String(n).padStart(2, '0')
const reelLength = (reel: string) => SHOTS.filter((s) => s.reel === reel).length

export function Gallery({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [card, setCard] = useState<MapShot['chapter'] | null>('campus')
  const [grid, setGrid] = useState(false)
  const [muted, setMuted] = useState(ambient.muted)
  const shot = SHOTS[i]
  const chapter = CHAPTERS.find((c) => c.id === shot.chapter)!
  const prevReel = useRef(shot.reel)
  const sameReel = prevReel.current === shot.reel
  useEffect(() => { prevReel.current = shot.reel }, [shot.reel])

  // ---------- navigation ----------
  const go = useCallback((n: number) => {
    const to = (n + SHOTS.length) % SHOTS.length
    if (to === i) return
    if (SHOTS[to].chapter !== SHOTS[i].chapter) setCard(SHOTS[to].chapter)
    if (SHOTS[to].reel !== SHOTS[i].reel) ambient.whoosh(1400)
    setI(to)
  }, [i])
  const next = useCallback(() => go(i + 1), [go, i])
  const prev = useCallback(() => go(i - 1), [go, i])

  // chapter title card
  useEffect(() => {
    if (!card) return
    ambient.hit()
    const t = window.setTimeout(() => setCard(null), CARD_MS)
    return () => clearTimeout(t)
  }, [card])

  // score
  useEffect(() => {
    ambient.start()
    return () => ambient.stop()
  }, [])

  // preload the next shots
  useEffect(() => {
    for (const k of [1, 2]) new Image().src = src(SHOTS[(i + k) % SHOTS.length])
  }, [i])

  // keyboard (capture phase so the map app underneath never sees these keys)
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      e.stopPropagation()
      const k = e.key
      if (k === 'Escape') { if (grid) setGrid(false); else onClose() }
      else if (k === 'ArrowLeft') next() // RTL: left moves forward
      else if (k === 'ArrowRight') prev()
      else if (k === ' ') { e.preventDefault(); setPlaying((p) => !p) }
      else if (k.toLowerCase() === 'g') setGrid((g) => !g)
    }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [grid, next, prev, onClose])

  // swipe
  const down = useRef<number | null>(null)
  const onPointerDown = (e: PointerEvent) => { down.current = e.clientX }
  const onPointerUp = (e: PointerEvent) => {
    if (down.current == null) return
    const dx = e.clientX - down.current
    down.current = null
    if (Math.abs(dx) > 50) (dx > 0 ? next : prev)()
  }

  const running = playing && !card && !grid
  const reelShots = SHOTS.filter((s) => s.reel === shot.reel)
  const kbStyle = {
    '--fx': `${shot.focus[0]}%`, '--fy': `${shot.focus[1]}%`,
    '--kb-to': shot.chapter === 'veg' ? 1.22 : 1.09,
    animationDuration: `${reelLength(shot.reel) * SLIDE_MS[shot.chapter] + 1500}ms`,
    animationPlayState: running ? 'running' : 'paused',
  } as CSSProperties

  return (
    <motion.div className="gallery" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}
      onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
      {/* ambient light: the current map, blurred huge behind everything */}
      <AnimatePresence>
        <motion.div key={shot.reel} className="g-ambient" style={{ backgroundImage: `url(${src(shot)})` }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1.6 }} />
      </AnimatePresence>

      {/* ---------- stage ---------- */}
      <div className="g-stage">
        <AnimatePresence>
          <motion.div key={shot.reel} className="g-frame" style={{ '--ar': `${shot.w} / ${shot.h}` } as CSSProperties}
            initial={{ opacity: 0, scale: 0.94, filter: 'blur(14px) brightness(1.8)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px) brightness(1)' }}
            exit={{ opacity: 0, scale: 1.04, filter: 'blur(10px) brightness(0.4)' }}
            transition={{ duration: 1.1, ease: [0.2, 0.7, 0.2, 1] }}>
            <div className="g-kb" style={kbStyle}>
              <AnimatePresence>
                <motion.img key={shot.id} src={src(shot)} alt={shot.title} draggable={false}
                  initial={{ opacity: sameReel ? 0 : 1 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  transition={{ duration: sameReel ? 1.3 : 0 }} />
              </AnimatePresence>
            </div>
            <span className="g-sweep" />
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="g-grain" />
      <div className="g-vignette" />

      {/* ---------- letterbox: top ---------- */}
      <div className="g-bar top">
        <div className="g-brand"><img src="/logo.png" alt="" /><span>أطلس مسار</span></div>
        <div className="g-count num"><b>{two(i + 1)}</b> / {two(SHOTS.length)}</div>
        <button className="g-ic" onClick={onClose} title="إغلاق (Esc)"><X size={18} /></button>
      </div>

      {/* ---------- letterbox: bottom ---------- */}
      <div className="g-bar bottom">
        <AnimatePresence mode="wait">
          <motion.div key={shot.id} className="g-cap"
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.5 }}>
            <div className="g-kicker">{chapter.kicker} · {chapter.title}</div>
            <h2>
              {shot.title}
              {shot.year && <span className="g-year num"> {shot.year}</span>}
            </h2>
            <p>{shot.desc}</p>
          </motion.div>
        </AnimatePresence>

        <div className="g-side">
          {shot.index && (
            <div className="g-veg">
              <div className="g-tabs">
                {VEG_INDICES.map((ix) => (
                  <button key={ix} className={ix === shot.index ? 'on' : ''}
                    onClick={() => go(SHOTS.findIndex((s) => s.index === ix && s.year === shot.year))}>{ix}</button>
                ))}
              </div>
              <div className="g-years">
                <div className="g-years-fill" style={{ width: `${(VEG_YEARS.indexOf(shot.year as never) / (VEG_YEARS.length - 1)) * 100}%` }} />
                {VEG_YEARS.map((y) => (
                  <button key={y} className={`num ${y === shot.year ? 'cur' : ''} ${y < shot.year! ? 'past' : ''}`}
                    onClick={() => go(SHOTS.findIndex((s) => s.index === shot.index && s.year === y))}>
                    <i />{y}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="g-ctrls">
            <button className="g-ic" onClick={prev} title="السابق (→)"><ChevronRight size={18} /></button>
            <button className="g-ic play" onClick={() => setPlaying((p) => !p)} title="تشغيل / إيقاف (مسافة)">
              {playing ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button className="g-ic" onClick={next} title="التالي (←)"><ChevronLeft size={18} /></button>
            <span className="g-sep" />
            <button className={`g-ic ${grid ? 'on' : ''}`} onClick={() => setGrid((g) => !g)} title="كل الخرائط (G)"><LayoutGrid size={17} /></button>
            <button className="g-ic" onClick={() => { const m = !muted; setMuted(m); ambient.setMuted(m) }} title="الموسيقى">
              {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
            </button>
          </div>
        </div>

        {/* one segment per shot; the current one fills up and advances the show */}
        <div className="g-progress">
          {SHOTS.map((s, k) => (
            <i key={s.id} className={`${k < i ? 'done' : ''} ${s.chapter !== SHOTS[k - 1]?.chapter && k ? 'gap' : ''}`} onClick={() => go(k)}>
              {k === i && (
                <b key={i} style={{ animationDuration: `${SLIDE_MS[s.chapter]}ms`, animationPlayState: running ? 'running' : 'paused' }}
                  onAnimationEnd={next} />
              )}
            </i>
          ))}
        </div>
      </div>

      {/* reel strip for the vegetation time-lapse */}
      {reelShots.length > 1 && !card && (
        <div className="g-reel">
          {reelShots.map((s) => (
            <button key={s.id} className={s.id === shot.id ? 'on' : ''} onClick={() => go(SHOTS.indexOf(s))}>
              <img src={thumb(s)} alt="" /><span className="num">{s.year}</span>
            </button>
          ))}
        </div>
      )}

      {/* ---------- chapter title card ---------- */}
      <AnimatePresence>
        {card && (() => {
          const c = CHAPTERS.find((x) => x.id === card)!
          return (
            <motion.div key={card} className="g-card" onClick={() => setCard(null)}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.7 }}>
              {card === 'campus' && <motion.div className="g-card-pre" initial={{ opacity: 0, letterSpacing: '0.9em' }} animate={{ opacity: 1, letterSpacing: '0.5em' }} transition={{ duration: 1.8 }}>MASAR · ATLAS</motion.div>}
              <motion.div className="g-card-k" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.8 }}>{c.kicker}</motion.div>
              <motion.h1 initial={{ opacity: 0, y: 24, filter: 'blur(12px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ delay: 0.35, duration: 1.1, ease: [0.2, 0.7, 0.2, 1] }}>{c.title}</motion.h1>
              <motion.span className="g-card-rule" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.8, duration: 1 }} />
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1, duration: 0.8 }}>{c.sub}</motion.p>
            </motion.div>
          )
        })()}
      </AnimatePresence>

      {/* ---------- index of all maps ---------- */}
      <AnimatePresence>
        {grid && (
          <motion.div className="g-grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}
            onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
            <div className="g-grid-in">
              {CHAPTERS.map((c) => (
                <section key={c.id}>
                  <h3><small>{c.kicker}</small>{c.title}</h3>
                  <div className="g-tiles">
                    {SHOTS.filter((s) => s.chapter === c.id).map((s, k) => (
                      <motion.button key={s.id} className={`g-tile ${s.id === shot.id ? 'on' : ''}`}
                        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 * k, duration: 0.4 }}
                        onClick={() => { go(SHOTS.indexOf(s)); setGrid(false) }}>
                        <span className="ph"><img src={thumb(s)} alt="" loading="lazy" /></span>
                        <span className="tt">{s.index ? `${s.index} · ${s.year}` : s.title}</span>
                      </motion.button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
