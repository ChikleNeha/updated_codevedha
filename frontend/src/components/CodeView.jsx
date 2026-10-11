import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, CheckCircle2, Mic, RotateCcw, Send, Terminal, Trash2, XCircle } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { errorMessage, runCode } from '../utils/api'
import { waitUntilDone } from '../hooks/useTTS'
import { cleanForSpeech, codeToSpeech } from '../utils/speech'
import { highlightPython } from '../utils/pyHighlight'
import { parseCommand } from '../utils/voiceCommands'
import { BLOCKED, micProblem } from '../utils/micErrors'
import { MODULES } from '../data/curriculum'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const PAGE_COMMANDS = ['quiz', 'lesson', 'next', 'previous', 'help', 'progress', 'contrast']

const OK_STYLE = { background: '#16301f', border: '1px solid #2f6b43', color: '#b7f0c6' }
const BAD_STYLE = { background: '#3a1a1a', border: '1px solid #7a2e2e', color: '#ffc9c9' }

const INTRO =
  'Code practice. Press Space and describe the code you want, for example, print hello world. ' +
  'Press Space again when you finish. R repeats the last result. C clears the history. J or F lets you speak a command.'

function spokenOutput(text) {
  const flat = cleanForSpeech(text.trim().split('\n').join('. '))
  return flat.length > 400 ? `${flat.slice(0, 400)}. And more.` : flat
}

function speechFor(a) {
  if (!a.code) return a.error_explanation || a.error
  const lines = a.code.split('\n').length
  const wrote = lines <= 6 ? `I wrote: ${codeToSpeech(a.code)}.` : `I wrote ${lines} lines of code.`
  if (a.success) {
    return `${wrote} ${a.output.trim() ? `It printed: ${spokenOutput(a.output)}` : 'It ran and printed nothing.'}`
  }
  return `${wrote} There was a problem. ${a.error_explanation || a.error}`
}

function Highlighted({ code }) {
  return (
    <pre className="card-code my-2" aria-label="Generated Python code">
      {highlightPython(code).map((t, i) => (t.cls ? <span key={i} className={t.cls}>{t.text}</span> : t.text))}
    </pre>
  )
}

export default function CodeView({ onCommand }) {
  const { currentModule, tts, stt, speakAndStore, setLessonState } = useApp()
  const mod = MODULES.find((m) => m.id === currentModule)

  const [attempts, _setAttempts] = useState([])
  const [status, _setStatus] = useState('idle') // idle listening running
  const [typed, setTyped] = useState('')
  const [notice, setNotice] = useState('') // a visible message for anything that goes wrong with the microphone
  const [slow, setSlow] = useState(false)

  const attemptsRef = useRef([])
  const statusRef = useRef('idle')
  const runIdRef = useRef(0)
  const aliveRef = useRef(true)
  const lastSpeechRef = useRef('')
  const endRef = useRef(null)
  const inputRef = useRef(null)

  const setAttempts = (v) => { attemptsRef.current = v; _setAttempts(v) }
  const setStatus = (v) => {
    statusRef.current = v
    _setStatus(v)
    setLessonState(v)
  }

  const say = async (msg) => {
    lastSpeechRef.current = msg
    await speakAndStore(msg)
    await waitUntilDone(40000)
    await sleep(300)
  }

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [attempts.length])

  const repeatLast = async () => {
    const last = attemptsRef.current[attemptsRef.current.length - 1]
    if (!last) return say('There is nothing to repeat yet. Press Space and describe some code.')
    return say(speechFor(last))
  }

  const clearHistory = async () => {
    setAttempts([])
    await say('History cleared.')
  }

  const submit = async (text) => {
    const myId = ++runIdRef.current
    setStatus('running')
    setNotice('')
    setSlow(false)
    tts.speak(`I heard: ${cleanForSpeech(text)}. Working on it.`)
    const slowTimer = setTimeout(() => {
      if (statusRef.current === 'running') {
        setSlow(true)
        tts.speak('Still working. The AI model may be busy.')
      }
    }, 9000)
    try {
      const res = await runCode({ spoken_text: text, current_module: currentModule })
      clearTimeout(slowTimer)
      setSlow(false)
      if (myId !== runIdRef.current || !aliveRef.current) return
      const attempt = { id: Date.now(), spoken: text, ...res }
      setAttempts([...attemptsRef.current, attempt])
      setStatus('idle')
      await say(speechFor(attempt))
    } catch (e) {
      clearTimeout(slowTimer)
      setSlow(false)
      if (myId !== runIdRef.current || !aliveRef.current) return
      setStatus('idle')
      const msg = errorMessage(e)
      setNotice(msg)
      await say(`${msg} Press Space to try again.`)
    }
  }

  const handleSpoken = async (text) => {
    // Short phrases can be commands. Module names are ordinary words when describing code, so no title jumps here.
    const cmd = parseCommand(text, { titles: false })
    if (cmd === 'replay') return repeatLast()
    if (cmd === 'stop') return
    if (/\b(clear|delete|erase)\b.*\b(history|everything|all)\b/i.test(text)) return clearHistory()
    if (cmd && (PAGE_COMMANDS.includes(cmd) || cmd.startsWith('goto:'))) {
      if (onCommand(cmd)) return
    }
    return submit(text)
  }

  const startListening = async () => {
    if (statusRef.current !== 'idle') return
    tts.stop()
    setNotice('')
    const run = ++runIdRef.current
    setStatus('listening')
    await sleep(250) // some browsers need a moment after speech is cancelled before the microphone opens
    if (run !== runIdRef.current || !aliveRef.current) return
    const r = await stt.listen({ silenceMs: 2500, maxWaitMs: 12000 })
    if (run !== runIdRef.current || !aliveRef.current || r.error === 'cancelled') {
      if (statusRef.current === 'listening') setStatus('idle')
      return
    }
    setStatus('idle')
    if (BLOCKED.includes(r.error)) {
      const why = micProblem(r.error)
      setNotice(why)
      await say(`${why} You can type your description in the box instead.`)
      inputRef.current?.focus()
      return
    }
    const text = r.text.trim()
    if (!text) {
      setNotice('I did not hear anything. Press Space and try again.')
      return say('I did not hear anything. Press Space to try again.')
    }
    return handleSpoken(text)
  }

  // J or F: stop everything and take one spoken command.
  const interrupt = async () => {
    if (statusRef.current === 'running') return
    const myId = ++runIdRef.current
    tts.stop()
    stt.cancelListening()
    setStatus('listening')
    await say('What do you want to do?')
    if (myId !== runIdRef.current || !aliveRef.current) return
    const r = await stt.listen({ silenceMs: 1500, maxWaitMs: 8000 })
    if (myId !== runIdRef.current || !aliveRef.current || r.error === 'cancelled') {
      if (statusRef.current === 'listening') setStatus('idle')
      return
    }
    setStatus('idle')
    if (BLOCKED.includes(r.error)) {
      setNotice(micProblem(r.error))
      return say(micProblem(r.error))
    }
    const text = r.text.trim()
    if (!text) return say('I did not hear a command. Press Space to write code.')
    const cmd = parseCommand(text, { titles: true })
    if (cmd === 'replay') return repeatLast()
    if (/\b(clear|delete|erase)\b.*\b(history|everything|all)\b/i.test(text)) return clearHistory()
    if (cmd === 'help') {
      return say(
        'In code practice, press Space and describe your code. R repeats the last result. C clears the history. ' +
          'You can also say quiz, lesson, module followed by a number, progress, or help.'
      )
    }
    if (cmd === 'stop' || cmd === 'resume' || cmd === 'code') return
    if (cmd && onCommand(cmd)) return
    return say('Sorry, I did not understand that command. Press Space to write code, or say help.')
  }

  const actionsRef = useRef({})
  actionsRef.current = { startListening, repeatLast, clearHistory, interrupt }

  useEffect(() => {
    aliveRef.current = true
    say(INTRO)
    return () => {
      aliveRef.current = false
      runIdRef.current++
      stt.cancelListening()
      tts.stop()
      setLessonState('idle')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onInterrupt = () => {
      if (statusRef.current !== 'listening') actionsRef.current.interrupt()
    }
    window.addEventListener('codevedha:interrupt', onInterrupt)
    return () => window.removeEventListener('codevedha:interrupt', onInterrupt)
  }, [])

  useEffect(() => {
    const onStop = () => {
      runIdRef.current++
      if (statusRef.current === 'listening') setStatus('idle')
    }
    window.addEventListener('codevedha:stop', onStop)
    return () => window.removeEventListener('codevedha:stop', onStop)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const k = e.key
      if (k === ' ' || k === 'Enter') {
        if (tag === 'BUTTON' || tag === 'A') return
        e.preventDefault()
        if (statusRef.current === 'listening') stt.stopListening() // finished speaking, transcribe now
        else actionsRef.current.startListening()
        return
      }
      const lower = k.toLowerCase()
      if (lower === 'r') {
        e.preventDefault()
        actionsRef.current.repeatLast()
      } else if (lower === 'c') {
        e.preventDefault()
        actionsRef.current.clearHistory()
      } else if (lower === 'j' || lower === 'f') {
        e.preventDefault()
        if (statusRef.current !== 'listening') actionsRef.current.interrupt()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stt.stopListening])

  const submitTyped = (e) => {
    e.preventDefault()
    const text = typed.trim()
    if (!text || statusRef.current === 'running') return
    setTyped('')
    stt.cancelListening()
    tts.stop()
    handleSpoken(text)
  }

  const statusText =
    status === 'listening'
      ? 'Listening. Describe your code, then pause, or press Space when you finish.'
      : status === 'running'
        ? 'Writing and running your code...'
        : 'Press Space and describe the code you want.'

  return (
    <section aria-label="Code practice" className="h-full flex flex-col min-h-0">
      <div className="shrink-0 px-6 md:px-8 pt-4 flex flex-wrap items-center gap-3">
        <button type="button" className="btn-ghost flex items-center gap-2" aria-label="Back to the lesson" onClick={() => onCommand('lesson')}>
          <ArrowLeft size={18} aria-hidden="true" />
          Back to lesson
        </button>
        <button
          type="button"
          className={`btn-primary flex items-center gap-2 ${status === 'listening' ? 'listening-pulse' : ''}`}
          aria-label={status === 'listening' ? 'Finish speaking and run the code' : 'Speak your code. Shortcut Space'}
          disabled={status === 'running'}
          onClick={() => (status === 'listening' ? stt.stopListening() : startListening())}
        >
          <Mic size={18} aria-hidden="true" />
          {status === 'listening' ? 'Done' : 'Speak code'}
        </button>
        <button type="button" className="btn-ghost flex items-center gap-2" aria-label="Repeat the last result. Shortcut R" onClick={() => repeatLast()}>
          <RotateCcw size={18} aria-hidden="true" />
          Repeat
        </button>
        <button type="button" className="btn-ghost flex items-center gap-2" aria-label="Clear the history. Shortcut C" onClick={() => clearHistory()}>
          <Trash2 size={18} aria-hidden="true" />
          Clear
        </button>
        <p role="status" aria-live="polite" className="text-muted text-sm ml-1">
          {slow ? 'Still working. The AI model may be busy writing lessons.' : statusText}
        </p>
      </div>
      {notice && (
        <p role="alert" className="mx-6 md:mx-8 mt-3 p-3 rounded-md text-sm" style={BAD_STYLE}>{notice}</p>
      )}

      <div className="flex-1 min-h-0 px-6 md:px-8 py-4">
        <div className="h-full overflow-y-auto rounded-lg border border-line bg-surface px-5 py-4">
          {attempts.length === 0 && (
            <div className="text-muted">
              <p className="flex items-center gap-2 mb-2">
                <Terminal size={18} aria-hidden="true" />
                Practice for module {mod.id}: {mod.title}
              </p>
              <p>Try saying: print hello world. Or: variable naam equals Rahul. Or: for loop 1 to 5.</p>
            </div>
          )}
          <ol className="space-y-6" aria-label="History of attempts">
            {attempts.map((a, i) => (
              <li key={a.id}>
                <p className="text-muted text-sm">Attempt {i + 1}. You said: {a.spoken}</p>
                {a.code && <Highlighted code={a.code} />}
                {a.success ? (
                  <div className="p-3 rounded-md" style={OK_STYLE} role="group" aria-label="Output">
                    <p className="flex items-center gap-2 mb-1"><CheckCircle2 size={18} aria-hidden="true" /> Output</p>
                    <pre className="font-mono text-sm whitespace-pre-wrap">{a.output.trim() || '(nothing was printed)'}</pre>
                  </div>
                ) : (
                  <div className="p-3 rounded-md" style={BAD_STYLE} role="group" aria-label="Error">
                    <p className="flex items-center gap-2 mb-1"><XCircle size={18} aria-hidden="true" /> Error</p>
                    {a.error_explanation && <p className="mb-2">{a.error_explanation}</p>}
                    <pre className="font-mono text-xs whitespace-pre-wrap opacity-90">{a.error}</pre>
                  </div>
                )}
              </li>
            ))}
          </ol>
          <div ref={endRef} />
        </div>
      </div>

      <form onSubmit={submitTyped} className="shrink-0 px-6 md:px-8 pb-3 flex gap-2">
        <label htmlFor="code-input" className="sr-only">Type what the code should do</label>
        <input
          id="code-input"
          ref={inputRef}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Or type what the code should do"
          className="flex-1 min-w-0 min-h-[44px] px-3 rounded-md bg-surface border border-line text-ink"
        />
        <button type="submit" className="btn-primary flex items-center gap-2" aria-label="Run" disabled={status === 'running'}>
          <Send size={18} aria-hidden="true" />
          Run
        </button>
      </form>
    </section>
  )
}