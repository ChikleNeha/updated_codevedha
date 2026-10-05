export const MODULES = [
  { id: 1, title: 'Variables and Print', icon: '1', estimatedMinutes: 8,
    description: 'Store values in named boxes and show them on screen.',
    topics: ['what is a variable', 'naming rules', 'print function', 'string vs number'] },
  { id: 2, title: 'Data Types', icon: '2', estimatedMinutes: 8,
    description: 'Whole numbers, decimals, text and true or false values.',
    topics: ['integers', 'floats', 'strings', 'booleans', 'type() function'] },
  { id: 3, title: 'Conditionals', icon: '3', estimatedMinutes: 10,
    description: 'Make your program choose between paths.',
    topics: ['if', 'else', 'elif', 'comparison operators', 'nested conditions'] },
  { id: 4, title: 'Loops', icon: '4', estimatedMinutes: 10,
    description: 'Repeat work without repeating code.',
    topics: ['for loop', 'while loop', 'range()', 'break and continue'] },
  { id: 5, title: 'Functions', icon: '5', estimatedMinutes: 12,
    description: 'Package code into reusable, named steps.',
    topics: ['def', 'parameters', 'return values', 'calling functions', 'default parameters'] },
]

export const SHORTCUTS = [
  { keys: 'J or F', action: 'Interrupt the lesson and ask a question by voice' },
  { keys: 'Space or Enter', action: 'Pause or resume the lesson, or finish speaking early' },
  { keys: 'Escape', action: 'Stop all audio' },
  { keys: 'L', action: 'Open the lesson' },
  { keys: 'Q', action: 'Open the quiz' },
  { keys: 'X', action: 'Open code practice' },
  { keys: 'A, B, C or D', action: 'Answer a quiz question. R repeats the question' },
  { keys: 'Alt and C, or H', action: 'Switch high contrast on or off' },
]

export const VOICE_COMMANDS =
  'replay, restart, quiz, code, next chapter, previous chapter, help, stop, or continue'

export const DIFFICULTY_LABELS = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
}