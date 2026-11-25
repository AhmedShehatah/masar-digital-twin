import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { useCam } from '../useCam'
import type { CampusEngine } from '../map/engine'
import { fmt, type Stats } from '../data'

const altitudeKm = (zoom: number, lat: number) => (40075.016 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom + 1) * 1.6

export function Intro({ engine, onSkip }: { engine: CampusEngine | null; onSkip: () => void }) {
  const cam = useCam(engine)
  const alt = altitudeKm(cam.zoom, cam.lat)
  return (
    <div className="intro">
      <motion.div initial={{ opacity: 0, y: 14, filter: 'blur(10px)' }} animate={{ opacity: [0, 1, 1, 0], y: [14, 0, 0, -10], filter: ['blur(10px)', 'blur(0px)', 'blur(0px)', 'blur(8px)'] }}
        transition={{ duration: 7.6, times: [0, 0.18, 0.75, 1], ease: 'easeOut' }}>
        <div className="brand-xl">MASAR</div>
        <div className="tag">التوأم الرقمي لجامعة سوهاج الجديدة</div>
        <div className="sub">عشرون عامًا من النمو · ٢٠٠٦ — ٢٠٢٦</div>
      </motion.div>
      <motion.div className="hud-lines" style={{ x: '-50%' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6, duration: 1 }}>
        <span>LAT <b>{cam.lat.toFixed(4)}°N</b></span>
        <span>LON <b>{cam.lng.toFixed(4)}°E</b></span>
        <span>ALT <b>{alt > 10 ? `${fmt(alt)} KM` : `${fmt(alt * 1000)} M`}</b></span>
        <span>TARGET <b>SOHAG · EG</b></span>
      </motion.div>
      <button className="skip" onClick={onSkip}>تخطَّ المقدمة ←</button>
    </div>
  )
}

function useCount(to: number, ms = 1800, delay = 0) {
  const [v, setV] = useState(0)
  useEffect(() => {
    let raf = 0
    const t0 = performance.now() + delay
    const step = (t: number) => {
      const k = Math.max(0, Math.min(1, (t - t0) / ms))
      setV(to * (1 - Math.pow(1 - k, 4)))
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [to, ms, delay])
  return v
}

export function Arrival({ stats, onSkip }: { stats: Stats | null; onSkip: () => void }) {
  const y = stats?.years['2026']
  const lights = useCount(y?.byCat.pole ?? 1165, 2200, 300)
  const roads = useCount(y?.roadKm ?? 70, 2000, 500)
  const feats = useCount(y?.features ?? 2552, 2200, 700)
  const years = useCount(20, 1600, 900)
  return (
    <>
      <motion.div className="arrival" style={{ x: '-50%' }} initial={{ opacity: 0, y: 20 }} animate={{ opacity: [0, 1, 1, 0], y: [20, 0, 0, -20] }}
        transition={{ duration: 4.4, times: [0, 0.15, 0.82, 1] }}>
        <h1>جامعة سوهاج الجديدة · الكوامل</h1>
        <p>حرم جامعي كامل، مبنى بمبنى وعمودًا بعمود</p>
        <div className="counters">
          <div className="counter"><div className="v">{fmt(lights)}</div><div className="k">عمود إنارة</div></div>
          <div className="counter"><div className="v">{fmt(roads)}<small style={{ fontSize: '.5em' }}> كم</small></div><div className="k">طرق</div></div>
          <div className="counter"><div className="v">{fmt(feats)}</div><div className="k">عنصر مكاني</div></div>
          <div className="counter"><div className="v">{fmt(years)}</div><div className="k">عامًا من الخرائط</div></div>
        </div>
      </motion.div>
      <div className="intro" style={{ zIndex: 24 }}><button className="skip" onClick={onSkip}>ابدأ الاستكشاف ←</button></div>
    </>
  )
}

export function Loader() {
  return (
    <div className="intro">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }} style={{ display: 'grid', placeItems: 'center', gap: 18 }}>
        <motion.img src="/logo.png" alt="" style={{ width: 64, filter: 'drop-shadow(0 0 24px rgba(245,181,68,.35))' }}
          animate={{ opacity: [0.5, 1, 0.5], scale: [0.98, 1.02, 0.98] }} transition={{ duration: 2.2, repeat: Infinity }} />
        <div className="num" style={{ letterSpacing: '0.5em', color: '#8d9ab1', fontSize: 12, paddingLeft: '0.5em' }}>LOADING SATELLITE</div>
      </motion.div>
    </div>
  )
}
