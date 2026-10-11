import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useTTS } from '../hooks/useTTS'
import { useSTT } from '../hooks/useSTT'
import { browserSpeak } from '../utils/browserTTS'
import { getProgress } from '../utils/api'
import { DIFFICULTY_LABELS, LEVEL_ORDER, MODULES } from '../data/curriculum'

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

function getSessionId() {
  let id = localStorage.getItem('ac_session_id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('ac_session_id', id)
  }
  return id
}

export function AppProvider({ children }) {
  const tts = useTTS()
  const stt = useSTT()

  const [sessionId] = useState(getSessionId)
  const [username, setUsernameState] = useState(() => localStorage.getItem('ac_username') || '')
  const [currentModule, setCurrentModule] = useState(() => Number(localStorage.getItem('ac_module')) || 1)
  const [difficultyLevel, setDifficultyLevel] = useState(() => localStorage.getItem('ac_difficulty') || 'beginner')
  const [lessonState, setLessonState] = useState('idle')
  const [isHighContrast, setIsHighContrast] = useState(() => localStorage.getItem('ac_high_contrast') === '1')
  const [fontSize, setFontSize] = useState(() => Number(localStorage.getItem('ac_fs')) || 17)
  const [progress, setProgress] = useState([])
  const lastSpokenRef = useRef('')

  useEffect(() => {
    document.documentElement.classList.toggle('hc', isHighContrast)
  }, [isHighContrast])
  useEffect(() => {
    document.documentElement.style.fontSize = `${fontSize}px`
  }, [fontSize])
  useEffect(() => localStorage.setItem('ac_module', String(currentModule)), [currentModule])
  useEffect(() => localStorage.setItem('ac_difficulty', difficultyLevel), [difficultyLevel])

  // Whenever the level changes, from a quiz or from the tutor, say so out loud.
  const prevLevel = useRef(difficultyLevel)
  useEffect(() => {
    const prev = prevLevel.current
    if (prev === difficultyLevel) return
    prevLevel.current = difficultyLevel
    const up = LEVEL_ORDER.indexOf(difficultyLevel) > LEVEL_ORDER.indexOf(prev)
    browserSpeak(`Difficulty ${up ? 'increased' : 'decreased'}. ${DIFFICULTY_LABELS[difficultyLevel]}!`)
  }, [difficultyLevel])

  const setUsername = useCallback((name) => {
    localStorage.setItem('ac_username', name)
    setUsernameState(name)
  }, [])

  const refreshProgress = useCallback(async () => {
    try {
      setProgress(await getProgress(sessionId))
    } catch {
      /* backend offline: keep what we have */
    }
  }, [sessionId])

  const speakAndStore = useCallback(
    (text) => {
      lastSpokenRef.current = text
      return tts.speak(text)
    },
    [tts.speak]
  )

  const replayLast = useCallback(() => {
    if (lastSpokenRef.current) return tts.speak(lastSpokenRef.current)
  }, [tts.speak])

  const speakProgress = useCallback(() => {
    const done = progress.filter((p) => p.status === 'completed')
    let text
    if (!done.length) {
      text = 'You have not completed any modules yet. Score at least 60 percent on a quiz to complete a module.'
    } else {
      const avg = Math.round(done.reduce((sum, p) => sum + (p.quiz_score || 0), 0) / done.length)
      text = `You have completed ${done.length} of ${MODULES.length} modules. Your average score is ${avg} percent.`
    }
    return speakAndStore(text)
  }, [progress, speakAndStore])

  const setContrast = useCallback((on) => {
    setIsHighContrast(on)
    localStorage.setItem('ac_high_contrast', on ? '1' : '0')
  }, [])

  // Short confirmations are queued behind whatever is being read, so they never cut a lesson card in half.
  const toggleHighContrast = useCallback(() => {
    const next = !isHighContrast
    setContrast(next)
    browserSpeak(next ? 'High contrast on.' : 'High contrast off.')
  }, [isHighContrast, setContrast])

  const changeFontSize = useCallback(
    (delta) => {
      const next = Math.min(26, Math.max(14, fontSize + delta))
      setFontSize(next)
      localStorage.setItem('ac_fs', String(next))
      browserSpeak(next === fontSize ? 'Font size limit reached.' : `Font size ${next}.`)
    },
    [fontSize]
  )

  // Alt+C works on every page, and is caught before anything else can swallow it.
  const toggleRef = useRef(toggleHighContrast)
  toggleRef.current = toggleHighContrast
  useEffect(() => {
    const onKey = (e) => {
      const isC = e.code === 'KeyC' || String(e.key).toLowerCase() === 'c' || e.key === '\u00e7' || e.key === '\u00c7'
      if (e.altKey && !e.ctrlKey && !e.metaKey && isC) {
        e.preventDefault()
        e.stopPropagation()
        if (!e.repeat) toggleRef.current()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  // Escape: silence everything. Views listen for this event to pause themselves.
  const stopAll = useCallback(() => {
    tts.stop()
    stt.cancelListening()
    window.dispatchEvent(new Event('codevedha:stop'))
  }, [tts.stop, stt.cancelListening])

  useEffect(() => {
    refreshProgress()
  }, [refreshProgress])

  const value = useMemo(
    () => ({
      username, setUsername, sessionId,
      currentModule, setCurrentModule,
      difficultyLevel, setDifficultyLevel,
      lessonState, setLessonState,
      isHighContrast, toggleHighContrast, setContrast,
      fontSize, changeFontSize,
      progress, refreshProgress, speakProgress,
      tts, stt, speakAndStore, replayLast, stopAll,
    }),
    [username, sessionId, currentModule, difficultyLevel, lessonState, isHighContrast, fontSize,
      progress, tts, stt, speakAndStore, replayLast, stopAll, toggleHighContrast, setContrast,
      changeFontSize, setUsername, refreshProgress, speakProgress]
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}