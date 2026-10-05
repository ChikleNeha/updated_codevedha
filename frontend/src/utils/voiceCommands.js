const norm = (text) =>
  (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9' ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// Lesson commands. Short phrases always count. Longer phrases count when they contain a
// navigation verb, so "please move to the quiz page" works but "how do I write a quiz in code" does not.
export function parseCommand(text) {
  const t = norm(text)
  if (!t) return null
  const n = t.split(' ').length
  const nav = /\b(go|move|switch|take|open|show|start|begin|navigate|jump|lets|let's|want|please)\b/.test(t)
  if (n > (nav ? 9 : 5)) return null
  if (/\b(restart|start over|from the beginning)\b/.test(t)) return 'restart'
  if (/\b(replay|repeat|again)\b/.test(t)) return 'replay'
  if (/\b(quiz|test)\b/.test(t)) return 'quiz'
  if (/\b(code|coding|practice)\b/.test(t)) return 'code'
  if (/\bnext\b/.test(t)) return 'next'
  if (/\b(back to|return to)\b.*\blesson\b|\b(continue|resume|carry on|go on|keep going)\b|^lesson$/.test(t)) return 'resume'
  if (/\b(previous|go back)\b/.test(t)) return 'previous'
  if (/\bhelp\b/.test(t)) return 'help'
  if (/\bcontrast\b/.test(t)) return 'contrast'
  if (/\b(stop|pause|quiet|silence)\b/.test(t)) return 'stop'
  return null
}

const YES = /\b(yes|yeah|yep|yup|sure|ok|okay|continue|go ahead|proceed|please|resume|haan|ha|of course|do it|carry on|ready)\b/
const NO = /\b(no|nope|nah|not yet|wait|hold on|stop|don't|dont|never mind|nevermind|cancel|nahi|later)\b/

// 'yes', 'no', or null when it is neither
export function classifyYesNo(text) {
  const t = norm(text)
  if (!t) return null
  const y = YES.test(t)
  const n = NO.test(t)
  if (y && !n) return 'yes'
  if (n && !y) return 'no'
  return null
}

// What the learner said after "Should I send that, or do you want to add more?"
export function classifySubmit(text) {
  const t = norm(text)
  if (!t) return { type: 'submit' }
  if (/\b(cancel|discard|forget it|never mind|nevermind|drop it)\b/.test(t)) return { type: 'cancel' }
  if (/\b(retry|redo|start over|try again|say it again|change it)\b/.test(t)) return { type: 'retry' }
  if (/\b(more|add|something else|wait|hold on|not yet|no|nope|nah)\b/.test(t)) return { type: 'more' }
  if (/\b(yes|yeah|yep|sure|ok|okay|send|submit|go ahead|correct|right|done|perfect|good|proceed|please)\b/.test(t))
    return { type: 'submit' }
  if (t.split(' ').length >= 3) return { type: 'addition', text: text.trim() }
  return { type: 'submit' }
}

const LETTER_WORDS = {
  0: ['a', 'eh', 'ay', 'first', 'one', '1', 'alpha'],
  1: ['b', 'be', 'bee', 'second', 'two', '2', 'bravo'],
  2: ['c', 'see', 'sea', 'third', 'three', '3', 'charlie'],
  3: ['d', 'dee', 'fourth', 'four', '4', 'delta'],
}
const MARKER = /\b(option|answer|choice|letter|pick|choose|select|number)\b/
const STOP_WORDS = new Set(['a', 'an', 'the', 'is', 'of', 'to', 'it', 'in', 'and', 'or', 'for'])

function letterIndex(t) {
  const tokens = t.split(' ')
  const marked = MARKER.test(t)
  if (tokens.length > 4 && !marked) return null
  const found = new Set()
  tokens.forEach((tok) => {
    for (const [idx, words] of Object.entries(LETTER_WORDS)) {
      if (!words.includes(tok)) continue
      // a lone "a" inside a sentence is the article, not the letter
      if (tok === 'a' && tokens.length > 1 && !marked) continue
      found.add(Number(idx))
    }
  })
  return found.size === 1 ? [...found][0] : null
}

function matchOption(t, options) {
  const spoken = new Set(t.split(' ').filter((w) => !STOP_WORDS.has(w)))
  if (!spoken.size) return null
  const scores = options.map((o) => {
    const toks = norm(o).split(' ').filter((w) => w && !STOP_WORDS.has(w))
    if (!toks.length) return 0
    return toks.filter((w) => spoken.has(w)).length / toks.length
  })
  const best = Math.max(...scores)
  const idx = scores.indexOf(best)
  const second = Math.max(...scores.filter((_, i) => i !== idx))
  return best >= 0.75 && best - second >= 0.2 ? idx : null
}

// Decides what a spoken reply to a quiz question means.
export function interpretQuizSpeech(text, options) {
  const t = norm(text)
  if (!t) return { type: 'none' }
  if (/\b(stop|quit|exit|end|cancel|finish)\b.*\b(quiz|test)\b|\b(quiz|test)\b.*\b(stop|quit|exit|end)\b|^(stop|quit|exit)$/.test(t))
    return { type: 'stop' }
  if (/\b(go|back|return|move|switch|open)\b.*\blesson\b|\blesson (page|tab)\b/.test(t)) return { type: 'nav', to: 'lesson' }
  if (/\b(go|move|switch|open)\b.*\bcode\b/.test(t)) return { type: 'nav', to: 'code' }
  if (/\b(repeat|again|replay|pardon|say that|read (it|that|the question)|once more|what was|didn't (hear|get))\b/.test(t))
    return { type: 'repeat' }
  const idx = letterIndex(t)
  if (idx !== null) return { type: 'answer', index: idx }
  const byText = matchOption(t, options)
  if (byText !== null) return { type: 'answer', index: byText }
  return { type: 'unclear' }
}