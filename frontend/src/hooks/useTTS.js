import { useCallback, useEffect, useRef, useState } from 'react'
import { browserSpeak, browserStop, isBrowserSpeaking } from '../utils/browserTTS'
import { cleanForSpeech, splitText } from '../utils/speech'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Resolves when nothing is being spoken, or after maxMs.
export function waitUntilDone(maxMs = 30000) {
  return new Promise((resolve) => {
    const start = Date.now()
    const tick = () => {
      if (!isBrowserSpeaking() || Date.now() - start > maxMs) resolve()
      else setTimeout(tick, 100)
    }
    tick()
  })
}

// Browsers only allow speech after a user gesture. Speaking a silent utterance inside
// the first key press or click unlocks it for the rest of the page.
let unlocked = false
export function unlockAudio() {
  if (unlocked || !window.speechSynthesis) return
  unlocked = true
  const u = new SpeechSynthesisUtterance(' ')
  u.volume = 0
  window.speechSynthesis.speak(u)
}

if (typeof window !== 'undefined') {
  ;['keydown', 'click', 'touchstart'].forEach((evt) =>
    window.addEventListener(evt, unlockAudio, { capture: true, passive: true })
  )
}

export function useTTS() {
  const genRef = useRef(0) // bumping this cancels any speak() loop that is still running
  const [isSpeaking, setIsSpeaking] = useState(false)

  const speak = useCallback(async (text, rate = 1) => {
    const gen = ++genRef.current
    const chunks = splitText(cleanForSpeech(text))
    browserStop()
    if (!chunks.length) {
      setIsSpeaking(false)
      return
    }
    await sleep(60) // Chrome drops an utterance queued in the same tick as cancel()
    setIsSpeaking(true)
    for (const chunk of chunks) {
      if (gen !== genRef.current) return
      await new Promise((resolve) => browserSpeak(chunk, resolve, rate))
    }
    if (gen === genRef.current) setIsSpeaking(false)
  }, [])

  const stop = useCallback(() => {
    genRef.current++
    browserStop()
    setIsSpeaking(false)
  }, [])

  useEffect(() => () => browserStop(), [])

  return { speak, stop, isSpeaking }
}
