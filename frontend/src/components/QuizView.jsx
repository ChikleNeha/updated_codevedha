import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import { errorMessage, getQuiz, submitQuizResult } from '../utils/api'
import { browserSpeak } from '../utils/browserTTS'
import { waitUntilDone } from '../hooks/useTTS'
import { interpretQuizSpeech } from '../utils/voiceCommands'
import { DIFFICULTY_LABELS, MODULES } from '../data/curriculum'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const LETTERS = ['A', 'B', 'C', 'D']
const KEY_TO_INDEX = { a: 0, b: 1, c: 2, d: 3, 1: 0, 2: 1, 3: 2, 4: 3 }
const BLOCKED = ['not-allowed', 'service-not-allowed', 'not-supported', 'start-failed']

const OK_STYLE = { background: '#16301f', border: '1px solid #2f6b43', color: '#b7f0c6' }
const BAD_STYLE = { background: '#3a1a1a', border: '1px solid #7a2e2e', color: '#ffc9c9' }

export default function QuizView({ onNavigate }) {
  const { sessionId, currentModule, difficultyLevel, setDifficultyLevel, tts, stt, speakAndStore, refreshProgress } = useApp()
  const mod = MODULES.find((m) => m.id === currentModule)

  // idle loading asking feedback waiting done
  const [state, _setState] = useState('idle')
  const [questions, _setQuestions] = useState([])
  const [idx, _setIdx] = useState(0)
  const [score, _setScore] = useState(0)
  const [feedback, setFeedback] = useState(null)
  const [summary, setSummary] = useState('')
  const [listening, setListening] = useState(false)

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

  const setState = (v) => { stateRef.current = v; _setState(v) }
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

  const speakQuestion = async (i, withHint = false) => {
    const q = questionsRef.current[i]
    if (!q) return
    const opts = q.options.map((o, k) => `Option ${LETTERS[k]}. ${o}.`).join(' ')
    const hint = withHint ? ' Say A, B, C or D to answer. Say repeat to hear it again.' : ''
    await say(`Question ${i + 1} of ${questionsRef.current.length}. ${q.question}. ${opts}${hint}`)
  }

  // After a question is read, the microphone opens and decides: answer, repeat, stop or unclear.
  const answerLoop = async (run) => {
    let silences = 0
    let unclear = 0
    for (;;) {
      if (run !== runRef.current || stateRef.current !== 'asking') return
      const r = await listenTurn({ silenceMs: 1300, maxWaitMs: 8000 })
      if (run !== runRef.current || r.error === 'cancelled') return
      if (BLOCKED.includes(r.error)) {
        await say('I cannot use the microphone. Press A, B, C or D to answer.')
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
      await say("I did not catch that. Say A, B, C or D, or say repeat.")
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
      ? `\u2705 You chose option ${LETTERS[choice]}. Correct. ${q.explanation}`
      : `\u274C You chose option ${LETTERS[choice]}. Wrong. The correct answer is option ${LETTERS[q.correct_index]}, ${q.options[q.correct_index]}. ${q.explanation}`
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
    try {
      const { sessionId: sid, currentModule: mid, difficultyLevel: diff } = live.current
      const res = await submitQuizResult({
        session_id: sid, module_id: mid, score: s, total,
        wrong_topics: wrongRef.current, difficulty: diff,
      })
      if (res.new_difficulty) setDifficultyLevel(res.new_difficulty)
      message += ` ${res.message}`
      refreshProgress()
    } catch {
      message += ' I could not save your result.'
    }
    if (!aliveRef.current) return
    setSummary(message)
    await say(`${message} Say retake to try again, or say lesson to go back to the lesson.`)
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        <span className="text-muted">
          Level: {DIFFICULTY_LABELS[difficultyLevel]}
          {inQuiz ? `. Score ${score}` : ''}
        </span>
        {inQuiz && (
          <>
            <button type="button" className="btn-ghost" aria-label="Repeat the question. Shortcut R" onClick={() => repeatRef.current()}>
              Repeat (R)
            </button>
            <button type="button" className="btn-ghost" aria-label="End the quiz. You can also say stop the quiz" onClick={() => stopQuiz()}>
              End quiz
            </button>
          </>
        )}
        {listening && (
          <span className="listening-pulse px-3 py-1 rounded-full border border-line text-sm" role="status">
            Listening for your answer...
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0 px-6 md:px-8 py-4">
        <div className="h-full overflow-y-auto rounded-lg border border-line bg-surface px-5 py-4">
          {(state === 'idle' || state === 'done') && (
            <div>
              {state === 'done' && <p className="font-lead text-2xl mb-4" role="status">{summary}</p>}
              <button type="button" className="btn-primary" aria-label={state === 'done' ? 'Retake the quiz' : 'Start the quiz'} onClick={startQuiz}>
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
                {feedback && (
                  <p className="p-3 rounded-md" style={feedback.ok ? OK_STYLE : BAD_STYLE}>
                    {feedback.text}
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