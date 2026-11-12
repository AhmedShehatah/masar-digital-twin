import { X } from 'lucide-react'
import { motion } from 'motion/react'
import { CAT_META, YEARS, fmt, type Cat, type Stats, type Year } from '../data'

function Spark({ values, cur, color }: { values: number[]; cur: number; color: string }) {
  const max = Math.max(...values, 1)
  const W = 180, H = 44
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, H - 4 - (v / max) * (H - 8)])
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ direction: 'ltr' }}>
      <defs>
        <linearGradient id={`g${color.slice(1)}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".35" /><stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${W},${H} L0,${H} Z`} fill={`url(#g${color.slice(1)})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={i === cur ? 4 : 2} fill={i === cur ? '#fff' : color} />)}
    </svg>
  )
}

export function StatsPanel({ stats, year, onClose }: { stats: Stats; year: Year; onClose: () => void }) {
  const ys = YEARS.map((y) => stats.years[String(y)])
  const cur = YEARS.indexOf(year)
  const s = stats.years[String(year)]
  const cards = [
    { k: 'أعمدة الإنارة', v: (x: typeof s) => x.byCat.pole ?? 0, c: '#ffd27a', u: '' },
    { k: 'أطوال الطرق', v: (x: typeof s) => x.roadKm, c: '#4cc9f0', u: ' كم' },
    { k: 'مسطح المباني', v: (x: typeof s) => x.builtM2 / 1000, c: '#f5b544', u: ' ألف م²' },
    { k: 'إجمالي العناصر', v: (x: typeof s) => x.features, c: '#a78bfa', u: '' },
  ]
  const cats = (Object.entries(s.byCat) as [Cat, number][]).filter(([c]) => c !== 'boundary').sort((a, b) => b[1] - a[1])
  const max = Math.max(...cats.map((c) => c[1]))
  return (
    <motion.aside className="stats glass" initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 30 }}>
      <div className="panel-h">
        <div>
          <h3>عشرون عامًا بالأرقام</h3>
          <div className="muted">من ملفات الرفع المساحي 2006 — 2026 · السنة المعروضة <b className="num" style={{ color: '#ffd98a' }}>{year}</b></div>
        </div>
        <button className="tool" onClick={onClose}><X size={16} /></button>
      </div>
      <div className="cards">
        {cards.map((c) => (
          <div className="card" key={c.k}>
            <div className="v num" style={{ color: c.c }}>{fmt(c.v(s), 1)}<small style={{ fontSize: 12, color: '#8d9ab1' }}>{c.u}</small></div>
            <div className="k">{c.k}</div>
            <Spark values={ys.map(c.v)} cur={cur} color={c.c} />
          </div>
        ))}
      </div>
      <div className="sec-t" style={{ marginTop: 20 }}>محتوى خريطة {year}</div>
      <div className="bars">
        {cats.map(([c, n]) => (
          <div className="bar" key={c}>
            <span>{CAT_META[c].label}</span>
            <span className="tr"><i style={{ width: `${Math.max(3, (Math.log(n + 1) / Math.log(max + 1)) * 100)}%`, background: CAT_META[c].color }} /></span>
            <span className="n">{fmt(n)}</span>
          </div>
        ))}
      </div>
      <p className="muted" style={{ marginTop: 14, fontSize: 11.5, lineHeight: 1.8 }}>
        ملاحظة: الأرقام تعكس ما رُسم في ملف كل سنة؛ ملف 2021 يغطي جزءًا من أعمدة الإنارة فقط.
      </p>
    </motion.aside>
  )
}
