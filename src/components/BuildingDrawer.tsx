import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { X, ChevronLeft, ChevronRight, RotateCw, Building2, ChevronDown, ImageOff, Navigation } from 'lucide-react'
import type { Selection } from '../App'
import { CAT_META, YEARS, areaM2, centroid, fmt, norm, type Campus, type Profile, type Year } from '../data'

function floorBadge(names: string[], i: number) {
  const n = names[i]
  if (/بدروم|بدرون/.test(n)) return 'B'
  if (/ارض|أرض/.test(n)) return 'G'
  if (/سطح|روف/.test(n)) return 'R'
  const g = names.findIndex((x) => /ارض|أرض/.test(x))
  return String(g >= 0 ? i - g : i + 1)
}

export function BuildingDrawer({ sel, year, data, profiles, onClose, onOrbit, onProfile, onDirections }: {
  sel: Selection; year: Year; data: Partial<Record<Year, Campus>>; profiles: Map<string, Profile>
  onClose: () => void; onOrbit: () => void; onProfile: (key: string) => void; onDirections: () => void
}) {
  const f = sel.feature
  const p = f.properties
  const main = p.p ? profiles.get(p.p) : undefined
  const extra = (p.px ?? []).map((k) => profiles.get(k)).filter(Boolean) as Profile[]
  const meta = CAT_META[p.c]
  const name = main?.name ?? p.n ?? meta.label
  const images = [...(main?.images ?? []), ...extra.flatMap((x) => x.images)]
  const [img, setImg] = useState(0)
  const [q, setQ] = useState(sel.room ?? '')
  const floorsAll = main?.floors ?? []
  const [open, setOpen] = useState<number | null>(() => {
    if (!sel.room) return floorsAll.length ? 0 : null
    const i = floorsAll.findIndex((fl) => fl.rooms.some((r) => norm(r).includes(norm(sel.room))))
    return i >= 0 ? i : 0
  })

  const area = areaM2(f.geometry)
  const firstSeen = useMemo(() => {
    const [cx, cy] = centroid(f.geometry)
    for (const y of YEARS) {
      const hit = data[y]?.features.find((g) => {
        if (g.geometry.type !== 'Polygon' && g.geometry.type !== 'MultiPolygon') return false
        if (p.p && g.properties.p === p.p) return true
        const [x2, y2] = centroid(g.geometry)
        return Math.hypot((x2 - cx) * 99700, (y2 - cy) * 110540) < 22
      })
      if (hit) return y
    }
    return year
  }, [data, f, p.p, year])

  const nq = norm(q)
  const floors = floorsAll.map((fl) => ({ ...fl, hits: nq ? fl.rooms.filter((r) => norm(r).includes(nq)).length : 0 }))
  const roomCount = floorsAll.reduce((s, fl) => s + fl.rooms.length, 0)

  return (
    <motion.aside className="drawer glass" initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 30 }}>
      <div className="hero">
        {images.length ? (
          <motion.img key={images[img]} src={images[img]} alt={name} initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }} />
        ) : (
          <div className="nophoto"><ImageOff size={40} strokeWidth={1.2} /></div>
        )}
        <button className="close" onClick={onClose} aria-label="إغلاق"><X size={17} /></button>
        {images.length > 1 && (
          <>
            <button className="nav" style={{ right: 12 }} onClick={() => setImg((img - 1 + images.length) % images.length)}><ChevronRight size={17} /></button>
            <button className="nav" style={{ left: 12 }} onClick={() => setImg((img + 1) % images.length)}><ChevronLeft size={17} /></button>
            <div className="dots">{images.map((_, i) => <i key={i} className={i === img ? 'on' : ''} />)}</div>
          </>
        )}
        <div className="title">
          <span className="cat"><span className="dot" style={{ width: 8, height: 8, borderRadius: 2, background: meta.color, display: 'inline-block' }} />{meta.label}</span>
          <h2>{name}</h2>
        </div>
      </div>
      <div className="body">
        <div className="facts">
          <div className="fact"><div className="v num">{fmt(p.h ?? 0, 1)}<small>م</small></div><div className="k">الارتفاع</div></div>
          <div className="fact"><div className="v num">{fmt(area)}<small>م²</small></div><div className="k">مساحة الأرضية</div></div>
          <div className="fact"><div className="v num">{firstSeen}</div><div className="k">أول ظهور في الخرائط</div></div>
        </div>
        {main?.size && (
          <div className="facts" style={{ marginTop: 8 }}>
            <div className="fact"><div className="v num">{main.size.length.replace('م', '')}<small>م</small></div><div className="k">الطول المقاس</div></div>
            <div className="fact"><div className="v num">{main.size.width.replace('م', '')}<small>م</small></div><div className="k">العرض المقاس</div></div>
            <div className="fact"><div className="v num">{floorsAll.length || '—'}</div><div className="k">عدد الأدوار</div></div>
          </div>
        )}
        {main?.desc && <p className="desc">{main.desc}</p>}
        {extra.length > 0 && (
          <div className="houses">
            يضم المبنى أيضًا:
            {extra.map((x) => <button key={x.key} onClick={() => onProfile(x.key)}>{x.name}</button>)}
          </div>
        )}
        <div className="actions">
          <button className="btn gold" onClick={onDirections}><Navigation size={16} />اتجاهات إلى هنا</button>
          <button className="btn" onClick={onOrbit}><RotateCw size={16} />دوران حول المبنى</button>
        </div>

        {floorsAll.length > 0 ? (
          <>
            <div className="sec-t"><Building2 size={17} />الأدوار والمحتويات <span className="muted num">· {roomCount} مساحة</span></div>
            <input className="room-filter" placeholder="ابحث داخل المبنى: معمل، مدرج، شئون الطلاب…" value={q} onChange={(e) => setQ(e.target.value)} />
            {floors.map((fl, i) => {
              const isOpen = open === i || (nq !== '' && fl.hits > 0)
              return (
                <div className="floor" key={i}>
                  <button onClick={() => setOpen(open === i ? null : i)}>
                    <span className="lv">{floorBadge(floorsAll.map((x) => x.floor), i)}</span>
                    {fl.floor}
                    <span className="n">{nq ? `${fl.hits}/` : ''}{fl.rooms.length}</span>
                    <ChevronDown size={15} style={{ transform: isOpen ? 'rotate(180deg)' : '', transition: '.2s' }} />
                  </button>
                  {isOpen && (
                    <div className="rooms">
                      {fl.rooms.map((r, j) => <span key={j} className={`room ${nq && norm(r).includes(nq) ? 'hit' : ''}`}>{r}</span>)}
                    </div>
                  )}
                </div>
              )
            })}
          </>
        ) : (
          <p className="muted" style={{ marginTop: 18 }}>لا تتوفر بعد بيانات الأدوار لهذا المبنى.</p>
        )}
      </div>
    </motion.aside>
  )
}
