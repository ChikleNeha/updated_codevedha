// Helpers that turn lesson text into something a speech engine reads well,
// and that split a streaming lesson into cards while it is still being written.

const EMOJI = /[\p{Extended_Pictographic}\u2713\u2714\u25CB\u25D1]/gu

export function cleanForSpeech(text) {
  return (text || '')
    .replace(/```[a-z]*/gi, ' ')
    .replace(EMOJI, '')
    .replace(/[*#`_~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Removes markdown markers (heading hashes, stars, backticks) from prose.
export function plain(text) {
  return (text || '')
    .replace(/^[ \t]*#{1,6}[ \t]*/gm, '')
    .replace(/[*`]/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

export function splitText(text, max = 220) {
  const sentences = text.split(/(?<=[.!?])\s+/)
  const chunks = []
  let buf = ''
  const push = (s) => {
    if (s.trim()) chunks.push(s.trim())
  }
  for (const s of sentences) {
    if (s.length > max) {
      push(buf)
      buf = ''
      let rest = s
      while (rest.length > max) {
        let cut = rest.lastIndexOf(' ', max)
        if (cut < max / 2) cut = max
        push(rest.slice(0, cut))
        rest = rest.slice(cut)
      }
      buf = rest
    } else if ((buf + ' ' + s).length > max) {
      push(buf)
      buf = s
    } else {
      buf = buf ? buf + ' ' + s : s
    }
  }
  push(buf)
  return chunks
}

const SYMBOLS = [
  ['==', ' double equals '],
  ['!=', ' not equals '],
  ['<=', ' less than or equal to '],
  ['>=', ' greater than or equal to '],
  ['=', ' equals '],
  ['(', ' open bracket '],
  [')', ' close bracket '],
  ['[', ' open square bracket '],
  [']', ' close square bracket '],
  ['{', ' open curly bracket '],
  ['}', ' close curly bracket '],
  ['"', ' quote '],
  ["'", ' quote '],
  [':', ' colon '],
  [',', ' comma '],
  ['+', ' plus '],
  ['-', ' minus '],
  ['*', ' star '],
  ['/', ' slash '],
  ['<', ' less than '],
  ['>', ' greater than '],
  ['_', ' underscore '],
  ['#', ' hash '],
  ['%', ' percent '],
]

export function codeToSpeech(code) {
  let out = code.trim()
  for (const [sym, word] of SYMBOLS) out = out.split(sym).join(word)
  return out.replace(/\n+/g, '. ').replace(/\s+/g, ' ').trim()
}

export function splitBody(body) {
  const parts = []
  const re = /```[a-zA-Z]*\n?([\s\S]*?)```/g
  let last = 0
  let m
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) parts.push({ type: 'text', value: body.slice(last, m.index).trim() })
    parts.push({ type: 'code', value: m[1].replace(/\n$/, '') })
    last = m.index + m[0].length
  }
  if (last < body.length) parts.push({ type: 'text', value: body.slice(last).trim() })
  return parts.filter((p) => p.value)
}

// A card ends at a line of three dashes, or where the next card's heading (two or more hashes) starts.
// A single hash is left alone because it is a Python comment inside a code example.
const BLOCK_SPLIT = /\n[ \t]*-{3,}[ \t]*(?:\n|$)|\n(?=[ \t]*#{2,6}[ \t]*\S)/

function toCard(block, number) {
  const lines = block.trim().split('\n')
  let title = `Part ${number}`
  if (/^\s*#{1,6}\s*\S/.test(lines[0])) title = plain(lines.shift()) || title
  return { title, body: lines.join('\n').trim() }
}

// Returns the cards that are finished so far, plus the text of the card still being written.
export function parseCardsPartial(raw) {
  const blocks = (raw || '').replace(/\r/g, '').split(BLOCK_SPLIT)
  const complete = []
  for (let i = 0; i < blocks.length - 1; i++) {
    const b = blocks[i]
    if (!b.trim()) continue
    // a stray one line preamble before the first heading is not a lesson card
    if (complete.length === 0 && i === 0 && !/^\s*#{1,6}/.test(b) && b.trim().split('\n').length <= 1) continue
    complete.push(toCard(b, complete.length + 1))
  }
  return { complete, draft: blocks[blocks.length - 1] || '' }
}

export function parseCards(raw) {
  return parseCardsPartial((raw || '') + '\n---\n').complete
}

export function draftText(draft) {
  return plain(draft.replace(/[-\s]+$/, ''))
}

export function speechOf(card) {
  const parts = splitBody(card.body).map((p) =>
    p.type === 'code' ? `Code example. ${codeToSpeech(p.value)}. End of code example.` : cleanForSpeech(plain(p.value))
  )
  return `${cleanForSpeech(card.title)}. ${parts.join(' ')}`
}