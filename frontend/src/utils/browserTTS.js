// Speech output through the browser's built in speech engine (no server, no API key).
let voicesPromise = null
let current = null
let speakingNow = false

function loadVoices() {
  if (voicesPromise) return voicesPromise
  voicesPromise = new Promise((resolve) => {
    const synth = window.speechSynthesis
    if (!synth) return resolve([])
    const now = synth.getVoices()
    if (now.length) return resolve(now)
    const timer = setTimeout(() => resolve(synth.getVoices()), 1500)
    synth.addEventListener(
      'voiceschanged',
      () => {
        clearTimeout(timer)
        resolve(synth.getVoices())
      },
      { once: true }
    )
  })
  return voicesPromise
}

export const preloadVoices = () => loadVoices()

function pickVoice(voices) {
  return (
    voices.find((v) => v.lang === 'en-IN') ||
    voices.find((v) => v.lang.toLowerCase().startsWith('en-in')) ||
    voices.find((v) => v.lang.startsWith('en-GB')) ||
    voices.find((v) => v.lang.startsWith('en')) ||
    null
  )
}

export const isBrowserSpeaking = () => speakingNow

// hooks.onStart fires when audio really begins. hooks.onError fires if the browser refuses
// (for example before the user has pressed a key or clicked, on strict autoplay policies).
export async function browserSpeak(text, onDone, rate = 1, hooks = {}) {
  const synth = window.speechSynthesis
  if (!synth || !text) {
    onDone && onDone()
    return
  }
  const voices = await loadVoices()
  const u = new SpeechSynthesisUtterance(text)
  const voice = pickVoice(voices)
  if (voice) {
    u.voice = voice
    u.lang = voice.lang
  } else {
    u.lang = 'en-IN'
  }
  u.rate = rate
  let finished = false
  let guard = null
  const finish = () => {
    if (finished) return
    finished = true
    clearTimeout(guard)
    if (current === u) {
      current = null
      speakingNow = false
    }
    onDone && onDone()
  }
  u.onstart = () => hooks.onStart && hooks.onStart()
  u.onend = finish
  u.onerror = (e) => {
    hooks.onError && hooks.onError(e)
    finish()
  }
  // Some browsers never fire onend for long utterances; do not let the lesson hang on that.
  guard = setTimeout(finish, Math.max(5000, (text.length * 120) / rate))
  current = u // keep a reference so the utterance is not garbage collected mid speech
  speakingNow = true
  synth.speak(u)
}

export function browserStop() {
  current = null
  speakingNow = false
  if (window.speechSynthesis) window.speechSynthesis.cancel()
}