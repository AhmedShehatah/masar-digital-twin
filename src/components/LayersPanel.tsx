import { X, Eye, EyeOff } from 'lucide-react'
import type { Dispatch, SetStateAction } from 'react'
import { CAT_META, fmt, type AnalysisIndex, type AnalysisState, type Campus, type Cat, type Year } from '../data'
import { AnalysisSection } from './AnalysisSection'
import { BASEMAPS, type BasemapId } from '../map/basemaps'

const GROUPS: { key: 'build' | 'infra' | 'land'; title: string }[] = [
  { key: 'build', title: 'المباني والمنشآت' },
  { key: 'infra', title: 'البنية التحتية' },
  { key: 'land', title: 'الأرض والمساحات' },
]

export function LayersPanel({ fc, hidden, setHidden, onClose, basemap, setBasemap, analysis, ana, setAna, year, onYear }: {
  fc: Campus; hidden: Cat[]; setHidden: (h: Cat[]) => void; onClose: () => void
  basemap: BasemapId; setBasemap: (b: BasemapId) => void
  analysis: AnalysisIndex | null; ana: AnalysisState; setAna: Dispatch<SetStateAction<AnalysisState>>
  year: Year; onYear: (y: Year) => void
}) {
  const counts = new Map<Cat, number>()
  fc.features.forEach((f) => counts.set(f.properties.c, (counts.get(f.properties.c) ?? 0) + 1))
  const toggle = (c: Cat) => setHidden(hidden.includes(c) ? hidden.filter((x) => x !== c) : [...hidden, c])
  const allOn = hidden.length === 0
  return (
    <aside className="layers glass">
      <div className="panel-h">
        <h3>الطبقات</h3>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="tool" onClick={() => setHidden(allOn ? (Object.keys(CAT_META) as Cat[]) : [])} title={allOn ? 'إخفاء الكل' : 'إظهار الكل'}>
            {allOn ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
          <button className="tool" onClick={onClose}><X size={16} /></button>
        </div>
      </div>
      <div className="group-t">الخريطة الأساسية</div>
      <div className="ana-grid">
        {BASEMAPS.map((b) => (
          <button key={b.id} className={`ana-pill ${basemap === b.id ? 'on' : ''}`} aria-pressed={basemap === b.id} onClick={() => setBasemap(b.id)}>
            <i style={{ background: b.swatch }} /><span className="pill-t">{b.label}</span>
          </button>
        ))}
      </div>
      {GROUPS.map((g) => {
        const cats = (Object.keys(CAT_META) as Cat[]).filter((c) => CAT_META[c].group === g.key && counts.get(c))
        if (!cats.length) return null
        return (
          <div key={g.key}>
            <div className="group-t">{g.title}</div>
            {cats.map((c) => (
              <button key={c} className={`chip ${hidden.includes(c) ? 'off' : ''}`} onClick={() => toggle(c)}>
                <span className="dot" style={{ background: CAT_META[c].color, color: CAT_META[c].color }} />
                {CAT_META[c].label}
                <span className="cnt">{fmt(counts.get(c) ?? 0)}</span>
              </button>
            ))}
          </div>
        )
      })}
      {analysis && <AnalysisSection index={analysis} state={ana} setState={setAna} year={year} onYear={onYear} />}
    </aside>
  )
}
