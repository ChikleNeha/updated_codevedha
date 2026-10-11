import { useRef } from 'react'
import { BookOpen, Check, Circle, CircleDot } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { MODULES } from '../data/curriculum'

const ICONS = { not_started: Circle, in_progress: CircleDot, completed: Check }
const WORDS = { not_started: 'not started', in_progress: 'in progress', completed: 'completed' }

export default function ModuleSidebar({ onSelect }) {
  const { currentModule, setCurrentModule, progress, speakAndStore } = useApp()
  const refs = useRef([])

  const itemOf = (id) => progress.find((p) => p.module_id === id)
  const statusOf = (id) => itemOf(id)?.status || 'not_started'
  const done = MODULES.filter((m) => statusOf(m.id) === 'completed').length

  const choose = (m) => {
    setCurrentModule(m.id)
    speakAndStore(`Module ${m.id}. ${m.title}.`)
    onSelect?.()
  }

  const onKeyDown = (e, i) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const next = (i + (e.key === 'ArrowDown' ? 1 : -1) + MODULES.length) % MODULES.length
      refs.current[next]?.focus()
    }
  }

  return (
    <nav aria-label="Modules" className="p-5">
      <h2 className="font-lead text-xl mb-3 flex items-center gap-2">
        <BookOpen size={20} aria-hidden="true" />
        Modules
      </h2>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={MODULES.length}
        aria-valuenow={done}
        aria-label={`${done} of ${MODULES.length} modules complete`}
        className="mb-1 h-2 rounded bg-raised overflow-hidden"
      >
        <div className="h-full bg-accent" style={{ width: `${(done / MODULES.length) * 100}%` }} />
      </div>
      <p className="text-sm text-muted mb-4">{done}/{MODULES.length} modules complete</p>
      <ul className="space-y-2">
        {MODULES.map((m, i) => {
          const status = statusOf(m.id)
          const score = itemOf(m.id)?.quiz_score || 0
          const active = m.id === currentModule
          const Icon = ICONS[status]
          return (
            <li key={m.id}>
              <button
                ref={(el) => (refs.current[i] = el)}
                type="button"
                onClick={() => choose(m)}
                onKeyDown={(e) => onKeyDown(e, i)}
                aria-current={active ? 'true' : undefined}
                aria-label={`Module ${m.id}: ${m.title}, ${WORDS[status]}${status === 'completed' ? `, quiz score ${score} percent` : ''}${active ? ', selected' : ''}`}
                className={`w-full min-h-[44px] text-left px-3 py-2 rounded-md border flex items-center gap-3 ${
                  active ? 'bg-raised border-accent' : 'border-line hover:bg-raised'
                }`}
              >
                <Icon size={18} aria-hidden="true" className="shrink-0" />
                <span className="flex-1">{m.title}</span>
                {status === 'completed' && (
                  <span aria-hidden="true" className="text-sm text-muted">{score}%</span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}