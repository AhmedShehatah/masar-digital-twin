/**
 * Music for the opening sequence: a recorded track (public/audio/intro.m4a) played with the Web Audio API.
 *
 * There is no "enter with sound" step: the intro always plays with music. Browsers, though, only let a
 * page make sound once the visitor has interacted with it, so:
 *   - if the browser already allows sound (e.g. Chrome for a site the visitor uses often), the music
 *     starts with the intro;
 *   - otherwise it starts on the visitor's first click, tap or key press anywhere, at the point the intro
 *     has reached, so music and picture stay in step.
 *
 *   prepare()  on page load: create the audio context, start downloading and decoding the track,
 *              and listen for the first interaction
 *   start()    when the intro starts
 *   finish()   when the intro hands over to the map: a slow fade-out (the track is longer than the intro)
 *   stop()     when the visitor skips the intro: a quick fade-out
 */

const SRC = '/audio/intro.m4a'
const VOLUME = 0.8
const FADE_IN = 0.4
const GESTURES = ['pointerdown', 'keydown', 'touchstart'] as const

class IntroMusic {
  private ctx: AudioContext | null = null
  private gain: GainNode | null = null
  private track: Promise<AudioBuffer | null> | null = null
  private src: AudioBufferSourceNode | null = null
  private startedAt = 0 // performance.now() when the intro started; 0 = not started yet

  /** true between prepare() and finish() / stop() */
  get active() { return !!this.ctx }

  prepare() {
    if (this.ctx) return
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = (this.ctx = new Ctx())
    this.gain = ctx.createGain()
    this.gain.gain.value = 0
    this.gain.connect(ctx.destination)
    this.track = fetch(SRC)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${SRC}: ${r.status}`))))
      .then((b) => ctx.decodeAudioData(b))
      .catch(() => null) // no music is better than a broken intro
    void ctx.resume().catch(() => undefined) // allowed straight away only if the browser permits autoplay
    ctx.addEventListener('statechange', this.onState)
    for (const g of GESTURES) window.addEventListener(g, this.onGesture, { capture: true, passive: true })
  }

  /** the intro starts: play now if sound is allowed, otherwise as soon as it is */
  async start() {
    if (!this.ctx || this.startedAt) return
    this.startedAt = performance.now()
    await this.play()
  }

  /** a click / tap / key press is what unlocks sound in the browser */
  private onGesture = (e: Event) => {
    // a click on "skip intro" fades the music out anyway, so it shouldn't start it
    if ((e.target as Element | null)?.closest?.('.skip')) return
    void this.ctx?.resume().catch(() => undefined)
  }

  private onState = () => { void this.play() }

  /** start the track if the intro has started and sound is allowed, at the point the intro has reached */
  private async play() {
    const ctx = this.ctx, gain = this.gain
    if (!ctx || !gain || !this.startedAt || this.src || ctx.state !== 'running') return
    const buf = await this.track
    if (!buf || this.ctx !== ctx || this.src) return // no track, or finished / skipped while loading
    const offset = (performance.now() - this.startedAt) / 1000
    if (offset >= buf.duration) return
    const src = (this.src = ctx.createBufferSource())
    src.buffer = buf
    src.connect(gain)
    const t = ctx.currentTime
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(VOLUME, t + FADE_IN)
    src.start(t, offset)
    this.unlisten()
  }

  private unlisten() {
    for (const g of GESTURES) window.removeEventListener(g, this.onGesture, { capture: true })
    this.ctx?.removeEventListener('statechange', this.onState)
  }

  /** the intro is over: fade out slowly */
  finish(fadeMs = 3000) { this.release(fadeMs) }

  /** the visitor skipped: fade out quickly */
  stop() { this.release(700) }

  private release(fadeMs: number) {
    const ctx = this.ctx, gain = this.gain, src = this.src
    if (!ctx || !gain) return
    this.unlisten()
    this.ctx = null; this.gain = null; this.src = null; this.track = null; this.startedAt = 0
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
