import type { ModelCompleteRequest, ModelCompleteResult } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'
import type { Character } from '../hooks/characters'
import { catchphrase, cleanReply, examples, fallback, speak, speechPrompt, turnFacts, type Conversation, type Moment } from '../hooks/speech'

const usage = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
const client = (complete: (r: ModelCompleteRequest) => ModelCompleteResult | Promise<ModelCompleteResult>) => ({ model: { complete: async (r: ModelCompleteRequest) => complete(r) } })

const pustema: Character = {
  id: 'p1-pustema', game: 'Piposh', name: { he: 'פוסטמה', en: 'Pustema' },
  voice: 'a fortune teller who sees doom in everything',
  catchphrases: ['אוי ואבוי!', 'הקלפים לא משקרים'],
  lines: ['אני רואה... אני רואה צרות!', 'שורה ארוכה מאוד מאוד מאוד מאוד מאוד מאוד מאוד מאוד מאוד מאוד מאוד מאוד מאוד מאוד'],
}

const turn = (talk: Conversation, more: { moment?: Moment; facts?: string; phrase?: string | null; examples?: string[]; recent?: string[] } = {}) => ({ moment: 'done' as Moment, talk, facts: '', phrase: null, examples: [], recent: [], ...more })
const NO_PHRASE = '\n\nNo catchphrase this time.'

describe('speech', () => {
  test('the system prompt carries the game and the voice; the prompt the sampled lines and the conversation', () => {
    const p = speechPrompt(pustema, 'he', turn({ prompt: 'fix the build', answer: 'Fixed it.' }, { examples: ['אני רואה... אני רואה צרות!'] }))
    expect(p.system).toContain('Pustema (פוסטמה)')
    expect(p.system).toContain('Piposh')
    expect(p.system).toContain('sees doom')
    expect(p.system).toContain('Speak Hebrew')
    expect(p.system).not.toContain('אני רואה צרות')
    expect(p.prompt).toBe('Some lines you said in the game, for your voice. Match their style; never repeat one word for word:\n- אני רואה... אני רואה צרות!\n\n'
      + 'The developer asked: fix the build\nClaude has finished.\nClaude answered: Fixed it.' + NO_PHRASE)
  })
  test('the system prompt is the same whatever lines are sampled, so it stays cached', () => {
    const a = speechPrompt(pustema, 'he', turn({ prompt: 'x', answer: null }, { examples: [pustema.lines[0]!] }))
    const b = speechPrompt(pustema, 'he', turn({ prompt: 'y', answer: null }, { examples: [pustema.lines[1]!], phrase: 'אוי ואבוי!' }))
    expect(a.system).toBe(b.system)
  })
  test('catchphrases are part of the voice but occasional: a line names the one it carries, or is told to carry none', () => {
    const system = speechPrompt(pustema, 'he', turn({ prompt: 'x', answer: null })).system
    expect(system).toContain('said only now and then: אוי ואבוי! / הקלפים לא משקרים')
    const p = speechPrompt(pustema, 'he', turn({ prompt: 'x', answer: null }, { phrase: 'הקלפים לא משקרים' }))
    expect(p.prompt).toBe('The developer asked: x\nClaude has finished.\n\nThis time, work in your catchphrase "הקלפים לא משקרים".')
    expect(p.prompt).not.toContain('אוי ואבוי')
    expect(speechPrompt(pustema, 'he', turn({ prompt: 'x', answer: null })).prompt).toBe('The developer asked: x\nClaude has finished.' + NO_PHRASE)
    expect(speechPrompt({ ...pustema, catchphrases: [] }, 'he', turn({ prompt: 'x', answer: null })).prompt).toBe('The developer asked: x\nClaude has finished.')
  })
  test('about one line in four carries a catchphrase, any of them; a character without any never does', () => {
    expect(catchphrase(pustema, () => 0.24)).toBe('אוי ואבוי!')
    expect(catchphrase(pustema, () => 0)).toBe('אוי ואבוי!')
    let n = 0
    const rolls = [0.1, 0.99]
    expect(catchphrase(pustema, () => rolls[n++]!)).toBe('הקלפים לא משקרים')
    expect(catchphrase(pustema, () => 0.25)).toBeNull()
    expect(catchphrase({ ...pustema, catchphrases: [] }, () => 0)).toBeNull()
  })
  test('a catchphrase said in the recent lines is skipped while another is left', () => {
    expect(catchphrase(pustema, () => 0, ['אוי ואבוי, איזה באג'])).toBe('הקלפים לא משקרים')
    expect(catchphrase(pustema, () => 0, ['אוי ואבוי!', 'הקלפים לא משקרים!'])).toBe('אוי ואבוי!')
    const egoz = { ...pustema, catchphrases: ['אמא שלי אומרת ש...', 'זה מזיק מאוד ל... שלי!'] }
    expect(catchphrase(egoz, () => 0, ['אמא שלי אומרת שבאגים זה בריא'])).toBe('זה מזיק מאוד ל... שלי!')
    expect(catchphrase({ ...pustema, catchphrases: ['אוי ואבוי!'] }, () => 0, ['אוי ואבוי!'])).toBe('אוי ואבוי!')
  })
  test('each call samples up to twelve distinct game lines, a different set for a different roll', () => {
    const many = { ...pustema, lines: Array.from({ length: 30 }, (_, i) => `שורה ${i}`) }
    const a = examples(many, () => 0), b = examples(many, () => 0.99)
    expect(a.length).toBe(12)
    expect(new Set(a).size).toBe(12)
    for (const l of [...a, ...b]) expect(many.lines).toContain(l)
    expect(a).not.toEqual(b)
    expect([...examples(pustema, Math.random)].sort()).toEqual([...pustema.lines].sort())
    expect(examples({ ...pustema, lines: [] }, () => 0)).toEqual([])
  })
  test('what got done and the lines already said reach the prompt; nothing is said of them when there are none', () => {
    const p = speechPrompt(pustema, 'he', turn({ prompt: 'x', answer: null }, { facts: '1 commit', recent: ['שורה קודמת'] }))
    expect(p.prompt).toContain('What got done: 1 commit')
    expect(p.prompt).toContain('You already said these; say something new:\n- שורה קודמת')
    expect(speechPrompt(pustema, 'he', turn({ prompt: 'x', answer: null })).prompt).toBe('The developer asked: x\nClaude has finished.' + NO_PHRASE)
  })
  test('facts count the work and name the checks, and are empty for talk alone', () => {
    expect(turnFacts([{ kind: 'tool' }, { kind: 'tool' }, { kind: 'commit' }, { kind: 'check', key: 'npm test', ok: false }])).toBe('2 tool calls; 1 commit; checks: npm test failed')
    expect(turnFacts([])).toBe('')
  })
  test('the persona goes to the model as one cached block, with room for a Hebrew line', async () => {
    let seen: ModelCompleteRequest | null = null
    await speak(client(r => { seen = r; return { isAnswered: true, text: 'שלום', usage } as ModelCompleteResult }), 'haiku', pustema, 'he', turn({ prompt: 'x', answer: null }))
    expect(seen!.system).toEqual([{ text: speechPrompt(pustema, 'he', turn({ prompt: 'x', answer: null })).system, cache: true }])
    expect(seen!.maxTokens).toBe(160)
  })
  test('the line knows its moment: Claude still at it, something that just happened, or the end of the turn', () => {
    expect(speechPrompt(pustema, 'he', turn({ prompt: 'fix it', answer: null }, { moment: 'working' })).prompt).toBe('The developer asked: fix it\nClaude is still working on it.' + NO_PHRASE)
    expect(speechPrompt(pustema, 'he', turn({ prompt: 'fix it', answer: null }, { moment: 'event', facts: 'checks: npm test failed' })).prompt)
      .toBe('The developer asked: fix it\nThis just happened while Claude works: checks: npm test failed' + NO_PHRASE)
    expect(speechPrompt(pustema, 'he', turn({ prompt: 'fix it', answer: 'Done.' }, { facts: '1 commit' })).prompt)
      .toBe('The developer asked: fix it\nClaude has finished.\nClaude answered: Done.\nWhat got done: 1 commit' + NO_PHRASE)
  })
  test('english keeps the voice and asks for English', () => {
    expect(speechPrompt(pustema, 'en', turn({ prompt: null, answer: null })).system).toContain('Speak English')
    expect(speechPrompt(pustema, 'en', turn({ prompt: null, answer: null })).prompt).toBe('Claude has finished.' + NO_PHRASE)
  })
  test('the conversation is cut at 300 characters each', () => {
    const p = speechPrompt(pustema, 'he', turn({ prompt: 'a'.repeat(500), answer: 'b'.repeat(500) }))
    expect(p.prompt).toContain('a'.repeat(300) + '\n')
    expect(p.prompt).not.toContain('a'.repeat(301))
  })
  test('cleanReply keeps the first line, unquoted, and drops refusals', () => {
    expect(cleanReply('\n"אוי ואבוי!"\nmore')).toBe('אוי ואבוי!')
    expect(cleanReply("I can't do that")).toBeNull()
    expect(cleanReply('אני לא יכול לסלוח לך!')).toBe('אני לא יכול לסלוח לך!')
    expect(cleanReply('Here is a line:')).toBeNull()
    expect(cleanReply('')).toBeNull()
  })
  test('the fallback is a short line of the character in Hebrew, nothing in English', () => {
    expect(fallback(pustema, 'he', () => 0.99)).toBe('אני רואה... אני רואה צרות!')
    expect(fallback(pustema, 'en', () => 0)).toBeNull()
    expect(fallback({ ...pustema, lines: [] }, 'he', () => 0)).toBeNull()
  })
  test('speak answers with the model line, or the fallback when the model does not answer', async () => {
    const ok = client(() => ({ isAnswered: true, text: 'הקלפים אומרים: באג!', usage }) as ModelCompleteResult)
    expect(await speak(ok, 'haiku', pustema, 'he', turn({ prompt: 'x', answer: 'y' }))).toBe('הקלפים אומרים: באג!')
    const down = client(() => { throw new Error('offline') })
    expect(await speak(down, 'haiku', pustema, 'he', turn({ prompt: 'x', answer: 'y' }))).toBe('אני רואה... אני רואה צרות!')
    expect(await speak(down, 'haiku', pustema, 'en', turn({ prompt: 'x', answer: 'y' }))).toBeNull()
  })
})
