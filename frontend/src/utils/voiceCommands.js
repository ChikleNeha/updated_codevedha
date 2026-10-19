const norm = (text) =>
  (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9' ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const NAV_VERB = /\b(go|move|switch|take|open|show|start|begin|navigate|jump|lets|let's|want|please)\b/
const QUESTION_WORD = /\b(what|how|why|explain|tell|when|which|is|are|does|do)\b/
const WORD_NUM = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
}
const TITLE_HINTS = [
  [/\b(variables?|print)\b/, 1],
  [/\bdata types?\b/, 2],
  [/\b(conditionals?|conditions)\b/, 3],
  [/\bloops?\b/, 4],
  [/\bfunctions?\b/, 5],
]

function toNumber(word) {
  if (/^\d+$/.test(word)) return Number(word)
  if (word === 'to' || word === 'too') return 2 // "module to" is almost always "module two"
  if (word === 'for') return 4
  return WORD_NUM[word]
}

// "go to module 3", "chapter two", "open loops". Returns a module number, or null.
//   strict: only "module or chapter + number" and "navigation verb + module title" count.
//   titles: set false where module names are ordinary words (for example when describing code).
export function parseModuleJump(text, { strict = false, titles = true } = {}) {
  const t = norm(text)
  if (!t) return null
  const withNumber = t.match(/\b(?:module|chapter)\s+(?:number\s+)?(\d+|one|two|too|to|three|four|for|five|first|second|third|fourth|fifth)\b/)
  if (withNumber) return toNumber(withNumber[1]) ?? null
  if (!strict) {
    const loose = t.match(/\b(?:lesson|topic)\s+(?:number\s+)?(\d+|one|two|three|four|five|first|second|third|fourth|fifth)\b/)
    if (loose) return toNumber(loose[1]) ?? null
  }
  if (titles && NAV_VERB.test(t) && !QUESTION_WORD.test(t) && t.split(' ').length <= 8) {
    for (const [re, n] of TITLE_HINTS) if (re.test(t)) return n
  }
  return null
}

// Questions about the learner's own progress, modules, time or level. The server answers these from real data.
const TIME_Q = /\b(how long|how much time|how many (minutes|hours)|time (is )?(left|remaining|required|needed)|how soon|duration|time (will|does|is) it (take|going))\b/
const PY_TERMS = /\b(string|list|array|tuple|word|text|variable|name|loop|range|function|dictionary|number|sentence|file)\b/
const APP_WORDS = /\b(module|modules|course|lesson|chapter|finish|learn|me|my)\b/
const APP_QUESTIONS = [
  /\b(modules?|chapters?|lessons?|topics?)\b.*\b(left|remaining|remain|to go|pending|incomplete)\b/,
  /\bhow many (more )?(modules?|chapters?|lessons?|topics?)\b/,
  /\bwhat('?s| is| are) (left|remaining|next)\b/,
  /\bwhat should i (do|learn|study) next\b/,
  /\bquiz(zes)?\b.*\b(score|taken|attempts?|best|last)\b|\bhow many quiz/,
  /\b(progress|how am i doing|how far|how many (modules? |chapters? )?(have i|did i)|my (scores?|results?)|average score|how well)\b/,
  /\b(which|what) (module|chapter|lesson|topic)( am i| are we| is this)?\b|\bwhere am i\b/,
  /\b(my level|what level|which level|current (level|difficulty))\b/,
  /\bwhat('?s| is) my name\b|\bwho am i\b/,
  /\b(what can you do|who are you)\b/,
]

// "stop reading", "be quiet": silence the voice without ending anything
const SILENCE_RE = /\b(stop|quiet|silence|pause|hold on|enough)\b.*\b(reading|talking|speaking|read)\b|\bstop (the )?(reading|talking)\b|\b(be quiet|shut up)\b/
export const isSilenceRequest = (text) => SILENCE_RE.test(norm(text))

export function isAppQuestion(text) {
  const t = norm(text)
  if (!t) return false
  if (TIME_Q.test(t) && !(PY_TERMS.test(t) && !APP_WORDS.test(t))) return true
  return APP_QUESTIONS.some((re) => re.test(t))
}

// Lesson commands. Short phrases always count. Longer phrases count when they contain a
// navigation verb, so "please move to the quiz page" works but "how do I write a quiz in code" does not.
// Returns a command name, 'goto:<module number>', or null.
export function parseCommand(text, { titles = true } = {}) {
  const t = norm(text)
  if (!t) return null
  const n = t.split(' ').length
  const nav = NAV_VERB.test(t)
  if (n > (nav ? 9 : 5)) return null
  if (/\bwhat('?s| is)? next\b|\bwhat should i\b/.test(t)) return null
  if (!/\b(quiz|test)\b/.test(t)) {
    const jump = parseModuleJump(t, { titles })
    if (jump !== null) return `goto:${jump}`
  }
  if (/\b(restart|start over|from the beginning)\b/.test(t)) return 'restart'
  if (/\b(replay|repeat|again)\b|\bread (it|that|this|the (question|quiz|options))\b/.test(t)) return 'replay'
  if (/\b(progress|how am i doing|my scores?|my results?)\b/.test(t)) return 'progress'
  if (/\b(quiz|test)\b/.test(t)) return 'quiz'
  if (/\b(go|move|back|return|open|switch|take)\b.*\blesson\b|\blesson (page|tab)\b|^lesson$/.test(t)) return 'lesson'
  if (/\b(code|coding|practice)\b/.test(t)) return 'code'
  if (/\bnext\b/.test(t)) return 'next'
  if (/\b(continue|resume|carry on|go on|keep going)\b/.test(t)) return 'resume'
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
  if (SILENCE_RE.test(t)) return { type: 'silence' } // before the check below, because "stop reading the quiz" has both words
  if (/\b(stop|quit|exit|end|cancel|finish)\b.*\b(quiz|test)\b|\b(quiz|test)\b.*\b(stop|quit|exit|end)\b|^(stop|quit|exit)$/.test(t))
    return { type: 'stop' }
  if (/\b(go|back|return|move|switch|open)\b.*\blesson\b|\blesson (page|tab)\b/.test(t)) return { type: 'nav', to: 'lesson' }
  if (/\b(go|move|switch|open)\b.*\bcode\b/.test(t)) return { type: 'nav', to: 'code' }
  // "number three" is option C in a quiz, so module jumps here need the word module or chapter
  const jump = parseModuleJump(t, { strict: true })
  if (jump !== null) return { type: 'command', cmd: `goto:${jump}` }
  if (/\b(next|previous)\b.*\b(module|chapter)\b/.test(t)) return { type: 'command', cmd: /next/.test(t) ? 'next' : 'previous' }
  if (/\b(progress|how am i doing|my scores?)\b/.test(t)) return { type: 'command', cmd: 'progress' }
  if (isAppQuestion(t)) return { type: 'ask' }
  if (/\b(repeat|again|replay|pardon|say that|read (it|that|the question)|once more|what was|didn't (hear|get))\b/.test(t))
    return { type: 'repeat' }
  const idx = letterIndex(t)
  if (idx !== null) return { type: 'answer', index: idx }
  const byText = matchOption(t, options)
  if (byText !== null) return { type: 'answer', index: byText }
  return { type: 'unclear' }
}