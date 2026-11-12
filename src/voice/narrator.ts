/**
 * Arabic narrator on top of the browser's speech synthesis.
 * - picks the best Arabic voice available (Egyptian first)
 * - speaks sentence by sentence (Chrome cuts long utterances)
 * - reports word progress so subtitles can follow the voice
 * - when muted or no Arabic voice exists, it "speaks" silently on a timer so
 *   the film keeps the same rhythm
 */
type Listener = (speaking: boolean) => void

const synth: SpeechSynthesis | undefined = typeof window !== 'undefined' ? window.speechSynthesis : undefined

function pickVoice(): SpeechSynthesisVoice | null {
  const vs = synth?.getVoices() ?? []
  const ar = vs.filter((v) => v.lang.toLowerCase().startsWith('ar'))
  return (
    ar.find((v) => /ar-eg/i.test(v.lang)) ||
    ar.find((v) => /google/i.test(v.name)) ||
    ar.find((v) => /ar-sa/i.test(v.lang)) ||
    ar.find((v) => /majed|maged|tarik|hamed/i.test(v.name)) ||
    ar[0] ||
    null
  )
}

/** comfortable on-screen reading time for subtitles without a voice */
export const READ_MS_PER_WORD = 560
export function readMs(text: string) {
  return text.trim().split(/\s+/).length * READ_MS_PER_WORD + 900
}

export function estimateMs(text: string, rate = 1) {
  const words = text.trim().split(/\s+/).length
  return (words * 430 + 600) / rate
}

class Narrator {
  muted = false
  rate = 0.98
  private voice: SpeechSynthesisVoice | null = null
  private listeners = new Set<Listener>()
  private token = 0
  private silentTimer = 0
  private paused = false

  constructor() {
    if (!synth) return
    this.voice = pickVoice()
    synth.addEventListener?.('voiceschanged', () => { this.voice = pickVoice() })
  }

  get hasVoice() { return !!synth && !!(this.voice ?? pickVoice()) }

  onSpeaking(l: Listener) { this.listeners.add(l); return () => { this.listeners.delete(l) } }
  private emit(s: boolean) { this.listeners.forEach((l) => l(s)) }

  /** speak text; onWord receives the index of the word being spoken */
  speak(text: string, onWord?: (i: number) => void): Promise<void> {
    this.cancel()
    const my = ++this.token
    const words = text.trim().split(/\s+/)
    if (this.muted || !this.hasVoice) return this.silent(words, my, onWord)

    this.voice = this.voice ?? pickVoice()
    // sentence chunks, keeping a running word offset for subtitles
    const chunks = text.match(/[^.!؟?]+[.!؟?]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [text]
    let offset = 0
    this.emit(true)
    return chunks.reduce<Promise<void>>((p, chunk) => p.then(() => new Promise<void>((res) => {
      if (my !== this.token) return res()
      const base = offset
      const chunkWords = chunk.split(/\s+/)
      offset += chunkWords.length
      const u = new SpeechSynthesisUtterance(chunk)
      if (this.voice) u.voice = this.voice
      u.lang = this.voice?.lang ?? 'ar-EG'
      u.rate = this.rate
      u.pitch = 0.95
      // word boundaries (not every voice fires them) + a timed fallback
      let last = base
      onWord?.(base)
      const step = estimateMs(chunk, this.rate) / chunkWords.length
      let fallback = window.setInterval(() => { if (!this.paused && last < base + chunkWords.length - 1) onWord?.(++last) }, step)
      u.onboundary = (e) => {
        if (e.name && e.name !== 'word') return
        clearInterval(fallback); fallback = 0
        const before = chunk.slice(0, e.charIndex).trim()
        last = base + (before ? before.split(/\s+/).length : 0)
        onWord?.(last)
      }
      const done = () => { clearInterval(fallback); onWord?.(base + chunkWords.length - 1); res() }
      u.onend = done
      u.onerror = done
      synth!.speak(u)
    })), Promise.resolve()).then(() => { if (my === this.token) this.emit(false) })
  }

  /** subtitles only: reveal words at reading pace, no voice */
  caption(text: string, onWord?: (i: number) => void): Promise<void> {
    this.cancel()
    const my = ++this.token
    return this.silent(text.trim().split(/\s+/), my, onWord, READ_MS_PER_WORD)
  }

  private silent(words: string[], my: number, onWord?: (i: number) => void, perWord?: number): Promise<void> {
    return new Promise((res) => {
      let i = 0
      onWord?.(0)
      this.silentDone = res
      const step = perWord ?? estimateMs(words.join(' '), this.rate) / words.length
      const tick = () => {
        if (my !== this.token) return res()
        if (this.paused) { this.silentTimer = window.setTimeout(tick, 120); return }
        i++
        if (i >= words.length) return res()
        onWord?.(i)
        this.silentTimer = window.setTimeout(tick, step)
      }
      this.silentTimer = window.setTimeout(tick, step)
    })
  }

  pause() { this.paused = true; synth?.pause() }
  resume() { this.paused = false; synth?.resume() }

  private silentDone: (() => void) | null = null

  cancel() {
    this.token++
    this.paused = false
    clearTimeout(this.silentTimer)
    // finish any timer-driven subtitles right away so whoever awaits them moves on
    const done = this.silentDone
    this.silentDone = null
    done?.()
    if (synth?.speaking || synth?.pending) synth.cancel()
    this.emit(false)
  }

  setMuted(m: boolean) {
    this.muted = m
    if (m && synth?.speaking) synth.cancel()
  }
}

export const narrator = new Narrator()
