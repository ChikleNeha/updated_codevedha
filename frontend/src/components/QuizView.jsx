import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, CheckCircle2, ListChecks, Mic, Play, Repeat, Square, XCircle } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { chat, errorMessage, getQuiz, submitQuizResult } from '../utils/api'
import { browserSpeak } from '../utils/browserTTS'
import { waitUntilDone } from '../hooks/useTTS'
import { classifyYesNo, interpretQuizSpeech, parseCommand } from '../utils/voiceCommands'
import { BLOCKED, micProblem } from '../utils/micErrors'
import { DIFFICULTY_LABELS, MODULES } from '../data/curriculum'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const LETTERS = ['A', 'B', 'C', 'D']
const KEY_TO_INDEX = { a: 0, b: 1, c: 2, d: 3, 1: 0, 2: 1, 3: 2, 4: 3 }

const OK_STYLE = { background: '#16301f', border: '1px solid #2f6b43', color: '#b7f0c6' }
const BAD_STYLE = { background: '#3a1a1a', border: '1px solid #7a2e2e', color: '#ffc9c9' }

export default function QuizView({ onNavigate, onCommand }) {
  const { sessionId, currentModule, difficultyLevel, setDifficultyLevel, tts, stt, speakAndStore,
    refreshProgress, setLessonState, username } = useApp()
  const mod = MODULES.find((m) => m.id === currentModule)

  // idle loading asking feedback waiting done
  const [state, _setState] = useState('idle')
  const [questions, _setQuestions] = useState([])
  const [idx, _setIdx] = useState(0)
  const [score, _setScore] = useState(0)
  const [feedback, setFeedback] = useState(null)
  const [summary, setSummary] = useState('')
  const [listening, setListening] = useState(false)
  const [note, setNote] = useState('') // the last answer to a question about progress, time or modules

  const stateRef = useRef('idle')
  const questionsRef = useRef([])
  const idxRef = useRef(0)
  const scoreRef = useRef(0)
  const wrongRef = useRef([])
  const aliveRef = useRef(true)
  const runRef = useRef(0) // bumping this cancels any voice loop that is still running
  const answeredRef = useRef(false)
  const live = useRef({})
  live.current = { sessionId, currentModule, difficultyLevel }

  const setState = (v) => {
    stateRef.current = v
    _setState(v)
    setLessonState(v)
  }
  const setQuestions = (v) => { questionsRef.current = v; _setQuestions(v) }
  const setIdx = (v) => { idxRef.current = v; _setIdx(v) }
  const setScore = (v) => { scoreRef.current = v; _setScore(v) }

  const say = async (msg) => {
    await speakAndStore(msg)
    await waitUntilDone(30000)
    await sleep(300)
  }

  const listenTurn = async (opts) => {
    setListening(true)
    const r = await stt.listen(opts)
    setListening(false)
    return r
  }

  // Questions about progress, modules or time. Python questions wait until the lesson (scope quiz).
  const askAssistant = async (text) => {
    try {
      const { sessionId: sid, currentModule: mid, difficultyLevel: diff } = live.current
      const res = await chat({
        session_id: sid, module_id: mid, message: text, difficulty: diff, lesson_context: '',
        scope: 'quiz', username,
      })
      return res.response
    } catch (e) {
      return errorMessage(e)
    }
  }

  const speakQuestion = async (i, withHint = false) => {
    const q = questionsRef.current[i]
    if (!q) return
    const opts = q.options.map((o, k) => `Option ${LETTERS[k]}. ${o}.`).join(' ')
    const hint = withHint ? ' Say A, B, C or D to answer. Say repeat to hear it again.' : ''
    await say(`Question ${i + 1} of ${questionsRef.current.length}. ${q.question}. ${opts}${hint}`)
  }

  // After a question is read, the microphone opens and decides: answer, repeat, stop, or a page command.
  const answerLoop = async (run) => {
    let silences = 0
    let unclear = 0
    for (;;) {
      if (run !== runRef.current || stateRef.current !== 'asking') return
      const r = await listenTurn({ silenceMs: 1300, maxWaitMs: 8000 })
      if (run !== runRef.current || r.error === 'cancelled') return
      if (BLOCKED.includes(r.error)) {
        await say(`${micProblem(r.error)} You can press A, B, C or D to answer.`)
        return
      }
      const q = questionsRef.current[idxRef.current]
      const text = r.text.trim()
      if (!text) {
        silences++
        if (silences >= 2) {
          setState('waiting')
          await say('I will wait. Press Space when you are ready.')
          return
        }
        await say('I did not hear you. Say A, B, C or D, or say repeat.')
        continue
      }
      silences = 0
      const intent = interpretQuizSpeech(text, q.options)
      if (run !== runRef.current) return
      if (intent.type === 'answer') return handleAnswer(intent.index)
      if (intent.type === 'stop') return stopQuiz()
      if (intent.type === 'nav') return onNavigate(intent.to)
      if (intent.type === 'command') {
        // Moving to another module unmounts this view, which cancels the loop. Anything else
        // (progress, contrast) is spoken first and then the microphone opens again.
        onCommand(intent.cmd)
        await sleep(400)
        await waitUntilDone(30000)
        continue
      }
      if (intent.type === 'ask') {
        const answer = await askAssistant(text)
        if (run !== runRef.current) return
        setNote(answer)
        await say(answer)
        if (run !== runRef.current) return
        await speakQuestion(idxRef.current) // then back to the question that was waiting
        continue
      }
      if (intent.type === 'repeat') {
        unclear = 0
        await speakQuestion(idxRef.current)
        continue
      }
      unclear++
      if (unclear >= 2) {
        unclear = 0
        await speakQuestion(idxRef.current)
        continue
      }
      await say('I did not catch that. Say A, B, C or D, or say repeat.')
    }
  }

  const runQuestion = async (i, withHint = false) => {
    const run = ++runRef.current
    setState('asking')
    answeredRef.current = false
    await speakQuestion(i, withHint)
    if (run !== runRef.current || !aliveRef.current) return
    return answerLoop(run)
  }

  const advance = async () => {
    const next = idxRef.current + 1
    if (next >= questionsRef.current.length) return finishQuiz()
    setIdx(next)
    setFeedback(null)
    return runQuestion(next)
  }

  const handleAnswer = async (choice) => {
    if (stateRef.current !== 'asking') return
    const run = ++runRef.current
    stt.cancelListening()
    setListening(false)
    setState('feedback')
    answeredRef.current = true
    const q = questionsRef.current[idxRef.current]
    const ok = choice === q.correct_index
    if (ok) setScore(scoreRef.current + 1)
    else wrongRef.current.push(q.topic)
    const shown = ok
      ? `You chose option ${LETTERS[choice]}. Correct. ${q.explanation}`
      : `You chose option ${LETTERS[choice]}. Wrong. The correct answer is option ${LETTERS[q.correct_index]}, ${q.options[q.correct_index]}. ${q.explanation}`
    setFeedback({ ok, text: shown, chosen: choice })
    tts.stop()
    await sleep(100)
    await speakAndStore(shown)
    await sleep(800)
    await waitUntilDone(30000)
    if (run !== runRef.current || !aliveRef.current) return
    return advance()
  }

  const idleDialog = async () => {
    const run = ++runRef.current
    for (let tries = 0; tries < 2; tries++) {
      const r = await listenTurn({ silenceMs: 1200, maxWaitMs: 7000 })
      if (run !== runRef.current || r.error === 'cancelled') return
      if (BLOCKED.includes(r.error)) return
      const t = r.text.toLowerCase()
      const cmd = parseCommand(t)
      if (cmd && cmd !== 'quiz' && onCommand(cmd)) {
        await sleep(400)
        await waitUntilDone(30000)
        if (run !== runRef.current) return
        continue
      }
      if (/\b(lesson|back|stop|exit|no|nope)\b/.test(t)) return onNavigate('lesson')
      if (/\bcode\b/.test(t)) return onNavigate('code')
      if (/\b(start|begin|ready|yes|yeah|retake|again|go|ok|okay|sure)\b/.test(t)) return startQuiz()
      if (t.trim()) await say('Say start to begin the quiz, or lesson to go back.')
    }
    await say('I will wait. Press Space to start the quiz.')
  }

  const stopQuiz = async () => {
    runRef.current++
    stt.cancelListening()
    setListening(false)
    tts.stop()
    setState('idle')
    setFeedback(null)
    await say('Quiz stopped. Say start to begin again, or say lesson to go back to the lesson.')
    return idleDialog()
  }

  const finishQuiz = async () => {
    runRef.current++
    setState('done')
    const total = questionsRef.current.length
    const s = scoreRef.current
    let message = `You scored ${s} out of ${total}.`
    let newLevel = null
    try {
      const { sessionId: sid, currentModule: mid, difficultyLevel: diff } = live.current
      const res = await submitQuizResult({
        session_id: sid, module_id: mid, score: s, total,
        wrong_topics: wrongRef.current, difficulty: diff,
      })
      newLevel = res.new_difficulty
      // when the level changes, the app announces it itself, so do not repeat it here
      if (!newLevel) message += ` ${res.message}`
      refreshProgress()
    } catch {
      message += ' I could not save your result.'
    }
    if (!aliveRef.current) return
    setSummary(message)
    await say(message)
    if (newLevel && aliveRef.current) {
      setDifficultyLevel(newLevel)
      await sleep(300)
      await waitUntilDone(10000)
    }
    if (!aliveRef.current) return
    await say('Say retake to try again, or say lesson to go back to the lesson.')
    if (!aliveRef.current) return
    return idleDialog()
  }

  const startQuiz = async () => {
    if (stateRef.current === 'loading') return
    runRef.current++
    stt.cancelListening()
    setState('loading')
    setFeedback(null)
    setSummary('')
    setScore(0)
    wrongRef.current = []
    browserSpeak('Preparing your quiz.')
    try {
      const { sessionId: sid, currentModule: mid, difficultyLevel: diff } = live.current
      const res = await getQuiz({ session_id: sid, module_id: mid, difficulty: diff })
      if (!aliveRef.current) return
      setQuestions(res.questions)
      setIdx(0)
      return runQuestion(0, true)
    } catch (e) {
      if (!aliveRef.current) return
      setState('idle')
      await say(`${errorMessage(e)} Press Space to try again.`)
    }
  }

  // J or F: stop talking and listening, then take one spoken command.
  const interruptQuiz = async () => {
    if (stateRef.current === 'loading') return
    const myId = ++runRef.current
    stt.cancelListening()
    setListening(false)
    tts.stop()
    const inQuiz = ['asking', 'feedback', 'waiting'].includes(stateRef.current)
    if (inQuiz) setState('waiting') // paused; answeredRef says whether to advance or re-ask
    await say('What do you want to do?')
    if (myId !== runRef.current || !aliveRef.current) return
    const r = await listenTurn({ silenceMs: 1500, maxWaitMs: 8000 })
    if (myId !== runRef.current || !aliveRef.current || r.error === 'cancelled') return
    if (BLOCKED.includes(r.error)) return say(`${micProblem(r.error)} Press Space to continue.`)
    const t = r.text.trim()
    if (!t) return say('I did not hear a command. Press Space when you are ready.')

    const cmd = parseCommand(t)
    if (inQuiz) {
      if (cmd === 'stop' || /\b(end|quit|exit)\b/i.test(t)) return stopQuiz()
      if (cmd === 'replay') return repeatRef.current()
      if (cmd === 'resume' || classifyYesNo(t) === 'yes') return primaryRef.current()
    } else if (cmd === 'quiz' || /\b(start|begin|retake)\b/i.test(t)) {
      return startQuiz()
    }
    if (cmd === 'help') {
      return say(
        'During the quiz you can say A, B, C or D, repeat, continue, stop the quiz, lesson, code, ' +
          'module followed by a number, or progress. Press Space to continue.'
      )
    }
    if (cmd === 'lesson') return onNavigate('lesson')
    if (cmd && cmd !== 'quiz' && onCommand(cmd)) return
    // not a command: it may be a question about progress, time or modules
    const answer = await askAssistant(t)
    if (myId !== runRef.current) return
    setNote(answer)
    return say(`${answer} Press Space to continue.`)
  }

  useEffect(() => {
    aliveRef.current = true
    ;(async () => {
      await say(`Quiz for module ${mod.id}, ${mod.title}. Five questions. Say start, or press Space, to begin.`)
      if (aliveRef.current && stateRef.current === 'idle') idleDialog()
    })()
    return () => {
      aliveRef.current = false
      runRef.current++
      stt.cancelListening()
      tts.stop()
      setLessonState('idle')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onInterrupt = () => interruptRef.current()
    window.addEventListener('codevedha:interrupt', onInterrupt)
    return () => window.removeEventListener('codevedha:interrupt', onInterrupt)
  }, [])

  // Escape: pause the quiz where it is.
  useEffect(() => {
    const onStop = () => {
      runRef.current++
      setListening(false)
      if (stateRef.current === 'asking' || stateRef.current === 'feedback') setState('waiting')
    }
    window.addEventListener('codevedha:stop', onStop)
    return () => window.removeEventListener('codevedha:stop', onStop)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const primaryRef = useRef(null)
  primaryRef.current = () => {
    const st = stateRef.current
    if (st === 'idle' || st === 'done') return startQuiz()
    if (st === 'waiting') {
      if (answeredRef.current) return advance()
      return runQuestion(idxRef.current)
    }
  }
  const answerRef = useRef(null)
  answerRef.current = handleAnswer
  const repeatRef = useRef(null)
  repeatRef.current = () => {
    runRef.current++
    stt.cancelListening()
    return runQuestion(idxRef.current)
  }
  const interruptRef = useRef(null)
  interruptRef.current = interruptQuiz

  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const st = stateRef.current
      if (e.key === ' ' || e.key === 'Enter') {
        if (tag === 'BUTTON' || tag === 'A') return
        if (st === 'idle' || st === 'done' || st === 'waiting') {
          e.preventDefault()
          primaryRef.current()
        }
        return
      }
      const k = e.key.toLowerCase()
      if (k === 'j' || k === 'f') {
        e.preventDefault()
        interruptRef.current()
        return
      }
      if (st === 'asking') {
        if (k in KEY_TO_INDEX) {
          e.preventDefault()
          answerRef.current(KEY_TO_INDEX[k])
        } else if (k === 'r') {
          e.preventDefault()
          repeatRef.current()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const q = questions[idx]
  const inQuiz = state === 'asking' || state === 'feedback' || state === 'waiting'

  return (
    <section aria-label="Quiz" className="h-full flex flex-col min-h-0">
      <div className="shrink-0 px-6 md:px-8 pt-4 flex flex-wrap items-center gap-3">
        <button type="button" className="btn-ghost flex items-center gap-2" aria-label="Back to the lesson" onClick={() => onNavigate('lesson')}>
          <ArrowLeft size={18} aria-hidden="true" />
          Back to lesson
        </button>
        <span className="text-muted flex items-center gap-2">
          <ListChecks size={18} aria-hidden="true" />
          Level: {DIFFICULTY_LABELS[difficultyLevel]}
          {inQuiz ? `. Score ${score}` : ''}
        </span>
        {inQuiz && (
          <>
            <button type="button" className="btn-ghost flex items-center gap-2" aria-label="Repeat the question. Shortcut R" onClick={() => repeatRef.current()}>
              <Repeat size={18} aria-hidden="true" />
              Repeat
            </button>
            <button type="button" className="btn-ghost flex items-center gap-2" aria-label="End the quiz. You can also say stop the quiz" onClick={() => stopQuiz()}>
              <Square size={18} aria-hidden="true" />
              End quiz
            </button>
          </>
        )}
        {listening && (
          <span className="listening-pulse px-3 py-1 rounded-full border border-line text-sm flex items-center gap-2" role="status">
            <Mic size={16} aria-hidden="true" />
            Listening...
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0 px-6 md:px-8 py-4">
        <div className="h-full overflow-y-auto rounded-lg border border-line bg-surface px-5 py-4">
          {(state === 'idle' || state === 'done') && (
            <div>
              {state === 'done' && <p className="font-lead text-2xl mb-4" role="status">{summary}</p>}
              <button type="button" className="btn-primary flex items-center gap-2" aria-label={state === 'done' ? 'Retake the quiz' : 'Start the quiz'} onClick={startQuiz}>
                <Play size={18} aria-hidden="true" />
                {state === 'done' ? 'Retake quiz' : 'Start quiz'}
              </button>
              <p className="text-muted mt-3 text-sm">
                Say {state === 'done' ? 'retake' : 'start'} or press Space. Say lesson to go back.
              </p>
            </div>
          )}

          {state === 'loading' && <p role="status">Preparing your quiz...</p>}

          {inQuiz && q && (
            <div>
              <h2 className="font-lead text-xl mb-4">
                Question {idx + 1} of {questions.length}: {q.question}
              </h2>
              <ul className="space-y-3">
                {q.options.map((o, k) => (
                  <li key={k}>
                    <button
                      type="button"
                      disabled={state === 'feedback'}
                      aria-label={`Option ${LETTERS[k]}: ${o}`}
                      onClick={() => handleAnswer(k)}
                      className="w-full min-h-[44px] text-left px-4 py-2 rounded-md border border-line hover:bg-raised disabled:opacity-80"
                      style={
                        feedback && k === q.correct_index
                          ? OK_STYLE
                          : feedback && k === feedback.chosen && !feedback.ok
                            ? BAD_STYLE
                            : undefined
                      }
                    >
                      <strong>{LETTERS[k]}.</strong> {o}
                    </button>
                  </li>
                ))}
              </ul>
              <div role="status" aria-live="polite" className="mt-4">
                {note && (
                  <p className="p-3 rounded-md mb-3 border border-line">{note}</p>
                )}
                {feedback && (
                  <p className="p-3 rounded-md flex items-start gap-2" style={feedback.ok ? OK_STYLE : BAD_STYLE}>
                    {feedback.ok ? <CheckCircle2 size={20} aria-hidden="true" className="shrink-0 mt-0.5" /> : <XCircle size={20} aria-hidden="true" className="shrink-0 mt-0.5" />}
                    <span>{feedback.text}</span>
                  </p>
                )}
                {state === 'waiting' && !feedback && (
                  <p className="text-muted">Paused. Press Space to continue.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}