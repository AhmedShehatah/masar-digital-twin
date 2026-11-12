import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Mic, Send, X, Volume2, VolumeX } from 'lucide-react'
import { narrator } from '../voice/narrator'
import { understand, type Intent, type IntentCtx } from '../voice/intents'

type Rec = {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number
  start(): void; stop(): void; abort(): void
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
}
const RecCtor: (new () => Rec) | undefined =
  typeof window !== 'undefined'
    ? ((window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => Rec }).webkitSpeechRecognition)
    : undefined

const SUGGEST = ['خذني إلى كلية الهندسة', 'أين معمل 309؟', 'اعرض الحرم في 2011', 'كم عمود إنارة؟', 'شغّل وضع الليل', 'ابدأ الجولة']

interface Msg { who: 'me' | 'masar'; text: string }

export function Assistant({ ctx, onIntent, hidden }: { ctx: IntentCtx; onIntent: (i: Intent) => void; hidden: boolean }) {
  const [open, setOpen] = useState(false)
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [input, setInput] = useState('')
  const [msgs, setMsgs] = useState<Msg[]>([{ who: 'masar', text: 'أهلًا، أنا مساعد مسار. اسألني بصوتك أو اكتب سؤالك.' }])
  const [speaking, setSpeaking] = useState(false)
  const [voiceOn, setVoiceOn] = useState(false)
  const rec = useRef<Rec | null>(null)
  const ctxRef = useRef(ctx)
  ctxRef.current = ctx
  const list = useRef<HTMLDivElement>(null)

  useEffect(() => narrator.onSpeaking(setSpeaking), [])
  useEffect(() => { list.current?.scrollTo({ top: 1e6, behavior: 'smooth' }) }, [msgs, interim])

  const handle = (text: string) => {
    const q = text.trim()
    if (!q) return
    const intent = understand(q, ctxRef.current)
    setMsgs((m) => [...m, { who: 'me', text: q }, { who: 'masar', text: intent.reply }])
    if (voiceOn) { narrator.setMuted(false); narrator.speak(intent.reply) }
    onIntent(intent)
  }

  const listen = () => {
    if (!RecCtor) { setMsgs((m) => [...m, { who: 'masar', text: 'التعرف على الصوت غير متاح في هذا المتصفح؛ اكتب سؤالك بالأسفل (يعمل في Chrome وEdge وSafari).' }]); return }
    if (listening) { rec.current?.stop(); return }
    narrator.cancel()
    const r = new RecCtor()
    r.lang = 'ar-EG'; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1
    let finalText = ''
    r.onresult = (e) => {
      let t = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        if (res.isFinal) finalText += res[0].transcript
        else t += res[0].transcript
      }
      setInterim(finalText || t)
    }
    r.onerror = (e) => {
      if (e.error === 'not-allowed') setMsgs((m) => [...m, { who: 'masar', text: 'اسمح للمتصفح باستخدام الميكروفون ثم حاول مرة أخرى.' }])
    }
    r.onend = () => {
      setListening(false); setInterim('')
      if (finalText) handle(finalText)
    }
    rec.current = r
    setListening(true)
    try { r.start() } catch { setListening(false) }
  }

  useEffect(() => () => rec.current?.abort(), [])

  if (hidden) return null
  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.section className="assistant glass" initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.97 }} transition={{ type: 'spring', stiffness: 300, damping: 28 }}>
            <header>
              <div className={`mini-orb ${speaking ? 'talk' : ''} ${listening ? 'listen' : ''}`} />
              <div>
                <b>مساعد مسار</b>
                <small>{listening ? 'أستمع إليك…' : speaking ? 'يتحدث…' : 'اسأل بصوتك أو اكتب'}</small>
              </div>
              <button className="tool" onClick={() => { const v = !voiceOn; setVoiceOn(v); if (!v) narrator.cancel() }} title="صوت الردود">{voiceOn ? <Volume2 size={16} /> : <VolumeX size={16} />}</button>
              <button className="tool" onClick={() => { setOpen(false); rec.current?.abort(); narrator.cancel() }}><X size={16} /></button>
            </header>
            <div className="msgs" ref={list}>
              {msgs.map((m, i) => <div key={i} className={`msg ${m.who}`}>{m.text}</div>)}
              {interim && <div className="msg me interim">{interim}</div>}
            </div>
            {msgs.length < 3 && (
              <div className="sugg">{SUGGEST.map((s) => <button key={s} onClick={() => handle(s)}>{s}</button>)}</div>
            )}
            <form className="ask" onSubmit={(e) => { e.preventDefault(); handle(input); setInput('') }}>
              <button type="button" className={`mic ${listening ? 'on' : ''}`} onClick={listen} title="تحدّث"><Mic size={18} /></button>
              <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="اكتب: أين كلية الصيدلة؟" />
              <button type="submit" className="send" disabled={!input.trim()}><Send size={16} style={{ transform: 'scaleX(-1)' }} /></button>
            </form>
          </motion.section>
        )}
      </AnimatePresence>
      <button className={`orb ${open ? 'open' : ''} ${listening ? 'listen' : ''} ${speaking ? 'talk' : ''}`}
        onClick={() => { if (!open) { setOpen(true) } else listen() }} title="المساعد الصوتي" aria-label="المساعد الصوتي">
        <span className="core" />
        <Mic size={20} className="ic" />
      </button>
    </>
  )
}
