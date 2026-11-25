/**
 * Music for the opening sequence: a recorded track (public/audio/intro.m4a) played with the Web Audio API.
 *
 *   unlock()   on the "enter with sound" click: browsers only allow sound after a click, so the audio
 *              context is created here, and the track starts downloading and decoding
 *   start()    when the intro starts: a short fade-in
 *   finish()   when the intro hands over to the map: a slow fade-out (the track is longer than the intro)
 *   stop()     when the visitor skips the intro: a quick fade-out
 */

const SRC = '/audio/intro.m4a'
const VOLUME = 0.8
const FADE_IN = 0.4

class IntroMusic {
  private ctx: AudioContext | null = null
  private gain: GainNode | null = null
  private track: Promise<AudioBuffer | null> | null = null
  private src: AudioBufferSourceNode | null = null

  /** true between unlock() and finish() / stop() */
  get active() { return !!this.ctx }

  unlock() {
    if (this.ctx) return
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = (this.ctx = new Ctx())
    void ctx.resume()
    this.gain = ctx.createGain()
    this.gain.gain.value = 0
    this.gain.connect(ctx.destination)
    this.track = fetch(SRC)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${SRC}: ${r.status}`))))
      .then((b) => ctx.decodeAudioData(b))
      .catch(() => null) // no music is better than a broken intro
  }

  /** play from the top; if the track is still loading, it starts as soon as it is ready */
  async start() {
    const ctx = this.ctx, gain = this.gain
    if (!ctx || !gain || this.src) return
    const buf = await this.track
    if (!buf || this.ctx !== ctx) return // no track, or finished / skipped while loading
    const src = (this.src = ctx.createBufferSource())
    src.buffer = buf
    src.connect(gain)
    const t = ctx.currentTime
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(VOLUME, t + FADE_IN)
    src.start(t)
  }

  /** the intro is over: fade out slowly */
  finish(fadeMs = 3000) { this.release(fadeMs) }

  /** the visitor skipped: fade out quickly */
  stop() { this.release(700) }

  private release(fadeMs: number) {
    const ctx = this.ctx, gain = this.gain, src = this.src
    if (!ctx || !gain) return
    this.ctx = null; this.gain = null; this.src = null; this.track = null
    const t = ctx.currentTime
    gain.gain.cancelScheduledValues(t)
    gain.gain.setValueAtTime(gain.gain.value, t)
    gain.gain.linearRampToValueAtTime(0, t + fadeMs / 1000)
    window.setTimeout(() => {
      try { src?.stop() } catch { /* already stopped */ }
      void ctx.close()
    }, fadeMs + 100)
  }
}

export const introMusic = new IntroMusic()
