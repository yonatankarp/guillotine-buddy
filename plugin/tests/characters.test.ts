import { describe, expect, test } from 'claude-code/testing'
import { CHARACTERS } from '../hooks/characters'
import { FACES } from '../hooks/data/faces.generated'
import { LINE_MAX } from '../hooks/speech'

describe('characters', () => {
  test('every character has a face, a voice, catchphrases and lines of their own', () => {
    expect(new Set(CHARACTERS.map(c => c.id)).size).toBe(CHARACTERS.length)
    for (const c of CHARACTERS) {
      expect(FACES[c.id]).toBeDefined()
      expect(c.voice.length).toBeGreaterThan(100)
      expect(c.catchphrases.length).toBeGreaterThanOrEqual(2)
      expect(c.lines.length).toBeGreaterThanOrEqual(5)
      expect(new Set(c.lines).size).toBe(c.lines.length)
      expect(new Set(c.catchphrases).size).toBe(c.catchphrases.length)
      for (const l of [...c.lines, ...c.catchphrases]) expect(l.length).toBeLessThanOrEqual(LINE_MAX)
    }
  })
})
