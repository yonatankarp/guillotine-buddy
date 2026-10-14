import type { EngineInterface } from 'claude-code'
import type { Language } from '../types'
import type { Character } from './characters'
import type { Signal } from './signals'

export type { Language }
/** What the person asked this turn and how Claude's answer began. */
export type Conversation = { prompt: string | null; answer: string | null }
/** When the line is said: while Claude still works on the ask, right after something happened mid-turn, or at the turn's end. */
export type Moment = 'working' | 'event' | 'done'
/**
 * What the line reacts to: the moment, the conversation, what got done (for an event, just that), a catchphrase to work
 * in or none, a sample of the character's game lines to sound like, and the lines already said.
 */
export type Turn = { moment: Moment; talk: Conversation; facts: string; phrase: string | null; angle: string; examples: readonly string[]; recent: readonly string[] }

/** Ways into a line, one drawn at random each time, so the character doesn't react the same way twice in a row. */
export const ANGLES = [
  'complain about something, the way only you would',
  'boast about yourself',
  'give the developer unsolicited advice',
  'ask the developer a question',
  'misunderstand what is going on, in your own way',
  'bring up something from your life in the game',
  'react with a strong emotion',
  'take a jab at someone, the developer or Claude included',
  'make a big drama out of something small',
  'compare it to something from your world',
] as const

export const angle = (rand: () => number): string => ANGLES[Math.floor(rand() * ANGLES.length)]!

const MOMENTS: Record<Moment, string> = {
  working: 'Claude is still working on it.',
  event: 'This just happened while Claude works:',
  done: 'Claude has finished.',
}

/** How much of the prompt and of the answer the speech model sees. */
export const EXCERPT_MAX = 300
export const SPEECH_TIMEOUT_MS = 6000
/** The longest line the bubble shows. */
export const LINE_MAX = 120
/** How often a line is asked to carry one of the character's catchphrases. */
export const CATCHPHRASE_CHANCE = 0.25
/** How many of the character's game lines one call shows, picked afresh each time so the examples vary. */
export const EXAMPLES_MAX = 12
/** How many of the character's last lines it is told not to repeat. */
export const RECENT_MAX = 8
/** Room for a Hebrew line, which takes more tokens than its length suggests; the bubble trims it anyway. */
const MAX_TOKENS = 160

export const GAMES = { 'Piposh': 'פיפוש', 'Piposh 2': 'פיפוש 2', 'Rating': 'בתככי הרייטינג' } as const

const excerpt = (text: string | null) => (text ?? '').trim().slice(0, EXCERPT_MAX)
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** What got done this turn, as counts and check names: no paths, no content. Empty for a turn of talk alone. */
export function turnFacts(signals: readonly Signal[]): string {
  const parts: string[] = []
  const count = (k: Signal['kind']) => signals.filter(s => s.kind === k).length
  if (count('tool')) parts.push(plural(count('tool'), 'tool call'))
  if (count('commit')) parts.push(plural(count('commit'), 'commit'))
  if (count('push')) parts.push(plural(count('push'), 'push'))
  if (count('pr')) parts.push(count('pr') === 1 ? '1 PR opened' : `${count('pr')} PRs opened`)
  const checks = signals.filter((s): s is Extract<Signal, { kind: 'check' }> => s.kind === 'check')
  if (checks.length) parts.push('checks: ' + checks.map(c => `${c.key} ${c.ok ? 'passed' : 'failed'}`).join(', '))
  return parts.join('; ')
}

const words = (text: string) => ` ${text.replace(/[!?.,:;…]/g, ' ').replace(/\s+/g, ' ').trim()} `
/**
 * Whether a line already says the phrase, as whole words: a phrase cut off by "..." (אמא שלי אומרת ש...) matches by its
 * opening, a stammer (ש... ש... ש...) whole.
 */
export function says(line: string, phrase: string): boolean {
  const cut = phrase.search(/\.\.\.|…/), opening = words(cut < 0 ? phrase : phrase.slice(0, cut)).trimEnd()
  return words(line).includes(cut >= 0 && opening.length >= 3 ? opening : words(phrase))
}

/**
 * The catchphrase this line should carry, or null: a few lines do, so the phrases keep coming without every line
 * being one. One already said in the recent lines is skipped while another is left.
 */
export function catchphrase(c: Character, rand: () => number, recent: readonly string[] = []): string | null {
  if (c.catchphrases.length === 0 || rand() >= CATCHPHRASE_CHANCE) return null
  // shortcut: an English line carries the phrase in Latin letters, which this Hebrew match misses; transliterate if English repeats show.
  const fresh = c.catchphrases.filter(p => !recent.some(l => says(l, p)))
  const pool = fresh.length ? fresh : c.catchphrases
  return pool[Math.floor(rand() * pool.length)]!
}

/** Up to EXAMPLES_MAX of the character's game lines, picked at random without repeats. */
export function examples(c: Character, rand: () => number): string[] {
  const pool = [...c.lines]
  const n = Math.min(EXAMPLES_MAX, pool.length)
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rand() * (pool.length - i))
    ;[pool[i], pool[j]] = [pool[j]!, pool[i]!]
  }
  return pool.slice(0, n)
}

export function speechPrompt(c: Character, language: Language, { moment, talk, facts, phrase, angle, examples, recent }: Turn): { system: string; prompt: string } {
  const tongue = language === 'he'
    ? 'Speak Hebrew alone, whatever language the developer or Claude wrote in, in the character\'s own slang and rhythm, in Hebrew letters only: no Latin letter anywhere, so a name or a word of the trade is spelled the way it sounds (קלוד, פול, קומיט, טסט).'
    : 'Speak English alone, whatever language the developer or Claude wrote in, keeping the character\'s attitude, rhythm and quirks as if dubbed from the Hebrew; a catchphrase stays Hebrew, in Latin letters, so no Hebrew letter anywhere.'
  const system = [
    `You are ${c.name.en} (${c.name.he}) from the Israeli adventure game ${c.game} (${GAMES[c.game]}, Guillotine), living in a developer's terminal as their buddy. Each line is a moment of you in a scene from your game, not an assistant's reply: you have your own concerns, grudges and agenda, and the developer's work is just what happens around you.`,
    c.voice && `Your character: ${c.voice}`,
    c.catchphrases.length > 0 && `Your catchphrases, part of your voice but said only now and then: ${c.catchphrases.join(' / ')}. Use one only when the turn asks for it; otherwise speak in your own fresh words.`,
    `Talk exactly the way you do in the game: your grammar and its mistakes, your slang, how you address people, your obsessions, the people and places of your game. Borrow the rhythm and words of your game lines, never their content. React the way you would, not the way a helpful assistant would, and pick up something specific from what the developer asked or what happened, in your own terms.`,
    `Reply with one or two short sentences, at most 20 words in all, in character. ${tongue} Never open the way one of your recent lines opened. Never quote secrets or code. No quotes, no emoji, no markdown.`,
  ].filter(Boolean).join('\n\n')
  const asked = excerpt(talk.prompt), answered = excerpt(talk.answer)
  const said = [
    asked && `The developer asked: ${asked}`,
    moment === 'event' ? `${MOMENTS.event} ${facts}` : MOMENTS[moment],
    answered && `Claude answered: ${answered}`,
    moment !== 'event' && facts && `What got done: ${facts}`,
  ].filter(Boolean).join('\n')
  const prompt = [
    examples.length > 0 && `Some lines you said in the game, for your voice. Match their style; never repeat one word for word:\n${examples.map(l => `- ${l}`).join('\n')}`,
    said,
    recent.length > 0 && `You already said these; say something new:\n${recent.map(l => `- ${l}`).join('\n')}`,
    angle && `This time: ${angle}.`,
    phrase ? `Work in your catchphrase "${phrase}".` : c.catchphrases.length > 0 && 'No catchphrase this time.',
  ].filter(Boolean).join('\n\n')
  return { system, prompt }
}

/** Out-of-character openings: the model refusing or explaining instead of speaking. */
const REFUSAL = /^(i can['’]?t|i cannot|sorry|as an ai)\b/i

/** Latin letters in a Hebrew line: the bubble's right-to-left text turns a mixed line around and it reads scrambled. */
const LATIN = /[A-Za-z]/
/** Hebrew letters in an English line: the character left the language the person chose. */
const HEBREW = /[\u0590-\u05FF]/

export function cleanReply(text: string, language: Language = 'en'): string | null {
  const first = text.split('\n').map(l => l.trim()).find(l => l.length > 0)
  if (!first) return null
  const unquoted = first.replace(/^["'“”״]+|["'“”״]+$/g, '').trim()
  if (!unquoted || REFUSAL.test(unquoted) || unquoted.endsWith(':') || (language === 'he' ? LATIN : HEBREW).test(unquoted)) return null
  return unquoted.slice(0, LINE_MAX)
}

/** A short line of the character's own, for when the model does not answer; null when it has none in this language. */
export function fallback(c: Character, language: Language, rand: () => number): string | null {
  if (language !== 'he') return null
  const short = c.lines.filter(l => l.length <= 60 && !LATIN.test(l))
  return short.length ? short[Math.floor(rand() * short.length)]! : null
}

/** The character's line for the turn: the model's, or one of their own when the model does not answer. */
export async function speak($: { model: Pick<EngineInterface['model'], 'complete'> }, model: string, c: Character, language: Language, turn: Turn): Promise<string | null> {
  try {
    const { system, prompt } = speechPrompt(c, language, turn)
    // The persona stays the same all session: cached; the sampled game lines and the conversation change each turn.
    const r = await $.model.complete({ model, system: [{ text: system, cache: true }], prompt, maxTokens: MAX_TOKENS, timeoutMs: SPEECH_TIMEOUT_MS })
    const line = r.isAnswered ? cleanReply(r.text, language) : null
    if (line) return line
  } catch {}
  return fallback(c, language, Math.random)
}
