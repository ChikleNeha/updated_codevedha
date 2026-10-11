import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Mic, Volume2 } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { waitUntilDone } from '../hooks/useTTS'
import { browserSpeak, browserStop, preloadVoices } from '../utils/browserTTS'
import { classifyYesNo } from '../utils/voiceCommands'
import { BLOCKED, micProblem } from '../utils/micErrors'
import { createUser } from '../utils/api'

const DEFAULT_NAME = 'Learner'

const FIRST_INTRO =
  'I am a voice based tutor that teaches you Python, step by step. ' +
  'You can use it without a mouse and without looking at the screen. ' +
  'I will read each lesson aloud. To ask a question, press the J key or the F key, then speak. ' +
  'Press Escape at any time to stop me. After lessons, you can take a short quiz and answer it by voice.'
const CONTRAST_Q =
  'If you have limited or poor vision, I can switch to a high contrast display, with bright yellow text on black. ' +
  'Do you want high contrast? Say yes or no.'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function cleanName(text) {
  const t = (text || '')
    .replace(/^(hi|hello|hey)[, ]*/i, '')
    .replace(/^(my name is|i am|i'm|this is|it is|it's|mera naam|main)\s+/i, '')
    .replace(/[^\p{L}\p{N} '.]/gu, '')
    .trim()
    .slice(0, 40)
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : ''
}

function Wave() {
  return (
    <span className="wave" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className="wave-bar" />
      ))}
    </span>
  )
}

export default function HomePage() {
  const { setUsername, sessionId, tts, stt, setContrast } = useApp()
  const navigate = useNavigate()
  const [phase, setPhase] = useState('starting') // starting, gate, speaking, listening, done
  const [label, setLabel] = useState('')
  const [typed, setTyped] = useState('')
  const aliveRef = useRef(true)
  const abortedRef = useRef(false)
  const startedRef = useRef(false)
  const phaseRef = useRef('starting')
  const inputRef = useRef(null)

  const go = (p) => {
    phaseRef.current = p
    setPhase(p)
  }
  const live = () => aliveRef.current && !abortedRef.current

  const say = async (text) => {
    setLabel(text)
    go('speaking')
    await tts.speak(text)
    await waitUntilDone(40000)
    await sleep(350)
  }

  const ask = async (opts) => {
    if (!live()) return { text: '', error: 'cancelled' }
    go('listening')
    const r = await stt.listen(opts)
    if (live()) go('speaking')
    return r
  }

  const finish = async (name) => {
    go('done')
    try {
      await createUser(name, sessionId)
    } catch {
      /* backend offline: the name is still saved on this device */
    }
    setUsername(name)
    navigate('/learn')
  }

  const blockedMessage = async (reason) => {
    await say(
      `${micProblem(reason) || 'I cannot use the microphone.'} Please type your name in the box and press Enter. ` +
        'You can press Alt and C at any time to change contrast.'
    )
    inputRef.current?.focus()
  }

  const runScript = async (welcomed) => {
    if (startedRef.current) return
    startedRef.current = true
    const first = !localStorage.getItem('ac_intro_done')

    if (!welcomed) await say('Welcome to CodeVedha.')
    if (!live()) return
    await say(first ? FIRST_INTRO : 'Good to see you again.')

    if (first) {
      for (let i = 0; i < 2 && live(); i++) {
        await say(i === 0 ? CONTRAST_Q : 'Please say yes or no. Do you want high contrast?')
        const r = await ask({ silenceMs: 1200, maxWaitMs: 7000 })
        if (!live() || r.error === 'cancelled') return
        if (BLOCKED.includes(r.error)) return blockedMessage(r.error)
        const yn = classifyYesNo(r.text)
        if (yn) {
          setContrast(yn === 'yes')
          await say(
            yn === 'yes'
              ? 'High contrast is on. You can change it at any time by pressing Alt and C.'
              : 'Okay, I will keep the normal display. You can press Alt and C at any time for high contrast.'
          )
          break
        }
      }
      localStorage.setItem('ac_intro_done', '1')
    }

    let name = ''
    for (let attempt = 0; attempt < 3 && !name && live(); attempt++) {
      await say(attempt === 0 ? 'Now, please tell me your name.' : 'Please say your name again.')
      const r = await ask({ silenceMs: 1500, maxWaitMs: 7000 })
      if (!live() || r.error === 'cancelled') return
      if (BLOCKED.includes(r.error)) return blockedMessage(r.error)

      const cleaned = cleanName(r.text)
      if (cleaned) {
        await say(`I heard ${cleaned}. Is that right? Say yes or no.`)
        const c = await ask({ silenceMs: 1100, maxWaitMs: 6000 })
        if (!live() || c.error === 'cancelled') return
        if (classifyYesNo(c.text) === 'no') continue
        name = cleaned
      } else {
        await say(
          `I could not hear a name. Do you want to try again? Say yes to try again, or say no to continue with the default name ${DEFAULT_NAME}.`
        )
        const c = await ask({ silenceMs: 1200, maxWaitMs: 6000 })
        if (!live() || c.error === 'cancelled') return
        const yn = classifyYesNo(c.text)
        if (yn === 'yes') continue
        const maybeName = !yn ? cleanName(c.text) : ''
        name = maybeName || DEFAULT_NAME
        if (!maybeName) await say(`Okay, continuing with the name ${DEFAULT_NAME}.`)
      }
    }
    if (!live()) return
    if (!name) {
      await say(`Continuing with the default name ${DEFAULT_NAME}.`)
      name = DEFAULT_NAME
    }
    if (!live()) return
    await say(`Welcome, ${name}. Let us begin.`)
    finish(name)
  }

  // Try to start by itself. Browsers may refuse to speak before the first key press or click,
  // so if the very first sentence is blocked, wait for any key or click instead.
  useEffect(() => {
    aliveRef.current = true
    preloadVoices()
    let gestureHandler = null

    const probe = () =>
      new Promise((resolve) => {
        const timer = setTimeout(() => resolve(false), 1500)
        browserSpeak('Welcome to CodeVedha.', () => {}, 1, {
          onStart: () => {
            clearTimeout(timer)
            resolve(true)
          },
          onError: () => {
            clearTimeout(timer)
            resolve(false)
          },
        })
      })

    ;(async () => {
      const ok = await probe()
      if (!aliveRef.current) return
      if (ok) {
        await waitUntilDone(8000)
        runScript(true)
      } else {
        browserStop() // do not let a queued greeting play late and overlap
        go('gate')
        gestureHandler = (e) => {
          if (e.key === 'Escape') return
          window.removeEventListener('keydown', gestureHandler, true)
          window.removeEventListener('click', gestureHandler, true)
          runScript(false)
        }
        window.addEventListener('keydown', gestureHandler, true)
        window.addEventListener('click', gestureHandler, true)
      }
    })()

    return () => {
      aliveRef.current = false
      if (gestureHandler) {
        window.removeEventListener('keydown', gestureHandler, true)
        window.removeEventListener('click', gestureHandler, true)
      }
      tts.stop()
      stt.cancelListening()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Space or Enter while the microphone is open means "I have finished speaking".
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON' || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'Escape') {
        tts.stop()
        return
      }
      if (phaseRef.current === 'listening' && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault()
        stt.stopListening()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stt, tts])

  const submitTyped = (e) => {
    e.preventDefault()
    abortedRef.current = true
    tts.stop()
    stt.cancelListening()
    localStorage.setItem('ac_intro_done', '1')
    finish(cleanName(typed) || DEFAULT_NAME)
  }

  const srStatus =
    phase === 'gate'
      ? 'Welcome to CodeVedha. Press any key to begin.'
      : phase === 'listening'
        ? 'Listening. Speak now, then pause. Press Space if you have finished.'
        : phase === 'speaking'
          ? 'CodeVedha is speaking.'
          : phase === 'done'
            ? 'Opening your lessons.'
            : ''

  return (
    <main id="main" className="min-h-screen flex flex-col items-center justify-center text-center px-6 py-10">
      <h1 className="font-lead text-5xl md:text-6xl leading-none mb-4">CodeVedha</h1>
      <p className="text-xl md:text-2xl text-muted mb-10 max-w-md">
        Learn Python by listening and speaking.
      </p>

      <p className="sr-only" role="status" aria-live="polite">{srStatus}</p>

      {phase === 'gate' && (
        <div className="max-w-sm">
          <p className="text-lg mb-4">Press any key, or click anywhere, to begin.</p>
          <button type="button" className="btn-primary" aria-label="Begin. Press any key or click anywhere to start the voice guide.">
            Begin
          </button>
        </div>
      )}

      {(phase === 'speaking' || phase === 'listening') && (
        <div className="max-w-md w-full">
          <div className={`inline-flex items-center gap-4 px-5 py-3 rounded-lg border border-line ${phase === 'listening' ? 'listening-pulse' : ''}`}>
            {phase === 'listening' ? <Mic size={22} aria-hidden="true" /> : <Volume2 size={22} aria-hidden="true" />}
            <Wave />
            <span className="text-lg">{phase === 'listening' ? 'Listening...' : 'Speaking...'}</span>
          </div>
          {label && (
            <p aria-hidden="true" className="mt-5 text-muted text-base">{label}</p>
          )}
        </div>
      )}

      <form onSubmit={submitTyped} className="mt-12 w-full max-w-sm text-left" aria-label="Type your name instead">
        <label htmlFor="name-input" className="block text-base text-muted mb-2 text-center">
          Or type your name
        </label>
        <div className="flex gap-3">
          <input
            id="name-input"
            ref={inputRef}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="given-name"
            className="flex-1 min-w-0 min-h-[44px] px-3 rounded-md bg-surface border border-line text-ink"
          />
          <button type="submit" className="btn-primary flex items-center gap-2" aria-label="Continue with the typed name">
            Continue
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </div>
      </form>
    </main>
  )
}