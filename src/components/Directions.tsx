import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import * as maplibregl from 'maplibre-gl'
import { X, ArrowUpDown, MapPin, Crosshair, LocateFixed, Footprints, Car, DoorOpen, Building2, RotateCcw, TriangleAlert } from 'lucide-react'
import type { CampusEngine } from '../map/engine'
import { CAT_META, centroid, norm, type Campus, type CampusFeature, type Profile } from '../data'
import { loadRouter, fmtDist, fmtMin, WALK_M_PER_MIN, DRIVE_M_PER_MIN, type Router, type RouteResult } from '../route/router'

type LngLat = [number, number]
export interface Endpoint {
  label: string
  sub?: string
  feature?: CampusFeature
  point?: LngLat
  room?: string
  floor?: string
}

export function endpointFor(f: CampusFeature, profiles: Map<string, Profile>, room?: { name: string; floor: string }): Endpoint {
  const p = f.properties
  const name = (p.p && profiles.get(p.p)?.name) || p.n || CAT_META[p.c].label
  return room ? { label: room.name, sub: `${name} · ${room.floor}`, feature: f, room: room.name, floor: room.floor }
    : { label: name, sub: CAT_META[p.c].label, feature: f }
}

interface Option { ep: Endpoint; kind: 'gate' | 'building' | 'place' | 'room'; key: string }

function useOptions(fc: Campus, profiles: Map<string, Profile>) {
  return useMemo(() => {
    const opts: Option[] = []
    const seen = new Set<string>()
    for (const f of fc.features) {
      const p = f.properties
      if (p.c === 'gate' && p.n) opts.push({ ep: endpointFor(f, profiles), kind: 'gate', key: p.id })
    }
    for (const f of fc.features) {
      const p = f.properties
      if (p.p && !seen.has(p.p)) {
        seen.add(p.p)
        opts.push({ ep: endpointFor(f, profiles), kind: 'building', key: p.id })
        for (const k of p.px ?? []) {
          const pr = profiles.get(k)
          if (pr && !seen.has(k)) { seen.add(k); opts.push({ ep: { label: pr.name, sub: `داخل ${profiles.get(p.p)?.name}`, feature: f }, kind: 'building', key: `${p.id}-${k}` }) }
        }
      }
    }
    for (const f of fc.features) {
      const p = f.properties
      if (!p.p && p.n && p.c !== 'gate' && !seen.has(p.n) && !['farm', 'green', 'road', 'pole'].includes(p.c)) {
        seen.add(p.n)
        opts.push({ ep: endpointFor(f, profiles), kind: 'place', key: p.id })
      }
    }
    for (const f of fc.features) {
      const key = f.properties.p
      if (!key || seen.has(`rooms:${key}`)) continue
      seen.add(`rooms:${key}`)
      ;(profiles.get(key)?.floors ?? []).forEach((fl, fi) => fl.rooms.forEach((r, ri) => {
        opts.push({ ep: endpointFor(f, profiles, { name: r, floor: fl.floor }), kind: 'room', key: `${f.properties.id}-${fi}-${ri}` })
      }))
    }
    return opts.map((o) => ({ ...o, n: norm(`${o.ep.label} ${o.ep.sub ?? ''}`) }))
  }, [fc, profiles])
}

function Field({ which, value, options, onPick, onMap, onMe, autoFocus }: {
  which: 'from' | 'to'; value?: Endpoint; options: (Option & { n: string })[]
  onPick: (e: Endpoint) => void; onMap: () => void; onMe: () => void; autoFocus?: boolean
}) {
  const [open, setOpen] = useState(!!autoFocus)
  const [q, setQ] = useState('')
  const inp = useRef<HTMLInputElement>(null)
  useEffect(() => { if (autoFocus) inp.current?.focus() }, [autoFocus])
  const nq = norm(q)
  const list = useMemo(() => {
    if (!nq) return options.filter((o) => o.kind !== 'room').slice(0, 40)
    return options.filter((o) => o.n.includes(nq)).sort((a, b) => (a.kind === 'room' ? 1 : 0) - (b.kind === 'room' ? 1 : 0)).slice(0, 40)
  }, [nq, options])
  const icon = (k: Option['kind']) => k === 'gate' ? <MapPin size={15} /> : k === 'room' ? <DoorOpen size={15} /> : <Building2 size={15} />
  return (
    <div className={`dfield ${which}`}>
      <span className="dot" />
      <input ref={inp} value={open ? q : value?.label ?? ''} placeholder={which === 'from' ? 'من أين؟' : 'إلى أين؟'}
        onFocus={() => { setOpen(true); setQ('') }} onBlur={() => setTimeout(() => setOpen(false), 160)} onChange={(e) => setQ(e.target.value)} />
      {value?.sub && !open && <span className="dsub">{value.sub}</span>}
      <AnimatePresence>
        {open && (
          <motion.div className="dmenu glass" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <button className="dopt quick" onMouseDown={(e) => e.preventDefault()} onClick={() => { setOpen(false); inp.current?.blur(); onMe() }}><LocateFixed size={15} />موقعي الحالي</button>
            <button className="dopt quick" onMouseDown={(e) => e.preventDefault()} onClick={() => { setOpen(false); inp.current?.blur(); onMap() }}><Crosshair size={15} />اختر نقطة على الخريطة</button>
            {list.map((o) => (
              <button key={o.key} className="dopt" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(o.ep); setOpen(false); inp.current?.blur() }}>
                {icon(o.kind)}<span><b>{o.ep.label}</b>{o.ep.sub && <small>{o.ep.sub}</small>}</span>
              </button>
            ))}
            {list.length === 0 && <div className="muted" style={{ padding: 10 }}>لا نتائج</div>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function Directions({ engine, fc, profiles, from, to, setFrom, setTo, onClose, notice }: {
  engine: CampusEngine; fc: Campus; profiles: Map<string, Profile>
  from?: Endpoint; to?: Endpoint; setFrom: (e?: Endpoint) => void; setTo: (e?: Endpoint) => void
  onClose: () => void; notice?: string
}) {
  const options = useOptions(fc, profiles)
  const [router, setRouter] = useState<Router | null>(null)
  const [avoid, setAvoid] = useState(false)
  const [mode, setMode] = useState<'walk' | 'drive'>('walk')
  const [res, setRes] = useState<RouteResult | null | 'none'>(null)
  const [picking, setPicking] = useState<'from' | 'to' | null>(null)
  const [msg, setMsg] = useState<string | undefined>(notice)
  const [replay, setReplay] = useState(0)
  const markers = useRef<maplibregl.Marker[]>([])
  const panel = useRef<HTMLElement>(null)

  useEffect(() => { loadRouter().then(setRouter) }, [])
  useEffect(() => setMsg(notice), [notice])

  const pick = async (which: 'from' | 'to') => {
    setPicking(which)
    const p = await engine.pickPoint()
    setPicking(null)
    if (!p) return
    const ep: Endpoint = { label: 'نقطة على الخريطة', sub: `${p[1].toFixed(5)}, ${p[0].toFixed(5)}`, point: p }
    if (which === 'from') setFrom(ep); else setTo(ep)
  }
  const me = (which: 'from' | 'to') => {
    if (!navigator.geolocation) { setMsg('تحديد الموقع غير متاح في هذا المتصفح.'); return }
    setMsg('جارٍ تحديد موقعك…')
    navigator.geolocation.getCurrentPosition((pos) => {
      const p: LngLat = [pos.coords.longitude, pos.coords.latitude]
      const far = router?.snap(p)
      if (far && far.d > 1500) {
        setMsg('أنت خارج الحرم الآن؛ سنبدأ من البوابة 1. استخدم هذه الميزة من داخل الحرم.')
        const g = fc.features.find((f) => f.properties.n === 'البوابة 1')
        if (g) { const ep = endpointFor(g, profiles); if (which === 'from') setFrom(ep); else setTo(ep) }
        return
      }
      setMsg(undefined)
      const ep: Endpoint = { label: 'موقعي الحالي', sub: `دقة ± ${Math.round(pos.coords.accuracy)} م`, point: p }
      if (which === 'from') setFrom(ep); else setTo(ep)
    }, () => setMsg('لم نتمكن من تحديد موقعك. اسمح للمتصفح بالوصول إلى الموقع.'), { enableHighAccuracy: true, timeout: 10000 })
  }

  // compute + draw
  useEffect(() => {
    markers.current.forEach((m) => m.remove()); markers.current = []
    if (!router || !from || !to) { engine.clearRoute(); setRes(null); return }
    const resolve = (e: Endpoint) => e.point ? { point: e.point, snap: router.snap(e.point, avoid) } : router.anchor(e.feature!.geometry, avoid)
    const a = resolve(from), b = resolve(to)
    if (!a?.snap || !b?.snap) { setRes('none'); engine.clearRoute(); return }
    const same = from.feature && to.feature && from.feature.properties.id === to.feature.properties.id
    const r = same ? null : router.route(a.point, b.point, { avoidConstruction: avoid, fromSnap: a.snap, toSnap: b.snap })
    if (!r) { setRes(same ? null : 'none'); engine.clearRoute(); if (same) setMsg('نقطة البداية والنهاية في المبنى نفسه.'); return }
    setRes(r)
    const mobile = window.innerWidth < 860
    // leave room for the panel: a bottom sheet on phones, a side card on desktop
    const sheet = Math.min(panel.current?.offsetHeight ?? 0, window.innerHeight * 0.62)
    engine.showRoute(r.path, [r.legA, r.legB], { padding: mobile ? { top: 90, bottom: sheet + 50, left: 40, right: 40 } : { top: 110, bottom: 170, left: 470, right: 110 } })
    const pin = (cls: string, text: string, at: LngLat) => {
      const el = document.createElement('div')
      el.className = `pin ${cls}`
      el.innerHTML = `<span>${text}</span>`
      markers.current.push(new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(at).addTo(engine.map))
    }
    pin('from', from.label, from.point ?? a.point)
    pin('to', to.label, to.point ?? (to.feature ? centroid(to.feature.geometry) : b.point))
  }, [router, from, to, avoid, engine, replay])

  useEffect(() => () => { engine.clearRoute(); engine.cancelPick(); markers.current.forEach((m) => m.remove()) }, [engine])

  const r = res && res !== 'none' ? res : null
  const min = r ? r.meters / (mode === 'walk' ? WALK_M_PER_MIN : DRIVE_M_PER_MIN) : 0

  return (
    <motion.aside ref={panel} className={`directions glass ${r ? 'has-route' : ''}`} initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 30 }}>
      <div className="panel-h">
        <h3>أقصر طريق</h3>
        <button className="tool" onClick={onClose} aria-label="إغلاق"><X size={16} /></button>
      </div>
      <div className="dfields">
        <Field which="from" value={from} options={options} onPick={setFrom} onMap={() => pick('from')} onMe={() => me('from')} />
        <Field which="to" value={to} options={options} onPick={setTo} onMap={() => pick('to')} onMe={() => me('to')} autoFocus={!to} />
        <button className="swap" title="عكس الاتجاه" onClick={() => { const f = from; setFrom(to); setTo(f) }}><ArrowUpDown size={16} /></button>
      </div>

      {picking && <div className="dnote pickme"><Crosshair size={15} />اضغط على الخريطة لتحديد {picking === 'from' ? 'نقطة البداية' : 'الوجهة'} <button onClick={() => engine.cancelPick()}>إلغاء</button></div>}
      {msg && !picking && <div className="dnote">{msg}</div>}

      <div className="dopts">
        <div className="seg modes">
          <button className={mode === 'walk' ? 'on' : ''} onClick={() => setMode('walk')}><Footprints size={14} /> مشيًا</button>
          <button className={mode === 'drive' ? 'on' : ''} onClick={() => setMode('drive')}><Car size={14} /> بالسيارة</button>
        </div>
        <label className="chk"><input type="checkbox" checked={avoid} onChange={(e) => setAvoid(e.target.checked)} />تجنّب الطرق تحت الإنشاء</label>
      </div>

      <AnimatePresence mode="wait">
        {r && (
          <motion.div key={`${r.meters}-${mode}`} className="dres" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="big"><span className="num">{fmtMin(min)}</span><small>{mode === 'walk' ? 'مشيًا' : 'بالسيارة'}</small></div>
            <div className="facts">
              <div className="fact"><div className="v num">{fmtDist(r.meters)}</div><div className="k">المسافة</div></div>
              <div className="fact"><div className="v num">{fmtMin(r.meters / (mode === 'walk' ? DRIVE_M_PER_MIN : WALK_M_PER_MIN))}</div><div className="k">{mode === 'walk' ? 'بالسيارة' : 'مشيًا'}</div></div>
              <div className="fact"><div className="v num">{r.junctions}</div><div className="k">مقاطع طرق</div></div>
            </div>
            <ol className="steps">
              <li><i className="s from" />ابدأ من <b>{from?.label}</b></li>
              {r.aMeters > 3 && <li><i className="s walk" />امشِ <b className="num">{fmtDist(r.aMeters)}</b> إلى أقرب طريق</li>}
              <li><i className="s road" />اتبع الطريق المضيء لمسافة <b className="num">{fmtDist(r.roadMeters)}</b></li>
              {r.bMeters > 3 && <li><i className="s walk" />اترك الطريق وامشِ <b className="num">{fmtDist(r.bMeters)}</b> إلى المبنى</li>}
              <li><i className="s to" />{to?.room ? <>ادخل <b>{to.sub?.split(' · ')[0]}</b> ثم توجّه إلى <b>{to.room}</b> في {to.floor}</> : <>وصلت إلى <b>{to?.label}</b></>}</li>
            </ol>
            <button className="btn" onClick={() => setReplay((x) => x + 1)}><RotateCcw size={15} />إعادة عرض المسار</button>
          </motion.div>
        )}
        {res === 'none' && (
          <motion.div className="dnote warn" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <TriangleAlert size={15} />لا يوجد طريق متصل{avoid ? ' بدون الطرق تحت الإنشاء — جرّب إلغاء هذا الخيار.' : '.'}
          </motion.div>
        )}
      </AnimatePresence>
      {!to && !picking && <p className="muted" style={{ marginTop: 12 }}>اختر وجهة من القائمة، أو اضغط على أي مبنى في الخريطة.</p>}
      <p className="muted dfoot">المسار على شبكة طرق 2026 (70 كم). المشي 80 م/دقيقة تقريبًا.</p>
    </motion.aside>
  )
}
