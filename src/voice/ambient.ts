/**
 * Generative film score made with the Web Audio API — no audio files.
 * A slow minor pad with a breathing filter, a sub drone, random high "stars",
 * plus one-shot whooshes for camera moves and a low hit for chapter titles.
 */
const PAD = [110, 164.81, 220, 246.94, 261.63] // A2 E3 A3 B3 C4
const STARS = [880, 987.77, 1046.5, 1318.5, 1567.98, 1760]

class Ambient {
  private ctx: AudioContext | null = null
  private master!: GainNode
  private music!: GainNode
  private fx!: GainNode
  private verb!: ConvolverNode
  private starTimer = 0
  private nodes: AudioScheduledSourceNode[] = []
  running = false
  muted = false

  private impulse(ctx: AudioContext, seconds = 4.5) {
    const len = ctx.sampleRate * seconds
    const buf = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c)
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6)
    }
    return buf
  }

  start() {
    if (this.running) return
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = (this.ctx = new Ctx())
    const now = ctx.currentTime
    this.master = ctx.createGain()
    this.master.gain.value = 0
    this.master.connect(ctx.destination)
    this.verb = ctx.createConvolver()
    this.verb.buffer = this.impulse(ctx)
    const wet = ctx.createGain(); wet.gain.value = 0.55
    this.verb.connect(wet).connect(this.master)
    this.music = ctx.createGain(); this.music.gain.value = 0.9
    this.music.connect(this.master); this.music.connect(this.verb)
    this.fx = ctx.createGain(); this.fx.gain.value = 0.8
    this.fx.connect(this.master); this.fx.connect(this.verb)

    // pad
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'; filter.frequency.value = 700; filter.Q.value = 0.7
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.045
    const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 380
    lfo.connect(lfoAmt).connect(filter.frequency); lfo.start()
    this.nodes.push(lfo)
    const padGain = ctx.createGain(); padGain.gain.value = 0.05
    filter.connect(padGain).connect(this.music)
    PAD.forEach((f, i) => {
      for (const det of [-7, 6]) {
        const o = ctx.createOscillator()
        o.type = i < 2 ? 'sawtooth' : 'triangle'
        o.frequency.value = f
        o.detune.value = det + (Math.random() * 4 - 2)
        o.connect(filter); o.start(now); this.nodes.push(o)
      }
    })
    // sub
    const sub = ctx.createOscillator(); sub.frequency.value = 55
    const subG = ctx.createGain(); subG.gain.value = 0.06
    sub.connect(subG).connect(this.music); sub.start(); this.nodes.push(sub)

    this.master.gain.linearRampToValueAtTime(this.muted ? 0 : 0.55, now + 4)
    this.running = true
    this.scheduleStar()
  }

  private scheduleStar() {
    this.starTimer = window.setTimeout(() => { this.star(); this.scheduleStar() }, 2200 + Math.random() * 3800)
  }

  star() {
    const ctx = this.ctx; if (!ctx) return
    const t = ctx.currentTime
    const o = ctx.createOscillator(); o.type = 'sine'
    o.frequency.value = STARS[Math.floor(Math.random() * STARS.length)]
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.025, t + 0.04)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2)
    o.connect(g).connect(this.fx); o.start(t); o.stop(t + 3.3)
  }

  whoosh(ms = 1800) {
    const ctx = this.ctx; if (!ctx) return
    const t = ctx.currentTime, d = ms / 1000
    const buf = ctx.createBuffer(1, ctx.sampleRate * d, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource(); src.buffer = buf
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2
    bp.frequency.setValueAtTime(180, t)
    bp.frequency.exponentialRampToValueAtTime(2600, t + d * 0.55)
    bp.frequency.exponentialRampToValueAtTime(400, t + d)
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.22, t + d * 0.5)
    g.gain.linearRampToValueAtTime(0, t + d)
    src.connect(bp).connect(g).connect(this.fx); src.start(t)
  }

  hit() {
    const ctx = this.ctx; if (!ctx) return
    const t = ctx.currentTime
    const o = ctx.createOscillator(); o.type = 'sine'
    o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(32, t + 1.4)
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2)
    o.connect(g).connect(this.fx); o.start(t); o.stop(t + 2.3)
    // shimmer on top
    ;[1318.5, 1975.5].forEach((f, i) => {
      const s = ctx.createOscillator(); s.frequency.value = f
      const sg = ctx.createGain(); sg.gain.setValueAtTime(0, t)
      sg.gain.linearRampToValueAtTime(0.02, t + 0.05 + i * 0.08)
      sg.gain.exponentialRampToValueAtTime(0.0001, t + 3)
      s.connect(sg).connect(this.fx); s.start(t); s.stop(t + 3.1)
    })
  }

  /** lower the music while the narrator talks */
  duck(on: boolean) {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    this.music.gain.cancelScheduledValues(t)
    this.music.gain.linearRampToValueAtTime(on ? 0.4 : 0.9, t + 0.6)
  }

  setMuted(m: boolean) {
    this.muted = m
    if (!this.ctx) return
    const t = this.ctx.currentTime
    this.master.gain.cancelScheduledValues(t)
    this.master.gain.linearRampToValueAtTime(m ? 0 : 0.55, t + 0.5)
  }

  stop() {
    const ctx = this.ctx
    if (!ctx) return
    clearTimeout(this.starTimer)
    const t = ctx.currentTime
    this.master.gain.cancelScheduledValues(t)
    this.master.gain.setValueAtTime(this.master.gain.value, t)
    this.master.gain.linearRampToValueAtTime(0, t + 2.5)
    const nodes = this.nodes
    this.nodes = []
    this.running = false
    this.ctx = null
    window.setTimeout(() => { nodes.forEach((n) => { try { n.stop() } catch { /* already stopped */ } }); ctx.close() }, 2700)
  }
}

export const ambient = new Ambient()
