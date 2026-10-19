import { Loader2, Mic, Volume2 } from 'lucide-react'

// The ONE status indicator used on every page. It shows what the app is doing right now:
//   busy      thinking, writing, processing (spinner)
//   listening the microphone is open
//   speaking  the app is talking
//   info      a plain state, such as "Paused" or "Reading card 2"
// It is hidden from screen readers because the same words are spoken aloud.
export default function Thinking({ text, kind = 'busy' }) {
  if (!text) return null
  return (
    <p
      aria-hidden="true"
      className={`inline-flex items-center gap-2 text-sm px-3 py-0.5 rounded-full border border-line max-w-full ${
        kind === 'listening' ? 'listening-pulse' : ''
      }`}
    >
      {kind === 'busy' && <Loader2 size={14} className="animate-spin motion-reduce:animate-none shrink-0" />}
      {kind === 'listening' && <Mic size={14} className="shrink-0" />}
      {kind === 'speaking' && <Volume2 size={14} className="shrink-0" />}
      <span>{text}</span>
    </p>
  )
}