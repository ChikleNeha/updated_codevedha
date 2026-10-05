import axios from 'axios'

const http = axios.create({ baseURL: '/api', timeout: 180000 })

export const createUser = (username, sessionId) =>
  http.post('/users', { username, session_id: sessionId }).then((r) => r.data)
export const getUser = (username) => http.get(`/users/${encodeURIComponent(username)}`).then((r) => r.data)
export const getProgress = (sessionId) => http.get(`/progress/${sessionId}`).then((r) => r.data)
export const updateProgress = (payload) => http.post('/progress', payload).then((r) => r.data)

export const getLesson = ({ sessionId, moduleId, difficulty, force = false }) =>
  http
    .post('/lesson', { session_id: sessionId, module_id: moduleId, difficulty, force })
    .then((r) => r.data)

export const prewarmLessons = ({ sessionId, difficulty, moduleIds = [2, 3, 4, 5] }) =>
  http
    .post('/lesson/prewarm', { session_id: sessionId, difficulty, module_ids: moduleIds })
    .then((r) => r.data)

export const chat = (payload) => http.post('/tutor', payload).then((r) => r.data)
export const getQuiz = (payload) => http.post('/quiz', payload).then((r) => r.data)
export const submitQuizResult = (payload) => http.post('/quiz/result', payload).then((r) => r.data)

// Added in Phase 2 (POST /api/code/run). Not used by any Phase 1 screen.
export const runCode = (payload) => http.post('/code/run', payload).then((r) => r.data)

export function errorMessage(err) {
  return (
    err?.response?.data?.detail ||
    (err?.code === 'ERR_NETWORK' ? 'Cannot reach the server. Is the backend running?' : err?.message) ||
    'Something went wrong.'
  )
}

// Server sent events over fetch (EventSource cannot POST). Returns a cancel function.
export function streamLesson({ sessionId, moduleId, difficulty, force = false }, handlers) {
  const { onStatus, onChunk, onDone, onError } = handlers
  const ctrl = new AbortController()
  let finished = false

  const handle = (raw) => {
    let event = 'message'
    let data = ''
    for (const line of raw.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) data += line.slice(5).trim()
    }
    if (!data) return
    let payload
    try {
      payload = JSON.parse(data)
    } catch {
      return
    }
    if (event === 'status') onStatus?.(payload.message)
    else if (event === 'chunk') onChunk?.(payload.text)
    else if (event === 'done') {
      finished = true
      onDone?.(payload.content, payload.cached)
    } else if (event === 'error') {
      finished = true
      onError?.(payload.message)
    }
  }

  ;(async () => {
    try {
      const res = await fetch('/api/lesson/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, module_id: moduleId, difficulty, force }),
        signal: ctrl.signal,
      })
      if (!res.ok || !res.body) throw new Error(`The server returned an error, code ${res.status}.`)
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        let idx
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          handle(buf.slice(0, idx))
          buf = buf.slice(idx + 2)
        }
      }
      if (!finished) onError?.('The lesson stopped before it finished. Please try again.')
    } catch (e) {
      if (e.name !== 'AbortError') onError?.('Cannot reach the server. Is the backend running?')
    }
  })()

  return () => ctrl.abort()
}
