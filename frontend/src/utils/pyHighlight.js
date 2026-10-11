// A tiny Python tokenizer for coloring code. No library needed.
const KEYWORDS = new Set([
  'False', 'None', 'True', 'and', 'as', 'break', 'class', 'continue', 'def', 'del', 'elif', 'else',
  'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'not', 'or',
  'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
])
const BUILTINS = new Set([
  'print', 'range', 'len', 'int', 'float', 'str', 'bool', 'list', 'dict', 'set', 'tuple', 'type',
  'sum', 'min', 'max', 'abs', 'round', 'sorted', 'enumerate', 'zip',
])

const TOKEN =
  /(#.*$)|("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(\b\d+(?:\.\d+)?\b)|(\b[A-Za-z_]\w*\b)/gm

// Returns [{ text, cls }] where cls is '' for plain text.
export function highlightPython(code) {
  const out = []
  let last = 0
  let m
  TOKEN.lastIndex = 0
  while ((m = TOKEN.exec(code)) !== null) {
    if (m.index > last) out.push({ text: code.slice(last, m.index), cls: '' })
    let cls = ''
    if (m[1]) cls = 'tok-com'
    else if (m[2]) cls = 'tok-str'
    else if (m[3]) cls = 'tok-num'
    else if (KEYWORDS.has(m[4])) cls = 'tok-kw'
    else if (BUILTINS.has(m[4])) cls = 'tok-bi'
    out.push({ text: m[0], cls })
    last = m.index + m[0].length
  }
  if (last < code.length) out.push({ text: code.slice(last), cls: '' })
  return out
}