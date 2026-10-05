import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import ModuleSidebar from '../components/ModuleSidebar'
import LessonView from '../components/LessonView'
import QuizView from '../components/QuizView'
import { MODULES, DIFFICULTY_LABELS } from '../data/curriculum'

const TABS = [
  { id: 'lesson', label: 'Lesson', key: 'L' },
  { id: 'quiz', label: 'Quiz', key: 'Q' },
  { id: 'code', label: 'Code', key: 'X' },
]

function CodePlaceholder() {
  const { speakAndStore } = useApp()
  useEffect(() => {
    speakAndStore('Code practice is coming soon. Press L to go back to the lesson.')
  }, [speakAndStore])
  return (
    <section aria-labelledby="code-h" className="p-8">
      <h2 id="code-h" className="font-lead text-2xl mb-3">Code practice</h2>
      <p className="text-muted">Voice coding practice is coming soon. Press L to return to the lesson.</p>
    </section>
  )
}

export default function LearnPage() {
  const {
    username, currentModule, difficultyLevel, isHighContrast,
    toggleHighContrast, changeFontSize, stopAll,
  } = useApp()
  const navigate = useNavigate()
  const [tab, setTab] = useState('lesson')
  const mainRef = useRef(null)

  useEffect(() => {
    if (!username) navigate('/', { replace: true })
  }, [username, navigate])

  const goTab = useCallback(
    (id) => {
      stopAll()
      setTab(id)
      requestAnimationFrame(() => mainRef.current?.focus())
    },
    [stopAll]
  )

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        stopAll()
        return
      }
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === 'l') goTab('lesson')
      else if (k === 'q') goTab('quiz')
      else if (k === 'x') goTab('code')
      else if (k === 'h') toggleHighContrast()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goTab, stopAll, toggleHighContrast])

  const mod = MODULES.find((m) => m.id === currentModule)

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <div className="flex flex-1 min-h-0 flex-col md:flex-row">
        <aside className="md:w-64 shrink-0 md:border-r border-b md:border-b-0 border-line bg-surface overflow-y-auto max-h-44 md:max-h-none">
          <ModuleSidebar onSelect={() => { setTab('lesson'); requestAnimationFrame(() => mainRef.current?.focus()) }} />
        </aside>

        <main id="main" ref={mainRef} tabIndex={-1} className="flex-1 min-w-0 min-h-0 flex flex-col outline-none">
          <header className="shrink-0 px-6 md:px-8 pt-5 flex items-center justify-between gap-4">
            <h1 className="font-lead text-2xl md:text-3xl leading-tight">
              Module {mod.id}: {mod.title}
            </h1>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-muted">{username}</span>
              <span
                className="px-3 py-0.5 rounded-full border border-line text-sm"
                aria-label={`Difficulty ${DIFFICULTY_LABELS[difficultyLevel]}`}
              >
                {DIFFICULTY_LABELS[difficultyLevel]}
              </span>
            </div>
          </header>

          <div role="tablist" aria-label="Learning sections" className="shrink-0 px-6 md:px-8 mt-3 flex gap-2 border-b border-line">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                type="button"
                aria-selected={tab === t.id}
                aria-label={`${t.label}, shortcut ${t.key}`}
                onClick={() => goTab(t.id)}
                className={`min-h-[44px] px-4 -mb-px border-b-2 ${
                  tab === t.id ? 'border-accent' : 'border-transparent text-muted'
                }`}
              >
                {t.label} ({t.key})
              </button>
            ))}
          </div>

          <div role="tabpanel" aria-label={TABS.find((t) => t.id === tab).label} className="flex-1 min-h-0">
            {tab === 'lesson' && <LessonView key={currentModule} onNavigate={goTab} />}
            {tab === 'quiz' && <QuizView key={currentModule} onNavigate={goTab} />}
            {tab === 'code' && <CodePlaceholder />}
          </div>
        </main>
      </div>

      <footer className="shrink-0 border-t border-line bg-surface px-6 py-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn-ghost"
          aria-pressed={isHighContrast}
          aria-label={`High contrast, currently ${isHighContrast ? 'on' : 'off'}. Shortcut Alt and C, or H`}
          onClick={toggleHighContrast}
        >
          Contrast (Alt+C)
        </button>
        <button type="button" className="btn-ghost" aria-label="Make text smaller" onClick={() => changeFontSize(-1)}>A-</button>
        <button type="button" className="btn-ghost" aria-label="Make text larger" onClick={() => changeFontSize(1)}>A+</button>
        <span className="text-muted text-sm">J or F to ask a question. Escape to stop audio.</span>
      </footer>
    </div>
  )
}