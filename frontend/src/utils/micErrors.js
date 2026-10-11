// Microphone problems, in words a person can act on. A normal "heard nothing" is not a problem.
export const BLOCKED = [
  'not-allowed', 'service-not-allowed', 'not-supported', 'start-failed', 'audio-capture', 'network',
]

const MESSAGES = {
  'not-allowed': 'The microphone is blocked. Click the lock icon next to the address bar, allow the microphone, then reload the page.',
  'service-not-allowed': 'The microphone is blocked. Click the lock icon next to the address bar, allow the microphone, then reload the page.',
  'audio-capture': 'No microphone was found. Check that one is connected.',
  network: 'Voice recognition could not reach its service. Chrome needs an internet connection for voice input.',
  'not-supported': 'This browser does not support voice input. Please use Chrome or Edge.',
  'start-failed': 'The microphone could not start. Please try again.',
}

export const micProblem = (error) => MESSAGES[error] || null