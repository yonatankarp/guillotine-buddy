import { describe, expect, test } from 'claude-code/testing'
import { FACES } from '../hooks/data/faces.generated'
import { cast, CHIME_GAP_MS, countsAsPrompt, findCharacter, isNotable, mayChime, nextFrame, pick, roster, talkMs } from '../hooks/register'

describe('register', () => {
  test('only characters with a baked face are picked, whatever the roll', () => {
    expect(cast().length).toBe(Object.keys(FACES).length)
    for (const r of [0, 0.5, 0.9999]) expect(FACES[pick(() => r).id]).toBeDefined()
  })
  test('next never brings back the character showing', () => {
    for (const r of [0, 0.5, 0.9999]) expect(pick(() => r, 'p1-piposh').id).not.toBe('p1-piposh')
  })
  test('a character is found by Hebrew or English name or id, a part being enough', () => {
    expect(findCharacter('פוסטמה')?.id).toBe('p1-pustema')
    expect(findCharacter('fritz')?.id).toBe('p1-fritz')
    expect(findCharacter('Orchid')?.id).toBe('p1-orchid')
    expect(findCharacter('r-egoz')?.id).toBe('r-egoz')
    expect(findCharacter('nobody here')).toBeNull()
    expect(findCharacter('  ')).toBeNull()
  })
  test('the list names everyone who can be met, in Hebrew and English, the one showing marked', () => {
    const lines = roster('p1-fritz').split('\n')
    expect(lines.length).toBe(cast().length)
    for (const c of cast()) expect(lines.some(l => l.includes(c.name.he) && l.includes(c.name.en))).toBe(true)
    expect(lines.filter(l => l.startsWith('▸'))).toEqual([lines.find(l => l.includes('Fritz'))!])
    expect(roster(null)).not.toContain('▸')
  })
  test('the mouth always moves: the next frame is never the one showing, and stays in range', () => {
    for (let current = 0; current <= 4; current++) {
      for (const r of [0, 0.3, 0.6, 0.9999]) {
        const f = nextFrame(current, 4, () => r)
        expect(f).not.toBe(current)
        expect(f).toBeGreaterThanOrEqual(0)
        expect(f).toBeLessThanOrEqual(4)
      }
    }
  })
  test('mid-turn lines are spaced out and never overlap one on its way', () => {
    expect(mayChime(100_000, { lastAt: 0, isBusy: false })).toBe(true)
    expect(mayChime(CHIME_GAP_MS - 1, { lastAt: 0, isBusy: false })).toBe(false)
    expect(mayChime(CHIME_GAP_MS, { lastAt: 0, isBusy: false })).toBe(true)
    expect(mayChime(100_000, { lastAt: 0, isBusy: true })).toBe(false)
  })
  test('a check, a commit, a push or a PR is worth a word mid-turn; a plain tool call is not', () => {
    expect(isNotable({ kind: 'check', key: 'npm test', ok: false })).toBe(true)
    expect(isNotable({ kind: 'commit' })).toBe(true)
    expect(isNotable({ kind: 'push' })).toBe(true)
    expect(isNotable({ kind: 'pr' })).toBe(true)
    expect(isNotable({ kind: 'tool' })).toBe(false)
  })
  test('talking lasts with the line, between 1.5 and 5 seconds', () => {
    expect(talkMs('hi')).toBe(1500)
    expect(talkMs('x'.repeat(50))).toBe(3000)
    expect(talkMs('x'.repeat(500))).toBe(5000)
  })
  test('only the person typing counts, not slash commands or other origins', () => {
    expect(countsAsPrompt({ text: 'fix it', origin: { kind: 'composer' } as never })).toBe(true)
    expect(countsAsPrompt({ text: '/clear', origin: { kind: 'composer' } as never })).toBe(false)
    expect(countsAsPrompt({ text: 'x', origin: { kind: 'sdk' } as never })).toBe(false)
    expect(countsAsPrompt({ text: 'x', origin: { kind: 'sdk' } as never }, true)).toBe(true)
  })
})
