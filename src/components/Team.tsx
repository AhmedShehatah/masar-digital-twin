import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { motion } from 'motion/react'
import { Crown, Search, X } from 'lucide-react'
import { LEADER, MEMBERS, SUPERVISORS, splitName } from '../team'
import { norm } from '../data'

const ar = (n: number) => n.toLocaleString('ar-EG')
/** gold, cyan, violet, rose, teal, amber: each card gets one so the wall shimmers instead of repeating */
const HUES = [42, 192, 262, 340, 168, 24]
const hueOf = (name: string) => HUES[[...name].reduce((h, c) => h + c.charCodeAt(0), 0) % HUES.length]

export function Team({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('')
  const total = MEMBERS.length + 1

  // capture phase so the map app underneath never sees Esc
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      if (q) setQ('')
      else onClose()
    }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [q, onClose])

  const nq = norm(q)
  const hits = useMemo(() => (nq ? MEMBERS.filter((m) => norm(m).includes(nq)) : MEMBERS), [nq])
  const leaderHit = !nq || norm(LEADER).includes(nq)
  const [lFirst, lRest] = splitName(LEADER)

  return (
    <motion.div className="team" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}>
      <div className="t-sky" />
      <div className="t-glow" />
      <button className="t-close" onClick={onClose} title="إغلاق (Esc)"><X size={18} /></button>

      <div className="t-scroll">
        {/* ---------- hero ---------- */}
        <motion.header className="t-hero" initial={{ opacity: 0, y: 24, filter: 'blur(10px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 1.1, ease: [0.2, 0.7, 0.2, 1] }}>
          <div className="t-eyebrow num">MASAR · THE TEAM</div>
          <h1>فريق العمل</h1>
          <p>الأيدي التي حوّلت عشرين عامًا من الخرائط إلى توأمٍ رقميٍّ حيّ</p>
          <div className="t-facts">
            <span><b>{ar(total)}</b> طالبًا وطالبة</span>
            <i />
            <span>مشروع التخرج</span>
            <i />
            <span>جامعة سوهاج الجديدة · <b>{ar(2026)}</b></span>
          </div>
        </motion.header>

        {/* ---------- supervisors ---------- */}
        <motion.section className="t-sup" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.9, ease: [0.2, 0.7, 0.2, 1] }}>
          <div className="t-sup-head">تحت إشراف</div>
          <div className="t-sup-main"><span className="t-sup-title">{SUPERVISORS.main.title}</span>{SUPERVISORS.main.name}</div>
          <div className="t-sup-row">
            {SUPERVISORS.others.map((s) => (
              <div key={s.name} className="t-sup-item">
                <span className="t-role">{s.role}</span>
                <div className="t-sup-name"><span className="t-sup-title">{s.title}</span>{s.name}</div>
              </div>
            ))}
          </div>
        </motion.section>

        {/* ---------- leader ---------- */}
        {leaderHit && (
          <motion.section className="t-leader" initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.35, duration: 1, ease: [0.2, 0.7, 0.2, 1] }}>
            <div className="t-medal">
              <span className="t-ring" />
              <span className="t-mono">{[...LEADER][0]}</span>
              <span className="t-crown"><Crown size={16} /></span>
            </div>
            <div className="t-role">قائدة الفريق</div>
            <div className="t-lname">{lFirst}</div>
            <div className="t-lrest">{lRest}</div>
          </motion.section>
        )}

        {/* ---------- search ---------- */}
        <motion.label className="t-search" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 0.7 }}>
          <Search size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث عن اسمك…" />
          {q && <span className="t-count num">{ar(hits.length + (leaderHit ? 1 : 0))}</span>}
        </motion.label>

        {/* ---------- the wall ---------- */}
        <div className="t-grid">
          {hits.map((m, i) => {
            const [first, rest] = splitName(m)
            return (
              <motion.div key={m} className="t-card" style={{ '--h': hueOf(m) } as CSSProperties}
                initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: nq ? 0 : 0.7 + i * 0.022, duration: 0.6, ease: [0.2, 0.7, 0.2, 1] }}>
                <span className="t-av">{[...m][0]}</span>
                <span className="t-names">
                  <span className="t-first">{first}</span>
                  {rest && <span className="t-rest">{rest}</span>}
                </span>
                <span className="t-no num">{String(MEMBERS.indexOf(m) + 2).padStart(2, '0')}</span>
              </motion.div>
            )
          })}
          {!hits.length && !leaderHit && <div className="t-empty">لا يوجد اسم يطابق «{q}»</div>}
        </div>

        <footer className="t-foot">
          <img src="/logo.png" alt="" />
          <div>شكرًا لكل من ساهم في بناء <b>مسار</b></div>
        </footer>
      </div>
    </motion.div>
  )
}
