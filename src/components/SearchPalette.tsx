import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Search, Building2, DoorOpen, MapPin } from 'lucide-react'
import { CAT_META, norm, type Campus, type Profile, type Year } from '../data'

export interface SearchHit { kind: 'profile' | 'room' | 'place' | 'cat'; name: string; profile?: string; room?: string; sub?: string }

export function SearchPalette({ profiles, data, year, onPick, onClose }: {
  profiles: Profile[]; data: Partial<Record<Year, Campus>>; year: Year; onPick: (h: SearchHit) => void; onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [act, setAct] = useState(0)
  const inp = useRef<HTMLInputElement>(null)
  useEffect(() => inp.current?.focus(), [])

  const index = useMemo(() => {
    const items: SearchHit[] = []
    for (const p of profiles) {
      items.push({ kind: 'profile', name: p.name, profile: p.key, sub: p.floors.length ? `${p.floors.length} أدوار` : 'مبنى' })
      p.floors.forEach((fl) => fl.rooms.forEach((r) => items.push({ kind: 'room', name: r, profile: p.key, room: r, sub: `${p.name} · ${fl.floor}` })))
    }
    const names = new Set(profiles.map((p) => norm(p.name)))
    for (const y of [year, 2026, 2021, 2016, 2011] as Year[]) {
      data[y]?.features.forEach((f) => {
        const n = f.properties.n
        if (!n || f.properties.p || names.has(norm(n))) return
        names.add(norm(n))
        items.push({ kind: 'place', name: n, sub: `${CAT_META[f.properties.c].label} · ${y}` })
      })
    }
    return items.map((it) => ({ it, k: norm(it.name) }))
  }, [profiles, data, year])

  const results = useMemo(() => {
    const nq = norm(q)
    if (!nq) return index.filter((x) => x.it.kind === 'profile').slice(0, 12).map((x) => x.it)
    const out = index
      .filter((x) => x.k.includes(nq))
      .sort((a, b) => (a.k.startsWith(nq) ? 0 : 1) - (b.k.startsWith(nq) ? 0 : 1) || a.k.length - b.k.length)
    const dedup = new Map<string, SearchHit>()
    out.forEach(({ it }) => { const key = `${it.kind}|${it.name}|${it.sub}`; if (!dedup.has(key)) dedup.set(key, it) })
    return [...dedup.values()].slice(0, 40)
  }, [q, index])

  useEffect(() => setAct(0), [q])

  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAct((a) => Math.min(results.length - 1, a + 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setAct((a) => Math.max(0, a - 1)) }
    if (e.key === 'Enter' && results[act]) onPick(results[act])
    if (e.key === 'Escape') onClose()
  }

  const groups: [SearchHit['kind'], string][] = [['profile', 'المباني والكليات'], ['place', 'أماكن على الخريطة'], ['room', 'داخل المباني']]
  let i = -1
  const hl = (s: string) => {
    if (!q) return s
    const at = s.indexOf(q)
    return at < 0 ? s : <>{s.slice(0, at)}<mark>{s.slice(at, at + q.length)}</mark>{s.slice(at + q.length)}</>
  }

  return (
    <div className="overlay" onMouseDown={onClose}>
      <motion.div className="palette glass" onMouseDown={(e) => e.stopPropagation()} initial={{ opacity: 0, y: -12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.18 }}>
        <div className="in">
          <Search size={20} color="#f5b544" />
          <input ref={inp} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={key} placeholder="ابحث: كلية الهندسة، معمل 309، شئون الطلاب، كافتيريا…" />
          <span className="kbd">Esc</span>
        </div>
        <div className="res">
          {results.length === 0 && <div className="muted" style={{ padding: 20, textAlign: 'center' }}>لا توجد نتائج لـ «{q}»</div>}
          {groups.map(([k, title]) => {
            const g = results.filter((r) => r.kind === k)
            if (!g.length) return null
            return (
              <div key={k}>
                <div className="gt">{title}</div>
                {g.map((r) => {
                  i++
                  const idx = results.indexOf(r)
                  return (
                    <button key={`${r.kind}${r.name}${r.sub}${i}`} className={`item ${idx === act ? 'act' : ''}`} onMouseEnter={() => setAct(idx)} onClick={() => onPick(r)}>
                      <span className="ic">{r.kind === 'room' ? <DoorOpen size={16} /> : r.kind === 'place' ? <MapPin size={16} /> : <Building2 size={16} color="#f5b544" />}</span>
                      <span><div>{hl(r.name)}</div>{r.sub && <div className="s">{r.sub}</div>}</span>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
        <div className="foot"><span>↑↓ للتنقل</span><span>Enter للانتقال</span><span>⌘K للفتح من أي مكان</span></div>
      </motion.div>
    </div>
  )
}
