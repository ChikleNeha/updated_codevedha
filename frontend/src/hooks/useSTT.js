import { useCallback, useRef, useState } from 'react'

// Speech input through the browser's SpeechRecognition (Chrome, Edge, Safari).
const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null

export function useSTT() {
  const [transcript, setTranscript] = useState('')
  const [isListening, setIsListening] = useState(false)
  const recRef = useRef(null)
  const heardRef = useRef('')
  const errorRef = useRef('')
  const resolveRef = useRef(null)
  const settledRef = useRef(true)
  const timers = useRef({ silence: null, max: null })

  const clearTimers = () => {
    clearTimeout(timers.current.silence)
    clearTimeout(timers.current.max)
  }

  const settle = useCallback((text, error) => {
    if (settledRef.current) return
    settledRef.current = true
    clearTimers()
    setIsListening(false)
    const resolve = resolveRef.current
    resolveRef.current = null
    resolve?.({ text, error })
  }, [])

  // Ends the turn now; the recognizer hands over whatever it heard.
  const stopListening = useCallback(() => {
    try {
      recRef.current?.stop()
    } catch {
      /* already stopped */
    }
  }, [])

  // Throws the turn away. The pending listen() resolves with error 'cancelled'.
  const cancelListening = useCallback(() => {
    const rec = recRef.current
    recRef.current = null
    try {
      rec?.abort()
    } catch {
      /* already stopped */
    }
    settle('', 'cancelled')
  }, [settle])

  // Opens the microphone and resolves with { text, error } once the speaker pauses.
  //   silenceMs: how long a pause counts as "finished speaking"
  //   maxWaitMs: how long to wait for the first word before giving up
  const listen = useCallback(
    (opts = {}) =>
      new Promise((resolve) => {
        const { lang = 'en-IN', silenceMs = 2200, maxWaitMs = 9000 } = opts
        if (!SR) {
          resolve({ text: '', error: 'not-supported' })
          return
        }
        if (!settledRef.current) cancelListening()

        const rec = new SR()
        rec.lang = lang
        rec.continuous = true
        rec.interimResults = true
        heardRef.current = ''
        errorRef.current = ''
        settledRef.current = false
        resolveRef.current = resolve
        setTranscript('')

        rec.onresult = (e) => {
          if (recRef.current !== rec) return
          let text = ''
          for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript + ' '
          heardRef.current = text.trim()
          setTranscript(heardRef.current)
          clearTimeout(timers.current.max)
          clearTimeout(timers.current.silence)
          timers.current.silence = setTimeout(stopListening, silenceMs)
        }
        rec.onerror = (e) => {
          if (recRef.current !== rec) return
          if (e.error !== 'no-speech' && e.error !== 'aborted') errorRef.current = e.error
        }
        rec.onend = () => {
          if (recRef.current !== rec) return // a stale recognizer from an earlier turn
          recRef.current = null
          settle(heardRef.current, errorRef.current)
        }

        recRef.current = rec
        try {
          rec.start()
          setIsListening(true)
          timers.current.max = setTimeout(stopListening, maxWaitMs)
        } catch {
          recRef.current = null
          settle('', 'start-failed')
        }
      }),
    [cancelListening, settle, stopListening]
  )

  return {
    transcript,
    isListening,
    isSupported: !!SR,
    listen,
    stopListening,
    cancelListening,
  }
}