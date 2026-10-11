import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Mic, Pause, Play, RotateCcw, Send } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { chat, errorMessage, getCachedLesson, prewarmLessons, streamLesson, updateProgress } from '../utils/api'
import { browserSpeak, browserStop } from '../utils/browserTTS'
import { waitUntilDone } from '../hooks/useTTS'
import { draftText, parseCards, parseCardsPartial, plain, speechOf, splitBody } from '../utils/speech'
import { classifySubmit, classifyYesNo, parseCommand } from '../utils/voiceCommands'
import { BLOCKED, micProblem } from '../utils/micErrors'
import { DIFFICULTY_LABELS, LEVEL_ORDER, MODULES, SHORTCUTS, VOICE_COMMANDS } from '../data/curriculum'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const LESSON_RATE = 0.95
const resumeMap = {} // moduleId -> card index, so leaving and returning keeps your place
const prewarmed = new Set() // difficulties for which background generation was already requested

export default function LessonView({ onNavigate }) {
  const app = useApp()
  const { sessionId, currentModule, difficultyLevel, setDifficultyLevel, setCurrentModule, tts, stt,
    speakAndStore, refreshProgress, toggleHighContrast, setLessonState, speakProgress, username } = app
  const mod = MODULES.find((m) => m.id === currentModule)

  // loading (no card yet) reading paused interrupted answering done error
  const [status, _setStatus] = useState('loading')
  const [statusMsg, setStatusMsg] = useState('')
  const [cards, setCards] = useState([])
  const [draft, setDraft] = useState('')
  const [generating, setGenerating] = useState(true)
  const [active, setActive] = useState(0)
  const [chatLog, setChatLog] = useState([])
  const [panelOpen, setPanelOpen] = useState(false)
  const [listening, _setListening] = useState(false)
  const [typed, setTyped] = useState('')

  const stateRef = useRef('loading')
  const isListeningRef = useRef(false)
  const cancelledRef = useRef(false)
  const resumeFromRef = useRef(0)
  const runIdRef = useRef(0)
  const interruptIdRef = useRef(0)
  const cardsRef = useRef([])
  const rawRef = useRef('')
  const streamDoneRef = useRef(false)
  const startedRef = useRef(false)
  const cancelStreamRef = useRef(null)
  const logRef = useRef(null)
  const inputRef = useRef(null)
  const cardEls = useRef([])
  const live = useRef({})
  live.current = { sessionId, currentModule, difficultyLevel, mod }

  const setStatus = (v) => {
    stateRef.current = v
    _setStatus(v)
    setLessonState(v)
  }
  const setListening = (v) => {
    isListeningRef.current = v
    _setListening(v)
  }
  const addChat = (role, msg, dir) => setChatLog((l) => [...l, { role, text: msg, dir }])

  useEffect(() => {
    requestAnimationFrame(() => {
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
    })
  }, [chatLog, panelOpen])

  useEffect(() => {
    cardEls.current[active]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [active, cards.length])

  // ---------- helpers ----------
  const say = async (msg) => {
    await tts.speak(msg)
    await waitUntilDone(30000)
    await sleep(350)
  }

  const listenTurn = async (opts) => {
    setListening(true)
    const r = await stt.listen(opts)
    setListening(false)
    return r
  }

  const micBlocked = async (reason) => {
    const why = micProblem(reason) || 'The microphone is not available.'
    addChat('system', `${why} You can type your question instead.`)
    await tts.speak(`${why} You can type your question in the box.`)
    inputRef.current?.focus()
  }

  // ---------- reading (starts as soon as the first card exists, while the rest is still being written) ----------
  const readFrom = useCallback(async (startIdx) => {
    const id = ++runIdRef.current
    cancelledRef.current = false
    setStatus('reading')
    await waitUntilDone(4000) // let a module title or status message finish first
    if (id !== runIdRef.current) return
    const { currentModule: moduleId, mod: m } = live.current
    let i = startIdx
    for (;;) {
      if (id !== runIdRef.current || cancelledRef.current) return
      const list = cardsRef.current
      if (i < list.length) {
        resumeFromRef.current = i
        resumeMap[moduleId] = i
        setActive(i)
        const intro = i === 0 ? `Module ${m.id}. ${m.title}. ` : ''
        await tts.speak(intro + speechOf(list[i]), LESSON_RATE)
        if (id !== runIdRef.current || cancelledRef.current) return
        i++
        await sleep(450)
      } else if (streamDoneRef.current) {
        break
      } else {
        await sleep(200) // the next card is still being written
      }
    }
    if (id !== runIdRef.current) return
    resumeFromRef.current = 0
    resumeMap[moduleId] = 0
    setStatus('done')
    tts.speak('That was the last card. Press Q for the quiz, J to ask a question, or Space to hear the lesson again.')
  }, [tts.speak])

  const resumeLesson = useCallback(() => {
    setPanelOpen(false)
    readFrom(resumeFromRef.current)
  }, [readFrom])

  const pauseLesson = useCallback(() => {
    runIdRef.current++
    cancelledRef.current = true
    interruptIdRef.current++
    tts.stop()
    stt.cancelListening()
    browserStop()
    setListening(false)
    if (['reading', 'interrupted', 'answering'].includes(stateRef.current)) {
      setPanelOpen(false)
      setStatus('paused')
    }
  }, [tts.stop, stt.cancelListening])

  // ---------- loading and streaming ----------
  const loadLesson = useCallback((force = false, diffOverride) => {
    cancelStreamRef.current?.()
    runIdRef.current++
    cancelledRef.current = false
    const { sessionId: sid, currentModule: mid, difficultyLevel: diff } = live.current
    const difficulty = diffOverride || diff
    rawRef.current = ''
    streamDoneRef.current = false
    startedRef.current = false
    cardsRef.current = []
    setCards([])
    setDraft('')
    setGenerating(true)
    setStatus('loading')
    setStatusMsg('')
    updateProgress({ session_id: sid, module_id: mid, status: 'in_progress' }).then(refreshProgress).catch(() => {})

    let spoke = false
    const handlers = {
      onStatus: (msg) => {
        setStatusMsg(msg)
        if (!spoke) {
          spoke = true
          browserSpeak(msg)
        }
      },
      onChunk: (piece) => {
        rawRef.current += piece
        const { complete, draft: d } = parseCardsPartial(rawRef.current)
        if (complete.length !== cardsRef.current.length) {
          cardsRef.current = complete
          setCards(complete)
        }
        setDraft(draftText(d))
        if (!startedRef.current && complete.length >= 1) {
          startedRef.current = true
          readFrom(0)
        }
      },
      onDone: (content) => {
        const list = parseCards(content)
        if (!list.length) {
          streamDoneRef.current = true
          setGenerating(false)
          setStatus('error')
          setStatusMsg('The lesson came back empty. Press Space to try again.')
          tts.speak('The lesson came back empty. Press Space to try again.')
          return
        }
        cardsRef.current = list
        setCards(list)
        setDraft('')
        setGenerating(false)
        streamDoneRef.current = true
        if (!startedRef.current) {
          startedRef.current = true
          const saved = resumeMap[mid] || 0
          readFrom(saved < list.length ? saved : 0)
        }
        // once the first lesson exists, write every other lesson in the background
        if (!prewarmed.has(difficulty)) {
          prewarmed.add(difficulty)
          prewarmLessons({
            sessionId: sid,
            difficulty,
            moduleIds: MODULES.map((m) => m.id).filter((id) => id !== mid),
          }).catch(() => prewarmed.delete(difficulty))
        }
      },
      onError: (msg) => {
        setGenerating(false)
        streamDoneRef.current = true
        runIdRef.current++
        tts.stop()
        setStatus('error')
        setStatusMsg(msg)
        tts.speak(`${msg} Press Space to try again.`)
      },
    }

    let cancelled = false
    let cancelInner = null
    cancelStreamRef.current = () => {
      cancelled = true
      cancelInner?.()
    }
    const stream = () => {
      if (!cancelled) cancelInner = streamLesson({ sessionId: sid, moduleId: mid, difficulty, force }, handlers)
    }
    if (force) {
      stream()
    } else {
      // A lesson that is already written needs no stream: it appears and starts reading at once.
      getCachedLesson({ moduleId: mid, difficulty })
        .then((res) => {
          if (cancelled) return
          if (res?.cached && res.content) handlers.onDone(res.content, true)
          else stream()
        })
        .catch(stream)
    }
  }, [readFrom, refreshProgress, tts.speak, tts.stop, setLessonState])

  useEffect(() => {
    loadLesson(false)
    return () => {
      cancelStreamRef.current?.()
      runIdRef.current++
      interruptIdRef.current++
      tts.stop()
      stt.cancelListening()
      setLessonState('idle')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onStop = () => {
      if (stateRef.current === 'loading') return
      pauseLesson()
    }
    window.addEventListener('codevedha:stop', onStop)
    return () => window.removeEventListener('codevedha:stop', onStop)
  }, [pauseLesson])

  // ---------- the voice conversation ----------
  const askToContinue = async (myId) => {
    if (myId !== interruptIdRef.current) return
    setStatus('interrupted')
    setPanelOpen(true)
    await say('Should I continue the lesson?')
    if (myId !== interruptIdRef.current) return
    const r = await listenTurn({ silenceMs: 1300, maxWaitMs: 7000 })
    if (myId !== interruptIdRef.current || r.error === 'cancelled') return
    if (BLOCKED.includes(r.error)) return micBlocked(r.error)
    const text = r.text.trim()
    if (!text) {
      setStatus('paused')
      setPanelOpen(false)
      return say('I will wait here. Press Space to continue, or J to ask something.')
    }
    const yn = classifyYesNo(text)
    if (yn === 'yes') return resumeLesson()
    if (yn === 'no') {
      await say('Okay. What would you like to do?')
      return dialog(myId)
    }
    return dialog(myId, text) // they said something else, treat it as their next request
  }

  const submitQuestion = async (question, myId) => {
    tts.stop()
    browserStop()
    setStatus('answering')
    addChat('user', question)
    const { sessionId: sid, currentModule: mid, difficultyLevel: diff } = live.current
    const card = cardsRef.current[resumeFromRef.current]
    try {
      const res = await chat({
        session_id: sid,
        module_id: mid,
        message: question,
        difficulty: diff,
        lesson_context: card ? `${card.title}. ${card.body}` : '',
        scope: 'lesson',
        username,
      })
      if (myId !== interruptIdRef.current) return
      let newDiff = null
      addChat('assistant', res.response)
      await tts.speak(res.response)
      await waitUntilDone(60000)
      if (myId !== interruptIdRef.current) return
      if (res.updated_difficulty && res.updated_difficulty !== diff) {
        newDiff = res.updated_difficulty
        const up = LEVEL_ORDER.indexOf(newDiff) > LEVEL_ORDER.indexOf(diff)
        addChat('system', `Difficulty ${up ? 'increased' : 'decreased'}: ${DIFFICULTY_LABELS[newDiff]}`, up ? 'up' : 'down')
        setDifficultyLevel(newDiff) // the app announces the new level aloud
        await sleep(300)
        await waitUntilDone(10000)
        if (myId !== interruptIdRef.current) return
      }
      if (res.intent === 'quiz') return onNavigate('quiz')
      if (res.lesson_adjust) {
        setPanelOpen(false)
        resumeMap[mid] = 0
        resumeFromRef.current = 0
        return loadLesson(true, newDiff || diff)
      }
      await sleep(500)
      return askToContinue(myId)
    } catch (e) {
      if (myId !== interruptIdRef.current) return
      const msg = errorMessage(e)
      addChat('system', msg)
      await say(msg)
      return askToContinue(myId)
    }
  }

  const runCommand = async (cmd, spokenText, myId) => {
    addChat('user', spokenText)
    const mid = live.current.currentModule
    if (cmd.startsWith('goto:')) {
      const n = Number(cmd.slice(5))
      const m = MODULES.find((x) => x.id === n)
      if (!m || n === mid) {
        await say(m ? `You are already on module ${n}.` : `There is no module ${n}. The modules are numbered one to ${MODULES.length}.`)
        return askToContinue(myId)
      }
      speakAndStore(`Module ${m.id}. ${m.title}.`)
      setPanelOpen(false)
      return setCurrentModule(m.id)
    }
    if (cmd === 'progress') {
      await speakProgress()
      await waitUntilDone(30000)
      await sleep(400)
      return askToContinue(myId)
    }
    switch (cmd) {
      case 'lesson':
      case 'replay':
      case 'resume':
        return resumeLesson()
      case 'restart':
        resumeFromRef.current = 0
        return resumeLesson()
      case 'quiz':
        return onNavigate('quiz')
      case 'code':
        return onNavigate('code')
      case 'next':
      case 'previous': {
        const target = mid + (cmd === 'next' ? 1 : -1)
        const m = MODULES.find((x) => x.id === target)
        if (!m) {
          await say(`This is the ${cmd === 'next' ? 'last' : 'first'} module.`)
          return askToContinue(myId)
        }
        speakAndStore(`Module ${m.id}. ${m.title}.`)
        setPanelOpen(false)
        return setCurrentModule(m.id)
      }
      case 'help': {
        const help = SHORTCUTS.map((s) => `${s.keys}: ${s.action}`).join('. ')
        await say(`Voice commands: ${VOICE_COMMANDS}. Keyboard shortcuts. ${help}.`)
        return askToContinue(myId)
      }
      case 'contrast':
        toggleHighContrast()
        await sleep(1200)
        return askToContinue(myId)
      case 'stop':
      default:
        setStatus('paused')
        setPanelOpen(false)
        return say('Stopped. Press Space to continue.')
    }
  }

  // Listens, reads back what it heard, and asks whether to send it or add more.
  const dialog = async (myId, initial = '') => {
    let pending = ''
    let carry = initial
    let skipListen = false
    for (let round = 0; round < 6; round++) {
      if (myId !== interruptIdRef.current) return
      if (!skipListen) {
        let heard = carry
        carry = ''
        if (!heard) {
          const r = await listenTurn({ silenceMs: 2200, maxWaitMs: 9000 })
          if (myId !== interruptIdRef.current || r.error === 'cancelled') return
          if (BLOCKED.includes(r.error)) return micBlocked(r.error)
          heard = r.text.trim()
        }
        if (!heard && !pending) {
          await say('Sorry, I could not understand that.')
          return askToContinue(myId)
        }
        pending = `${pending} ${heard}`.trim()
      }
      skipListen = false

      const cmd = parseCommand(pending)
      if (cmd) return runCommand(cmd, pending, myId)

      const shown = pending.split(' ').slice(0, 30).join(' ')
      await say(`I heard: ${shown}. Should I send that, or do you want to add more?`)
      if (myId !== interruptIdRef.current) return
      const a = await listenTurn({ silenceMs: 1500, maxWaitMs: 8000 })
      if (myId !== interruptIdRef.current || a.error === 'cancelled') return
      const c = classifySubmit(a.text)
      if (c.type === 'cancel') {
        await say('Okay, I dropped that.')
        return askToContinue(myId)
      }
      if (c.type === 'retry') {
        pending = ''
        await say('Okay, say it again.')
        continue
      }
      if (c.type === 'more') {
        await say('Go ahead.')
        continue
      }
      if (c.type === 'addition') {
        pending = `${pending} ${c.text}`.trim()
        skipListen = true
        continue
      }
      return submitQuestion(pending, myId)
    }
    return submitQuestion(pending, myId)
  }

  const interrupt = async () => {
    const s = stateRef.current
    if (s === 'loading' || s === 'error') {
      browserSpeak('The lesson is still loading. Please wait a moment.')
      return
    }
    const myId = ++interruptIdRef.current
    runIdRef.current++
    cancelledRef.current = true
    tts.stop()
    stt.cancelListening()
    setListening(false)
    setPanelOpen(true)
    setStatus('interrupted')
    await say('What do you want to do?')
    if (myId !== interruptIdRef.current) return
    return dialog(myId)
  }

  const startDialog = () => {
    const myId = ++interruptIdRef.current
    runIdRef.current++
    cancelledRef.current = true
    tts.stop()
    setPanelOpen(true)
    setStatus('interrupted')
    return dialog(myId)
  }

  const submitTyped = (e) => {
    e.preventDefault()
    const q = typed.trim()
    if (!q) return
    setTyped('')
    stt.cancelListening()
    const myId = ++interruptIdRef.current
    runIdRef.current++
    cancelledRef.current = true
    tts.stop()
    setPanelOpen(true)
    const cmd = parseCommand(q)
    if (cmd) runCommand(cmd, q, myId)
    else submitQuestion(q, myId)
  }

  // ---------- keyboard ----------
  const primary = () => {
    switch (stateRef.current) {
      case 'interrupted':
        return startDialog()
      case 'reading':
        return pauseLesson()
      case 'paused':
        return resumeLesson()
      case 'done':
        resumeFromRef.current = 0
        return readFrom(0)
      case 'error':
        return loadLesson(true)
      default:
    }
  }
  const interruptRef = useRef(interrupt)
  interruptRef.current = interrupt

  useEffect(() => {
    const onInterrupt = () => {
      if (!isListeningRef.current) interruptRef.current()
    }
    window.addEventListener('codevedha:interrupt', onInterrupt)
    return () => window.removeEventListener('codevedha:interrupt', onInterrupt)
  }, [])
  const primaryRef = useRef(primary)
  primaryRef.current = primary

  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const tag = e.target.tagName
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
      const k = e.key
      if (isListeningRef.current && (k === ' ' || k === 'Enter') && !typing) {
        e.preventDefault()
        stt.stopListening() // ends the turn now, the recognizer hands over what it heard
        return
      }
      if (typing) return
      if (k === 'j' || k === 'J' || k === 'f' || k === 'F') {
        e.preventDefault()
        if (!isListeningRef.current) interruptRef.current()
        return
      }
      if (k === ' ' || k === 'Enter') {
        if (tag === 'BUTTON' || tag === 'A') return
        e.preventDefault()
        primaryRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stt.stopListening])

  // ---------- render ----------
  const statusText = {
    loading: statusMsg || 'Getting your lesson ready.',
    reading: `Reading card ${active + 1}${generating ? '. More cards are still being written.' : ` of ${cards.length}.`} Space pauses.`,
    paused: 'Paused. Press Space to continue.',
    interrupted: listening ? 'Listening. Speak, then pause. Press Space if you have finished.' : 'Waiting for you.',
    answering: 'Thinking about your question.',
    done: 'Lesson finished. Press Q for the quiz, or Space to hear it again.',
    error: statusMsg,
  }[status]

  return (
    <section aria-label="Lesson" className="h-full flex flex-col min-h-0">
      <div className="shrink-0 px-6 md:px-8 pt-4 flex flex-wrap items-center gap-3">
        <button type="button" className="btn-ghost flex items-center gap-2" aria-label="Interrupt and ask a question. Shortcut J or F" onClick={() => interrupt()}>
          <Mic size={18} aria-hidden="true" />
          Ask a question (J)
        </button>
        <button
          type="button"
          className="btn-ghost flex items-center gap-2"
          aria-label={status === 'reading' ? 'Pause the lesson' : status === 'done' ? 'Hear the lesson again' : 'Resume the lesson'}
          onClick={() => primary()}
        >
          {status === 'reading' ? <Pause size={18} aria-hidden="true" /> : status === 'done' ? <RotateCcw size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
          {status === 'reading' ? 'Pause' : status === 'done' ? 'Hear again' : 'Resume'}
        </button>
        <p role="status" aria-live="polite" className="text-muted text-sm ml-1">{statusText}</p>
      </div>

      <div className="flex-1 min-h-0 px-6 md:px-8 py-4">
        <div className="h-full overflow-y-auto rounded-lg border border-line bg-surface px-5 py-4">
          {cards.length === 0 && status === 'loading' && (
            <p className="text-muted">
              {statusMsg}
              <span className="cursor-blink ml-1" aria-hidden="true" />
            </p>
          )}
          <div className="space-y-5">
            {cards.map((c, i) => (
              <article
                key={i}
                ref={(el) => (cardEls.current[i] = el)}
                aria-current={i === active && status === 'reading' ? 'true' : undefined}
                className={`pl-4 border-l-4 ${i === active ? 'border-accent' : 'border-line opacity-80'}`}
              >
                <h2 className="font-lead text-xl mb-1">{plain(c.title)}</h2>
                {splitBody(c.body).map((p, j) =>
                  p.type === 'code' ? (
                    <pre key={j} className="card-code my-2" aria-label="Python code example">{p.value}</pre>
                  ) : (
                    <p key={j} className="text-base leading-relaxed">{plain(p.value)}</p>
                  )
                )}
              </article>
            ))}
            {generating && draft && (
              <article aria-hidden="true" className="pl-4 border-l-4 border-line opacity-60">
                <p className="text-base leading-relaxed whitespace-pre-wrap">
                  {draft}
                  <span className="cursor-blink ml-1" />
                </p>
              </article>
            )}
          </div>
        </div>
      </div>

      {panelOpen && (
        <div
          role="region"
          aria-label="Ask a question"
          className="shrink-0 border-t border-line bg-surface px-6 md:px-8 py-3 flex flex-col gap-2 max-h-56"
        >
          <div ref={logRef} role="log" aria-live="polite" aria-label="Conversation" className="flex-1 min-h-[2.5rem] overflow-y-auto space-y-1 text-base">
            {chatLog.map((m, i) => (
              m.role === 'system' ? (
                <p key={i} className="text-sm inline-flex items-center gap-2 px-3 py-1 rounded-full border border-line">
                  {m.dir === 'up' && <ArrowUp size={14} aria-hidden="true" />}
                  {m.dir === 'down' && <ArrowDown size={14} aria-hidden="true" />}
                  {m.text}
                </p>
              ) : (
                <p key={i} className={m.role === 'user' ? 'text-muted' : ''}>
                  {m.role === 'user' ? 'You: ' : 'Tutor: '}
                  {m.text}
                </p>
              )
            ))}
          </div>
          <form onSubmit={submitTyped} className="flex gap-2 flex-wrap">
            <label htmlFor="ask-input" className="sr-only">Type your question</label>
            <input
              id="ask-input"
              ref={inputRef}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Or type here"
              className="flex-1 min-w-[10rem] min-h-[44px] px-3 rounded-md bg-bg border border-line text-ink"
            />
            <button type="submit" className="btn-primary flex items-center gap-2" aria-label="Send typed question">
              <Send size={18} aria-hidden="true" />
              Send
            </button>
            <button
              type="button"
              className={`btn-ghost flex items-center gap-2 ${listening ? 'listening-pulse' : ''}`}
              aria-label={listening ? 'Finish speaking' : 'Start speaking'}
              onClick={() => (listening ? stt.stopListening() : startDialog())}
            >
              <Mic size={18} aria-hidden="true" />
              {listening ? 'Done' : 'Speak'}
            </button>
            <button type="button" className="btn-ghost flex items-center gap-2" aria-label="Close and resume the lesson" onClick={() => { pauseLesson(); resumeLesson() }}>
              <Play size={18} aria-hidden="true" />
              Resume
            </button>
          </form>
        </div>
      )}
    </section>
  )
}