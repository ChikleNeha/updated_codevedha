import { useRef } from 'react'
import { useApp } from '../context/AppContext'
import { MODULES } from '../data/curriculum'

const ICONS = { not_started: '\u25CB', in_progress: '\u25D1', completed: '\u2713' }
const WORDS = { not_started: 'not started', in_progress: 'in progress', completed: 'completed' }

export default function ModuleSidebar({ onSelect }) {
  const { currentModule, setCurrentModule, progress, speakAndStore } = useApp()
  const refs = useRef([])

  const statusOf = (id) => progress.find((p) => p.module_id === id)?.status || 'not_started'
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
      <h2 className="font-lead text-2xl mb-3">Modules</h2>
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
          const active = m.id === currentModule
          return (
            <li key={m.id}>
              <button
                ref={(el) => (refs.current[i] = el)}
                type="button"
                onClick={() => choose(m)}
                onKeyDown={(e) => onKeyDown(e, i)}
                aria-current={active ? 'true' : undefined}
                aria-label={`Module ${m.id}: ${m.title}, ${WORDS[status]}${active ? ', selected' : ''}`}
                className={`w-full min-h-[44px] text-left px-3 py-2 rounded-md border flex items-center gap-3 ${
                  active ? 'bg-raised border-accent' : 'border-line hover:bg-raised'
                }`}
              >
                <span aria-hidden="true" className="w-5 text-center">{ICONS[status]}</span>
                <span>{m.title}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
