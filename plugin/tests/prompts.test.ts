import { describe, expect, test } from 'claude-code/testing'
import type { Character } from '../hooks/characters'
import { speechPrompt, type Conversation, type Moment } from '../hooks/prompts'

const pustema: Character = {
  id: 'p1-pustema', game: 'Piposh', name: { he: 'פוסטמה', en: 'Pustema' },
  voice: 'a fortune teller who sees doom in everything',
  catchphrases: ['אוי ואבוי!', 'הקלפים לא משקרים'],
  lines: ['אני רואה... אני רואה צרות!', 'הכדור אומר שמשהו נורא יקרה'],
}

const turn = (talk: Conversation, more: { moment?: Moment; facts?: string; phrase?: string | null; recent?: string[] } = {}) => ({ moment: 'done' as Moment, talk, facts: '', phrase: null, recent: [], ...more })
const NO_PHRASE = '\n\nNo catchphrase this time.'

describe('prompts', () => {
  test('the persona is the character, in their own concerns and way of talking, never an assistant, with room for a short sentence or two', () => {
    const { system } = speechPrompt(pustema, turn({ prompt: 'x', answer: null }))
    expect(system).toContain('you are still entirely yourself')
    expect(system).toContain('Those lines are you')
    expect(system).toContain('never sound like a helpful assistant')
    expect(system).toContain('at most 20 words')
  })
  test('the system prompt carries the game, the voice and every game line; the prompt the conversation', () => {
    const p = speechPrompt(pustema, turn({ prompt: 'fix the build', answer: 'Fixed it.' }))
    expect(p.system).toContain('Pustema (פוסטמה)')
    expect(p.system).toContain('Piposh')
    expect(p.system).toContain('sees doom')
    expect(p.system).toContain('Speak Hebrew')
    expect(p.system).toContain('as it was recorded:\n- אני רואה... אני רואה צרות!\n- הכדור אומר שמשהו נורא יקרה')
    expect(p.prompt).toBe('The developer asked: fix the build\nClaude has finished.\nClaude answered: Fixed it.' + NO_PHRASE)
    expect(speechPrompt({ ...pustema, lines: [] }, turn({ prompt: 'x', answer: null })).system).not.toContain('as it was recorded')
  })
  test('the system prompt is the same whatever the turn, so it stays cached', () => {
    const a = speechPrompt(pustema, turn({ prompt: 'x', answer: null }))
    const b = speechPrompt(pustema, turn({ prompt: 'y', answer: 'z' }, { moment: 'working', phrase: 'אוי ואבוי!', recent: ['שורה'] }))
    expect(a.system).toBe(b.system)
  })
  test('catchphrases are part of the voice but occasional: a line names the one it carries, or is told to carry none', () => {
    const system = speechPrompt(pustema, turn({ prompt: 'x', answer: null })).system
    expect(system).toContain('said only now and then: אוי ואבוי! / הקלפים לא משקרים')
    const p = speechPrompt(pustema, turn({ prompt: 'x', answer: null }, { phrase: 'הקלפים לא משקרים' }))
    expect(p.prompt).toBe('The developer asked: x\nClaude has finished.\n\nWork in your catchphrase "הקלפים לא משקרים".')
    expect(p.prompt).not.toContain('אוי ואבוי')
    expect(speechPrompt(pustema, turn({ prompt: 'x', answer: null })).prompt).toBe('The developer asked: x\nClaude has finished.' + NO_PHRASE)
    expect(speechPrompt({ ...pustema, catchphrases: [] }, turn({ prompt: 'x', answer: null })).prompt).toBe('The developer asked: x\nClaude has finished.')
  })
  test('what got done and the lines already said reach the prompt; nothing is said of them when there are none', () => {
    const p = speechPrompt(pustema, turn({ prompt: 'x', answer: null }, { facts: '1 commit', recent: ['שורה קודמת'] }))
    expect(p.prompt).toContain('What got done: 1 commit')
    expect(p.prompt).toContain('You already said these; say something new:\n- שורה קודמת')
    expect(speechPrompt(pustema, turn({ prompt: 'x', answer: null })).prompt).toBe('The developer asked: x\nClaude has finished.' + NO_PHRASE)
  })
  test('the line knows its moment: Claude still at it, something that just happened, or the end of the turn', () => {
    expect(speechPrompt(pustema, turn({ prompt: 'fix it', answer: null }, { moment: 'working' })).prompt).toBe('The developer asked: fix it\nClaude is still working on it.' + NO_PHRASE)
    expect(speechPrompt(pustema, turn({ prompt: 'fix it', answer: null }, { moment: 'event', facts: 'checks: npm test failed' })).prompt)
      .toBe('The developer asked: fix it\nThis just happened while Claude works: checks: npm test failed' + NO_PHRASE)
    expect(speechPrompt(pustema, turn({ prompt: 'fix it', answer: 'Done.' }, { facts: '1 commit' })).prompt)
      .toBe('The developer asked: fix it\nClaude has finished.\nClaude answered: Done.\nWhat got done: 1 commit' + NO_PHRASE)
  })
  test('the character speaks Hebrew alone, whatever language the conversation is in', () => {
    expect(speechPrompt(pustema, turn({ prompt: 'fix the build', answer: 'Done.' })).system).toContain('Speak Hebrew alone, whatever language the developer or Claude wrote in')
    expect(speechPrompt(pustema, turn({ prompt: null, answer: null })).prompt).toBe('Claude has finished.' + NO_PHRASE)
  })
  test('the conversation is cut at 300 characters each', () => {
    const p = speechPrompt(pustema, turn({ prompt: 'a'.repeat(500), answer: 'b'.repeat(500) }))
    expect(p.prompt).toContain('a'.repeat(300) + '\n')
    expect(p.prompt).not.toContain('a'.repeat(301))
  })
})
