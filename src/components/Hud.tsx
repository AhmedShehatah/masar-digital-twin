import { Plus, Minus, Navigation2, Maximize } from 'lucide-react'
import { useCam } from '../useCam'
import type { CampusEngine } from '../map/engine'

export function Hud({ engine }: { engine: CampusEngine | null }) {
  const cam = useCam(engine)
  return (
    <div className="hud">
      <div className="ctrls glass">
        <button className="tool" onClick={() => engine?.zoomBy(1)} title="تقريب"><Plus size={17} /></button>
        <button className="tool" onClick={() => engine?.zoomBy(-1)} title="تبعيد"><Minus size={17} /></button>
        <button className="tool" onClick={() => engine?.resetNorth()} title="الشمال">
          <Navigation2 size={17} className="compass" style={{ transform: `rotate(${-cam.bearing}deg)` }} />
        </button>
        <button className="tool" onClick={() => engine?.overview()} title="الحرم كاملًا"><Maximize size={16} /></button>
      </div>
      <div className="coords glass">
        <div><b>{cam.lat.toFixed(5)}</b>°N &nbsp; <b>{cam.lng.toFixed(5)}</b>°E</div>
        <div>Z <b>{cam.zoom.toFixed(1)}</b> · PITCH <b>{cam.pitch.toFixed(0)}°</b> · BRG <b>{((cam.bearing + 360) % 360).toFixed(0)}°</b></div>
      </div>
    </div>
  )
}
