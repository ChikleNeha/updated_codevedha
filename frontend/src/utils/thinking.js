import { browserSpeak, browserStop } from './browserTTS'

// Reassuring lines spoken (and shown) one after another while the AI works, so there is never dead silence.
// They are time based, not real progress, so they only promise what is true: the work is still going on.
export const QUESTION_STEPS = [
  { at: 700, text: 'Thinking about your question.' },
  { at: 4500, text: 'The AI is writing the answer.' },
  { at: 10000, text: 'Just a minute.' },
  { at: 16000, text: 'Almost ready.' },
]
export const CODE_STEPS = [
  { at: 2500, text: 'Turning your words into code.' },
  { at: 7000, text: 'The AI is writing the Python.' },
  { at: 12000, text: 'Just a minute.' },
  { at: 18000, text: 'Almost ready.' },
]
export const LESSON_STEPS = [
  { at: 3500, text: 'The AI is writing your first card.' },
  { at: 9000, text: 'Just a minute.' },
  { at: 15000, text: 'Almost ready.' },
]
const KEEP_GOING = [
  'Still working. Thank you for waiting.',
  'This is taking a little longer. Please stay with me.',
  'Still working on it.',
]

// Returns stop(). Call it the moment the answer arrives, then speak the answer.
export function startThinking(steps, onText) {
  let stopped = false
  let spoke = false
  const timers = []
  let ticker = null
  let n = 0

  const emit = (text) => {
    if (stopped) return
    spoke = true
    if (onText) onText(text)
    browserSpeak(text) // queued, never cuts anything off; the real answer cancels whatever is left
  }

  steps.forEach(({ at, text }) => timers.push(setTimeout(() => emit(text), at)))
  const lastAt = steps[steps.length - 1].at
  timers.push(
    setTimeout(() => {
      ticker = setInterval(() => emit(KEEP_GOING[n++ % KEEP_GOING.length]), 12000)
    }, lastAt + 12000)
  )

  return () => {
    if (stopped) return
    stopped = true
    timers.forEach(clearTimeout)
    clearInterval(ticker)
    if (onText) onText('')
    if (spoke) browserStop() // drop any waiting line that has not been spoken yet
  }
}