import type { ModelCompleteRequest, ModelCompleteResult } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'
import { CHARACTERS, type Character } from '../hooks/characters'
import { speechPrompt, type Conversation, type Moment } from '../hooks/prompts'
import { catchphrase, cleanReply, fallback, says, speak, turnFacts } from '../hooks/speech'

const usage = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
const client = (complete: (r: ModelCompleteRequest) => ModelCompleteResult | Promise<ModelCompleteResult>) => ({ model: { complete: async (r: ModelCompleteRequest) => complete(r) } })

const pustema: Character = {
  id: 'p1-pustema', game: 'Piposh', name: { he: 'פוסטמה', en: 'Pustema' },
  voice: 'a fortune teller who sees doom in everything',
  catchphrases: ['אוי ואבוי!', 'הקלפים לא משקרים'],
  lines: ['אני רואה... אני רואה צרות!', 'שורה ארוכה מאוד מאוד מאוד מאוד מאוד מאוד מאוד מאוד מאוד מאוד מאוד מאוד מאוד מאוד'],
}

const turn = (talk: Conversation, more: { moment?: Moment; facts?: string; phrase?: string | null; recent?: string[] } = {}) => ({ moment: 'done' as Moment, talk, facts: '', phrase: null, recent: [], ...more })

describe('speech', () => {
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
  test('a line says a phrase only as whole words: by its opening when cut off, whole for a stammer', () => {
    expect(says('אויש, נו, די כבר', 'נו')).toBe(true)
    expect(says('אנחנו הולכים', 'נו')).toBe(false)
    expect(says('ש... ש... ש... מה שהוא אמר!', 'ש... ש... ש...')).toBe(true)
    expect(says('שלום לכולם', 'ש... ש... ש...')).toBe(false)
    expect(says('זה מזיק מאוד לסינוסיטיס שלי!', 'זה מזיק מאוד ל... שלי!')).toBe(true)
    expect(says("חבר'ה, בואו", "חבר'ה!")).toBe(true)
  })
  test('facts count the work and name the checks, and are empty for talk alone', () => {
    expect(turnFacts([{ kind: 'tool' }, { kind: 'tool' }, { kind: 'commit' }, { kind: 'check', key: 'npm test', ok: false }])).toBe('2 tool calls; 1 commit; checks: npm test failed')
    expect(turnFacts([])).toBe('')
  })
  test('the persona goes to the model as one cached block, with room for a Hebrew line', async () => {
    let seen: ModelCompleteRequest | null = null
    await speak(client(r => { seen = r; return { isAnswered: true, text: 'שלום', usage } as ModelCompleteResult }), 'haiku', pustema, turn({ prompt: 'x', answer: null }))
    expect(seen!.system).toEqual([{ text: speechPrompt(pustema, turn({ prompt: 'x', answer: null })).system, cache: true }])
    expect(seen!.maxTokens).toBe(160)
  })
  test('cleanReply keeps the first line, unquoted, and drops refusals', () => {
    expect(cleanReply('\n"אוי ואבוי!"\nmore')).toBe('אוי ואבוי!')
    expect(cleanReply("I can't do that")).toBeNull()
    expect(cleanReply('אני לא יכול לסלוח לך!')).toBe('אני לא יכול לסלוח לך!')
    expect(cleanReply('Here is a line:')).toBeNull()
    expect(cleanReply('')).toBeNull()
  })
  test('a line with Latin letters in it is dropped, since right-to-left text scrambles it, and so is a line in English', () => {
    expect(cleanReply('מחכה לירוק, ואתה מחכה Claude!')).toBeNull()
    expect(cleanReply('מחכה לירוק, ואתה מחכה לקלוד!')).toBe('מחכה לירוק, ואתה מחכה לקלוד!')
    expect(cleanReply('Waiting on Claude again!')).toBeNull()
    for (const c of CHARACTERS) for (const r of [0, 0.25, 0.5, 0.75, 0.9999]) expect(fallback(c, () => r) ?? '').not.toMatch(/[A-Za-z]/)
  })
  test('the fallback is a short line of the character', () => {
    expect(fallback(pustema, () => 0.99)).toBe('אני רואה... אני רואה צרות!')
    expect(fallback({ ...pustema, lines: [] }, () => 0)).toBeNull()
  })
  test('speak answers with the model line, or the fallback when the model does not answer', async () => {
    const ok = client(() => ({ isAnswered: true, text: 'הקלפים אומרים: באג!', usage }) as ModelCompleteResult)
    expect(await speak(ok, 'haiku', pustema, turn({ prompt: 'x', answer: 'y' }))).toBe('הקלפים אומרים: באג!')
    const down = client(() => { throw new Error('offline') })
    expect(await speak(down, 'haiku', pustema, turn({ prompt: 'x', answer: 'y' }))).toBe('אני רואה... אני רואה צרות!')
  })
})
