import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import { AnimatePresence } from 'motion/react'
import { Search, Layers, BarChart3, Moon, Sun, Clapperboard, Navigation, Images } from 'lucide-react'
import { CampusEngine } from './map/engine'
import {
  YEARS, loadYear, loadProfiles, loadStats, centroid, norm,
  type Campus, type CampusFeature, type Cat, type Profile, type Stats, type Year,
} from './data'
import { Intro, Arrival, Loader } from './components/Intro'
import { LayersPanel } from './components/LayersPanel'
import { TimeMachine } from './components/TimeMachine'
import { BuildingDrawer } from './components/BuildingDrawer'
import { SearchPalette, type SearchHit } from './components/SearchPalette'
import { StatsPanel } from './components/StatsPanel'
import { Hud } from './components/Hud'
import { Film, type FilmCtx } from './components/Film'
import { Assistant } from './components/Assistant'
import { CompareView, CompareBar } from './components/Compare'
import { Directions, endpointFor, type Endpoint } from './components/Directions'
import { Gallery } from './components/Gallery'
import type { Intent, RouteTarget } from './voice/intents'

type Phase = 'loading' | 'intro' | 'arrive' | 'ready'
export interface Selection { feature: CampusFeature; room?: string }
export type { Cam } from './useCam'

export default function App() {
  const mapEl = useRef<HTMLDivElement>(null)
  const engine = useRef<CampusEngine | null>(null)
  const markers = useRef<maplibregl.Marker[]>([])
  const [phase, setPhase] = useState<Phase>('loading')
  const [year, setYear] = useState<Year>(2026)
  const [data, setData] = useState<Partial<Record<Year, Campus>>>({})
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [night, setNight] = useState(true)
  const [hidden, setHidden] = useState<Cat[]>([])
  const [panel, setPanel] = useState<'layers' | 'stats' | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [sel, setSel] = useState<Selection | null>(null)
  const [hover, setHover] = useState<{ f: CampusFeature; x: number; y: number } | null>(null)
  const [closeZoom, setCloseZoom] = useState(false)
  const [eng, setEng] = useState<CampusEngine | null>(null)
  const [touring, setTouring] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [compare, setCompare] = useState<Year | null>(null)
  const [gallery, setGallery] = useState(() => new URLSearchParams(location.search).has('gallery'))
  const [narrow, setNarrow] = useState(() => window.innerWidth < 860)
  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < 860)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  const [dir, setDir] = useState<{ from?: Endpoint; to?: Endpoint; notice?: string } | null>(null)
  const dirRef = useRef(dir)
  dirRef.current = dir
  const compareRef = useRef(compare)
  compareRef.current = compare

  // map features come back with arrays stringified, so always resolve to the source feature
  const dataRef = useRef(data)
  dataRef.current = data
  const byId = (id: string) => {
    const y = Number(String(id).split('-')[0]) as Year
    return dataRef.current[y]?.features.find((x) => x.properties.id === id)
  }

  const profileMap = useMemo(() => new Map(profiles.map((p) => [p.key, p])), [profiles])
  const profileMapRef = useRef(profileMap)
  profileMapRef.current = profileMap
  const current = data[year]

  // ---------- boot ----------
  useEffect(() => {
    const eng = new CampusEngine(mapEl.current!, {
      onSelect: (f) => {
        if (compareRef.current) return
        const full = f ? byId(f.properties.id) ?? f : null
        if (dirRef.current) {
          if (full) setDir((d) => d && (!d.from ? { ...d, from: endpointFor(full, profileMapRef.current) } : { ...d, to: endpointFor(full, profileMapRef.current) }))
          return
        }
        setSel(full ? { feature: full } : null)
      },
      onHover: (f, x, y) => setHover(f ? { f, x, y } : null),
      onMove: (s) => setCloseZoom(s.zoom > 15.2),
    })
    engine.current = eng
    setEng(eng)
    let cancelled = false
    Promise.all([eng.ready().then(() => eng.tilesReady()), loadYear(2026), loadProfiles(), loadStats()]).then(([, fc, pr, st]) => {
      if (cancelled) return
      setProfiles(pr); setStats(st)
      setData((d) => ({ ...d, 2026: fc }))
      eng.setData(fc)
      if (new URLSearchParams(location.search).has('skip')) {
        eng.skipIntro(); eng.setNight(true); setPhase('ready')
      } else {
        setPhase('intro')
        eng.intro(() => setPhase('arrive')).then(() => {
        window.setTimeout(() => setPhase((p) => (p === 'arrive' ? 'ready' : p)), 2600)
      })
      }
      YEARS.forEach((y) => loadYear(y).then((c) => setData((d) => ({ ...d, [y]: c }))))
    })
    ;(window as unknown as { masar: CampusEngine }).masar = eng
    return () => { cancelled = true; eng.destroy() }
  }, [])

  const skip = useCallback(() => {
    engine.current?.skipIntro()
    setPhase('ready')
  }, [])

  // ---------- year switching ----------
  const switchYear = useCallback(async (y: Year) => {
    setYear(y)
    const fc = await loadYear(y)
    setData((d) => ({ ...d, [y]: fc }))
    await engine.current?.showYear(fc)
  }, [])

  useEffect(() => {
    if (!playing) return
    let i = 0
    let stop = false
    engine.current?.overview()
    const run = async () => {
      while (!stop && i < YEARS.length) {
        await switchYear(YEARS[i])
        await new Promise((r) => setTimeout(r, 1700))
        i++
      }
      if (!stop) setPlaying(false)
    }
    run()
    return () => { stop = true }
  }, [playing, switchYear])

  // ---------- engine sync ----------
  useEffect(() => { engine.current?.setHidden(hidden) }, [hidden])
  useEffect(() => { if (phase === 'ready' || phase === 'arrive') engine.current?.setNight(night) }, [night, phase])
  useEffect(() => { engine.current?.select(sel?.feature.properties.id ?? null) }, [sel])

  // ---------- floating labels ----------
  useEffect(() => {
    const eng = engine.current
    markers.current.forEach((m) => m.remove())
    markers.current = []
    if (!eng || !current || phase === 'intro' || phase === 'loading') return
    const seen = new Set<string>()
    for (const f of current.features) {
      const key = f.properties.p
      if (!key || seen.has(key)) continue
      seen.add(key)
      const el = document.createElement('button')
      el.className = 'lbl'
      el.textContent = profileMap.get(key)?.name ?? key
      el.onclick = (e) => { e.stopPropagation(); focusFeature(f) }
      markers.current.push(new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, -6] }).setLngLat(centroid(f.geometry)).addTo(eng.map))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, phase, profileMap])

  const labelsOn = phase === 'ready' && !touring && !compare && closeZoom && !hidden.includes('faculty')

  // ---------- actions ----------
  const focusFeature = useCallback((f: CampusFeature, room?: string) => {
    setSel({ feature: f, room })
    const c = centroid(f.geometry)
    const mobile = window.innerWidth < 860
    engine.current?.flyTo(c, { zoom: 17.6, pitch: 62, duration: 2000 }).then(() => {
      if (mobile) engine.current?.map.panBy([0, window.innerHeight * 0.22], { duration: 500 })
    })
  }, [])

  const findFeatureFor = useCallback((test: (f: CampusFeature) => boolean): CampusFeature | undefined => {
    for (const y of [year, 2026, 2021, 2016, 2011] as Year[]) {
      const f = data[y]?.features.find(test)
      if (f) return f
    }
  }, [data, year])

  const onSearch = useCallback(async (hit: SearchHit) => {
    setSearchOpen(false)
    if (hit.kind === 'cat') {
      setHidden([]); setPanel('layers')
      return
    }
    const test = (f: CampusFeature) =>
      hit.profile ? f.properties.p === hit.profile || !!f.properties.px?.includes(hit.profile) : norm(f.properties.n) === norm(hit.name)
    let f = data[year]?.features.find(test)
    if (!f) {
      const other = findFeatureFor(test)
      if (other) {
        const y = (Number(other.properties.id.split('-')[0]) as Year)
        await switchYear(y)
        f = other
      }
    }
    if (f) focusFeature(f, hit.room)
  }, [data, year, findFeatureFor, focusFeature, switchYear])

  const endTour = useCallback(() => setTouring(false), [])

  const fc2026 = data[2026]
  const filmCtx = useMemo<FilmCtx | null>(() => (eng && fc2026 && stats ? { engine: eng, fc: fc2026, profiles: profileMap, stats, switchYear, setNight } : null),
    [eng, fc2026, profileMap, stats, switchYear])

  const enterCompare = useCallback(async () => {
    setSel(null); setPanel(null); setPlaying(false); setSearchOpen(false)
    let right = yearRefC.current
    if (right === 2006) { right = 2026; await switchYear(2026) }
    setCompare(right === 2011 ? 2006 : 2011)
    engine.current?.overview()
  }, [switchYear])
  const yearRefC = useRef(year)
  yearRefC.current = year

  const gateEndpoint = useCallback((n = 1) => {
    const g = dataRef.current[2026]?.features.find((f) => f.properties.n === `البوابة ${n}`)
    return g ? endpointFor(g, profileMapRef.current) : undefined
  }, [])
  const openDirections = useCallback(async (to?: Endpoint, from?: Endpoint) => {
    setSel(null); setPanel(null); setCompare(null); setPlaying(false); setSearchOpen(false)
    const notice = yearRefC.current !== 2026 ? 'المسارات تُحسب على خريطة 2026، فانتقلنا إليها.' : undefined
    if (yearRefC.current !== 2026) await switchYear(2026)
    setDir({ from: from ?? gateEndpoint(1), to, notice })
  }, [switchYear, gateEndpoint])

  const startFilm = useCallback(() => {
    setDir(null)
    setCompare(null)
    setSel(null); setPanel(null); setPlaying(false); setSearchOpen(false)
    setTouring(true)
  }, [])

  const openGallery = useCallback(() => {
    setSel(null); setPanel(null); setPlaying(false); setSearchOpen(false); setTouring(false)
    setGallery(true)
  }, [])

  const onIntent = useCallback((i: Intent) => {
    switch (i.kind) {
      case 'goto':
        if (i.profile) onSearch({ kind: i.room ? 'room' : 'profile', name: i.room ?? i.profile, profile: i.profile, room: i.room })
        else if (i.place) onSearch({ kind: 'place', name: i.place })
        break
      case 'year': setSel(null); engine.current?.overview(); switchYear(i.year); break
      case 'night': setNight(true); break
      case 'day': setNight(false); break
      case 'overview': setSel(null); engine.current?.overview(); break
      case 'tour': window.setTimeout(startFilm, 1600); break
      case 'route': {
        const fc = dataRef.current[2026]
        if (!fc) break
        const resolve = (t?: RouteTarget) => {
          if (!t) return undefined
          const f = fc.features.find((x) => (t.profile ? x.properties.p === t.profile || !!x.properties.px?.includes(t.profile) : x.properties.n === t.place))
          if (!f) return undefined
          const pr = t.profile ? profileMapRef.current.get(t.profile) : undefined
          const fl = t.room ? pr?.floors.find((x) => x.rooms.includes(t.room!)) : undefined
          const ep = endpointFor(f, profileMapRef.current, t.room && fl ? { name: t.room, floor: fl.floor } : undefined)
          return t.profile && pr && f.properties.p !== t.profile && !t.room ? { ...ep, label: pr.name } : ep
        }
        openDirections(resolve(i.to), resolve(i.from))
        break
      }
    }
  }, [onSearch, switchYear, startFilm, openDirections])

  // keyboard
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen((o) => !o) }
      if (e.key === '/' && !searchOpen && (e.target as HTMLElement).tagName !== 'INPUT') { e.preventDefault(); setSearchOpen(true) }
      if (e.key === 'Escape') { setSearchOpen(false); setSel(null); setTouring(false); setCompare(null); if (!engine.current?.isPicking) setDir(null); else engine.current.cancelPick() }
      if (e.key.toLowerCase() === 'm' && (e.target as HTMLElement).tagName !== 'INPUT' && !touring) {
        document.querySelector<HTMLButtonElement>('.orb')?.click()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [searchOpen, touring])

  const ready = phase === 'ready' && !touring && !gallery
  const hoverName = hover && (hover.f.properties.p ? profileMap.get(hover.f.properties.p as string)?.name : (hover.f.properties.n as string | undefined))

  return (
    <div className="app">
      <div className="stars" />
      <div className={`map-wrap ${labelsOn ? '' : 'lbls-off'}`}><div id="map" ref={mapEl} /></div>
      <div className="vignette" />

      {phase === 'loading' && <Loader />}
      {phase === 'intro' && <Intro engine={eng} onSkip={skip} />}
      {phase === 'arrive' && <Arrival stats={stats} onSkip={skip} />}

      <header className={`topbar chrome ${ready ? '' : 'hidden'}`}>
        <div className="brand glass">
          <img src="/logo.png" alt="" />
          <div>
            <div className="t1">MASAR</div>
            <div className="t2">التوأم الرقمي لجامعة سوهاج الجديدة</div>
          </div>
        </div>
        <div className="spacer" />
        <button className="search-btn glass" onClick={() => setSearchOpen(true)}>
          <Search size={18} />
          <span className="lbl-t">ابحث عن كلية، معمل، قاعة…</span>
          <span className="kbd">⌘K</span>
        </button>
        <div className="tools glass">
          <button className={`tool ${dir ? 'on' : ''}`} onClick={() => (dir ? setDir(null) : openDirections())} title="أقصر طريق بين نقطتين">
            <Navigation size={17} /><span className="lbl-t">اتجاهات</span>
          </button>
          <button className="tool gallery-btn" onClick={openGallery} title="معرض الخرائط: أطلس سينمائي لخرائط الحرم">
            <Images size={17} /><span className="lbl-t">المعرض</span>
          </button>
          <button className="tool film-btn" onClick={startFilm} title="الفيلم: جولة سينمائية بالموسيقى والترجمة">
            <Clapperboard size={17} /><span className="lbl-t">شاهد الفيلم</span>
          </button>
          <button className={`tool ${panel === 'stats' ? 'on' : ''}`} onClick={() => { setPanel((p) => (p === 'stats' ? null : 'stats')); setSel(null) }} title="الأرقام">
            <BarChart3 size={17} /><span className="lbl-t">الأرقام</span>
          </button>
          <button className={`tool ${panel === 'layers' ? 'on' : ''}`} onClick={() => setPanel((p) => (p === 'layers' ? null : 'layers'))} title="الطبقات">
            <Layers size={17} /><span className="lbl-t">الطبقات</span>
          </button>
          <button className="tool" onClick={() => setNight((n) => !n)} title={night ? 'وضع النهار' : 'وضع الليل'}>
            {night ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </div>
      </header>

      {ready && panel === 'layers' && current && (
        <LayersPanel fc={current} hidden={hidden} setHidden={setHidden} onClose={() => setPanel(null)} />
      )}
      {ready && panel === 'stats' && stats && !sel && <StatsPanel stats={stats} year={year} onClose={() => setPanel(null)} />}

      {ready && dir && eng && data[2026] && (
        <Directions engine={eng} fc={data[2026]!} profiles={profileMap} from={dir.from} to={dir.to} notice={dir.notice}
          setFrom={(e) => setDir((d) => d && { ...d, from: e, notice: undefined })}
          setTo={(e) => setDir((d) => d && { ...d, to: e, notice: undefined })}
          onClose={() => setDir(null)} />
      )}

      {ready && sel && !dir && (
        <BuildingDrawer
          key={sel.feature.properties.id}
          sel={sel}
          year={year}
          data={data}
          profiles={profileMap}
          onClose={() => setSel(null)}
          onOrbit={() => {
            const e = engine.current!
            if (e.orbiting) e.stopOrbit()
            else e.orbit(centroid(sel.feature.geometry), 10)
          }}
          onProfile={(key) => onSearch({ kind: 'profile', name: key, profile: key })}
          onDirections={() => {
            const f = sel.feature
            const pr = f.properties.p ? profileMap.get(f.properties.p) : undefined
            const fl = sel.room ? pr?.floors.find((x) => x.rooms.includes(sel.room!)) : undefined
            openDirections(endpointFor(f, profileMap, sel.room && fl ? { name: sel.room, floor: fl.floor } : undefined))
          }}
        />
      )}

      {ready && !compare && hover && hoverName && hover.f.properties.id !== sel?.feature.properties.id && (
        <div className="tooltip" style={{ left: hover.x, top: hover.y }}>{hoverName}</div>
      )}

      {ready && compare && eng && (
        <>
          <CompareView main={eng} left={compare} right={year} night={night} hidden={hidden} />
          <CompareBar left={compare} right={year} stats={stats} onLeft={setCompare}
            onRight={(y) => switchYear(y)} onExit={() => setCompare(null)} />
        </>
      )}

      <TimeMachine
        onCompare={enterCompare}
        className={`chrome ${ready && !compare ? '' : 'hidden'}`}
        year={year}
        stats={stats}
        playing={playing}
        onPlay={() => setPlaying((p) => !p)}
        onYear={(y) => { setPlaying(false); switchYear(y) }}
      />

      {ready && <Hud engine={eng} />}

      {phase === 'ready' && touring && filmCtx && <Film ctx={filmCtx} onEnd={endTour} />}

      {ready && (
        <Assistant hidden={!!compare || (narrow && (!!panel || !!sel || !!dir))} onIntent={onIntent} ctx={{ profiles, data, stats, year }} />
      )}

      <AnimatePresence>
        {phase === 'ready' && gallery && <Gallery onClose={() => setGallery(false)} />}
      </AnimatePresence>

      {searchOpen && (
        <SearchPalette profiles={profiles} data={data} year={year} onPick={onSearch} onClose={() => setSearchOpen(false)} />
      )}
    </div>
  )
}
