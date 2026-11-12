import { useEffect, useState } from 'react'
import type { CampusEngine } from './map/engine'

export interface Cam { lng: number; lat: number; zoom: number; bearing: number; pitch: number }

/** live camera readout, subscribed directly to the map so the rest of the app does not re-render per frame */
export function useCam(engine: CampusEngine | null): Cam {
  const [cam, setCam] = useState<Cam>({ lng: 28, lat: 24, zoom: 1.6, bearing: 0, pitch: 0 })
  useEffect(() => {
    if (!engine) return
    const m = engine.map
    let raf = 0
    const h = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const c = m.getCenter()
        setCam({ lng: c.lng, lat: c.lat, zoom: m.getZoom(), bearing: m.getBearing(), pitch: m.getPitch() })
      })
    }
    m.on('move', h)
    h()
    return () => { m.off('move', h); cancelAnimationFrame(raf) }
  }, [engine])
  return cam
}
