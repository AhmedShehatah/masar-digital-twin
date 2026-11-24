import type { Dispatch, SetStateAction } from 'react'
import {
  SEASON_LABEL, rasterFrame, rasterYears,
  type AnalysisIndex, type AnalysisState, type Legend, type Season, type Year,
} from '../data'

function LegendView({ legend }: { legend: Legend }) {
  if (legend.classes) {
    return (
      <div className="ana-classes">
        {legend.classes.map(([c, l]) => <span key={l}><i style={{ background: c }} />{l}</span>)}
      </div>
    )
  }
  if (!legend.ramp) return null
  return (
    <div className="ana-ramp">
      <div className="bar" style={{ background: `linear-gradient(to left, ${legend.ramp.join(', ')})` }} />
      {(legend.lo || legend.hi) && <div className="ends"><span>{legend.lo}</span><span>{legend.hi}</span></div>}
    </div>
  )
}

const swatch = (l: Legend) =>
  l.ramp ? `linear-gradient(135deg, ${l.ramp.join(', ')})` : `linear-gradient(135deg, ${l.classes!.map((c) => c[0]).join(', ')})`

export function AnalysisSection({ index, state, setState, year, onYear }: {
  index: AnalysisIndex
  state: AnalysisState
  setState: Dispatch<SetStateAction<AnalysisState>>
  year: Year
  onYear: (y: Year) => void
}) {
  const active = index.rasters.find((r) => r.id === state.raster)
  const frame = active && rasterFrame(active, year, state.season)
  const years = active?.byYear ? rasterYears(active) : []
  const toggleVector = (id: string) =>
    setState((s) => ({ ...s, vectors: s.vectors.includes(id) ? s.vectors.filter((v) => v !== id) : [...s.vectors, id] }))

  return (
    <>
      <div className="group-t">التحليلات المكانية · صور</div>
      <div className="ana-grid">
        {index.rasters.map((r) => (
          <button key={r.id} className={`ana-pill ${state.raster === r.id ? 'on' : ''}`} title={r.sub}
            onClick={() => setState((s) => ({ ...s, raster: s.raster === r.id ? null : r.id }))}>
            <i style={{ background: swatch(r.legend) }} />{r.label}
          </button>
        ))}
      </div>

      {active && (
        <div className="ana-card">
          <div className="ana-t">{active.label}<span>{active.sub}</span></div>
          {active.seasons && (
            <div className="ana-seg">
              {active.seasons.map((s: Season) => (
                <button key={s} className={state.season === s ? 'on' : ''} onClick={() => setState((st) => ({ ...st, season: s }))}>
                  {SEASON_LABEL[s]}
                </button>
              ))}
            </div>
          )}
          {active.byYear && !frame ? (
            <div className="ana-miss">
              لا تتوفر بيانات لعام <b className="num">{year}</b>. انتقل إلى:
              <span className="ana-years">
                {years.map((y) => <button key={y} className="num" onClick={() => onYear(y as Year)}>{y}</button>)}
              </span>
            </div>
          ) : (
            <>
              <LegendView legend={active.legend} />
              <div className="ana-foot">
                <span className="num">{active.byYear ? `${year}${active.seasons ? ` · ${SEASON_LABEL[state.season]}` : ''}` : 'ثابتة'}</span>
                {active.byYear && <span>تتبع شريط الزمن</span>}
              </div>
            </>
          )}
          <label className="ana-op">
            <span>الشفافية</span>
            <input type="range" min={0.2} max={1} step={0.05} value={state.opacity}
              onChange={(e) => setState((s) => ({ ...s, opacity: Number(e.target.value) }))} />
          </label>
        </div>
      )}

      <div className="group-t">التحليلات المكانية · شبكات ومياه</div>
      {index.vectors.map((v) => {
        const on = state.vectors.includes(v.id)
        return (
          <div key={v.id}>
            <button className={`chip ${on ? '' : 'off'}`} onClick={() => toggleVector(v.id)} title={v.sub}>
              <span className="dot" style={{ background: v.legend.classes?.[0][0], color: v.legend.classes?.[0][0] }} />
              {v.label}
            </button>
            {on && (
              <div className="ana-vec">
                <div className="sub">{v.sub}</div>
                <LegendView legend={v.legend} />
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}
