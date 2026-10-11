import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BookOpen, Contrast, GraduationCap, Home, ListChecks, Mic, Terminal, User, ZoomIn, ZoomOut,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import ModuleSidebar from '../components/ModuleSidebar'
import LessonView from '../components/LessonView'
import QuizView from '../components/QuizView'
import CodeView from '../components/CodeView'
import { DIFFICULTY_LABELS, MODULES, SHORTCUTS, VOICE_COMMANDS } from '../data/curriculum'

const TABS = [
  { id: 'lesson', label: 'Lesson', key: 'L', Icon: BookOpen },
  { id: 'quiz', label: 'Quiz', key: 'Q', Icon: ListChecks },
  { id: 'code', label: 'Code', key: 'X', Icon: Terminal },
]

// What you can say on each page, shown on screen for people who can see.
const HINTS = {
  lesson: 'Say: replay, next module, module 3, quiz, code, progress, help. Press J to ask a question.',
  quiz: 'Say: A, B, C or D, repeat, stop the quiz, lesson, module 3, progress. Press J for commands.',
  code: 'Press Space and describe code. Say: repeat, clear history, lesson, quiz, module 3. Press J for commands.',
}

// States in which pressing P (progress summary) will not talk over anything.
const IDLE_STATES = ['idle', 'paused', 'done', 'error', 'waiting']

export default function LearnPage() {
  const {
    username, currentModule, setCurrentModule, difficultyLevel, isHighContrast, lessonState, stt,
    toggleHighContrast, changeFontSize, stopAll, speakAndStore, speakProgress,
  } = useApp()
  const navigate = useNavigate()
  const [tab, setTab] = useState('lesson')
  const mainRef = useRef(null)
  const mountedAt = useRef(Date.now())

  useEffect(() => {
    if (!username) navigate('/', { replace: true })
  }, [username, navigate])

  const focusMain = () => requestAnimationFrame(() => mainRef.current?.focus())

  const goTab = useCallback(
    (id) => {
      stopAll()
      setTab(id)
      focusMain()
    },
    [stopAll]
  )

  // Jump to any module by number. Always lands on that module's lesson.
  const gotoModule = useCallback(
    (n) => {
      const m = MODULES.find((x) => x.id === n)
      if (!m) {
        speakAndStore(`There is no module ${n}. The modules are numbered one to ${MODULES.length}.`)
        return
      }
      if (n === currentModule && tab === 'lesson') {
        speakAndStore(`You are already on module ${n}.`)
        return
      }
      stopAll()
      setCurrentModule(n)
      setTab('lesson')
      focusMain()
      speakAndStore(`Module ${m.id}. ${m.title}.`)
    },
    [currentModule, tab, stopAll, setCurrentModule, speakAndStore]
  )

  // One place for every spoken command that works the same on all pages. Returns true if it was handled.
  const onCommand = useCallback(
    (cmd) => {
      if (!cmd) return false
      if (cmd.startsWith('goto:')) {
        gotoModule(Number(cmd.slice(5)))
        return true
      }
      switch (cmd) {
        case 'quiz':
          goTab('quiz')
          return true
        case 'code':
          goTab('code')
          return true
        case 'lesson':
          goTab('lesson')
          return true
        case 'next':
          gotoModule(currentModule + 1)
          return true
        case 'previous':
          gotoModule(currentModule - 1)
          return true
        case 'progress':
          speakProgress()
          return true
        case 'contrast':
          toggleHighContrast()
          return true
        case 'help': {
          const keys = SHORTCUTS.map((s) => `${s.keys}: ${s.action}`).join('. ')
          speakAndStore(`Voice commands: ${VOICE_COMMANDS}. Keyboard shortcuts. ${keys}.`)
          return true
        }
        default:
          return false
      }
    },
    [gotoModule, goTab, currentModule, speakProgress, toggleHighContrast, speakAndStore]
  )

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        stopAll()
        return
      }
      // ignore stray keys that arrive just as the page opens
      if (Date.now() - mountedAt.current < 1200 || e.repeat) return
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === 'l') goTab('lesson')
      else if (k === 'q') goTab('quiz')
      else if (k === 'x') goTab('code')
      else if (k === 'h') toggleHighContrast()
      else if (k === 'p' && IDLE_STATES.includes(lessonState)) speakProgress()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goTab, stopAll, toggleHighContrast, speakProgress, lessonState])

  const mod = MODULES.find((m) => m.id === currentModule)

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Always visible navigation: page names, voice button, who you are, and your level. */}
      <header className="shrink-0 border-b border-line bg-surface px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          className="btn-ghost flex items-center gap-2"
          aria-label="Home. This returns to the welcome page where you can change your name."
          onClick={() => { stopAll(); navigate('/') }}
        >
          <Home size={18} aria-hidden="true" />
          <span className="font-lead text-xl leading-none">CodeVedha</span>
        </button>

        <nav aria-label="Pages" className="flex gap-2">
          {TABS.map(({ id, label, key, Icon }) => (
            <button
              key={id}
              type="button"
              aria-current={tab === id ? 'page' : undefined}
              aria-label={`${label} page, shortcut ${key}`}
              onClick={() => goTab(id)}
              className={`min-h-[44px] px-4 rounded-md border flex items-center gap-2 ${
                tab === id ? 'bg-raised border-accent' : 'border-line text-muted hover:bg-raised'
              }`}
            >
              <Icon size={18} aria-hidden="true" />
              {label}
              <span aria-hidden="true" className="text-xs text-muted">({key})</span>
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            className={`btn-ghost flex items-center gap-2 ${stt.isListening ? 'listening-pulse' : ''}`}
            aria-label="Speak a command. Shortcut J or F"
            onClick={() => window.dispatchEvent(new Event('codevedha:interrupt'))}
          >
            <Mic size={18} aria-hidden="true" />
            Speak (J)
          </button>
          <span className="text-muted flex items-center gap-1.5">
            <User size={16} aria-hidden="true" />
            {username}
          </span>
          <span
            key={difficultyLevel}
            className="badge-pop px-3 py-0.5 rounded-full border border-line text-sm flex items-center gap-1.5"
            aria-label={`Difficulty ${DIFFICULTY_LABELS[difficultyLevel]}`}
          >
            <GraduationCap size={16} aria-hidden="true" />
            {DIFFICULTY_LABELS[difficultyLevel]}
          </span>
        </div>
      </header>

      {/* Live captions: shows what the microphone is hearing. */}
      {stt.isListening && (
        <p role="status" className="shrink-0 px-4 py-1 text-sm bg-raised border-b border-line flex items-center gap-2">
          <Mic size={14} aria-hidden="true" />
          Listening: {stt.transcript || '...'}
        </p>
      )}

      <div className="flex flex-1 min-h-0 flex-col md:flex-row">
        <aside className="md:w-64 shrink-0 md:border-r border-b md:border-b-0 border-line bg-surface overflow-y-auto max-h-44 md:max-h-none">
          <ModuleSidebar onSelect={() => { setTab('lesson'); focusMain() }} />
        </aside>

        <main id="main" ref={mainRef} tabIndex={-1} className="flex-1 min-w-0 min-h-0 flex flex-col outline-none">
          <h1 className="shrink-0 px-6 md:px-8 pt-4 font-lead text-xl md:text-2xl leading-tight">
            Module {mod.id}: {mod.title}
          </h1>
          <div role="region" aria-label={TABS.find((t) => t.id === tab).label} className="flex-1 min-h-0">
            {tab === 'lesson' && <LessonView key={currentModule} onNavigate={goTab} />}
            {tab === 'quiz' && <QuizView key={currentModule} onNavigate={goTab} onCommand={onCommand} />}
            {tab === 'code' && <CodeView key={currentModule} onCommand={onCommand} />}
          </div>
        </main>
      </div>

      <footer className="shrink-0 border-t border-line bg-surface px-4 py-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn-ghost flex items-center gap-2"
          aria-pressed={isHighContrast}
          aria-label={`High contrast, currently ${isHighContrast ? 'on' : 'off'}. Shortcut Alt and C, or H`}
          onClick={toggleHighContrast}
        >
          <Contrast size={18} aria-hidden="true" />
          Contrast
        </button>
        <button type="button" className="btn-ghost" aria-label="Make text smaller" onClick={() => changeFontSize(-1)}>
          <ZoomOut size={18} aria-hidden="true" />
        </button>
        <button type="button" className="btn-ghost" aria-label="Make text larger" onClick={() => changeFontSize(1)}>
          <ZoomIn size={18} aria-hidden="true" />
        </button>
        <span className="text-muted text-sm">{HINTS[tab]} Escape stops audio.</span>
      </footer>
    </div>
  )
}