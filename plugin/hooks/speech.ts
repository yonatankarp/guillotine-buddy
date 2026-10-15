import type { EngineInterface } from 'claude-code'
import type { Character } from './characters'
import { speechPrompt, type Turn } from './prompts'
import type { Signal } from './signals'


export const SPEECH_TIMEOUT_MS = 6000
/** The longest line the bubble shows. */
export const LINE_MAX = 120
/** How often a line is asked to carry one of the character's catchphrases. */
export const CATCHPHRASE_CHANCE = 0.25
/** How many of the character's last lines it is told not to repeat. */
export const RECENT_MAX = 8
/** Room for a Hebrew line, which takes more tokens than its length suggests; the bubble trims it anyway. */
const MAX_TOKENS = 160

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
  const fresh = c.catchphrases.filter(p => !recent.some(l => says(l, p)))
  const pool = fresh.length ? fresh : c.catchphrases
  return pool[Math.floor(rand() * pool.length)]!
}

/** Out-of-character openings: the model refusing or explaining instead of speaking. */
const REFUSAL = /^(i can['’]?t|i cannot|sorry|as an ai)\b/i

/** Latin letters in a Hebrew line: the bubble's right-to-left text turns a mixed line around and it reads scrambled. */
const LATIN = /[A-Za-z]/

export function cleanReply(text: string): string | null {
  const first = text.split('\n').map(l => l.trim()).find(l => l.length > 0)
  if (!first) return null
  const unquoted = first.replace(/^["'“”״]+|["'“”״]+$/g, '').trim()
  if (!unquoted || REFUSAL.test(unquoted) || unquoted.endsWith(':') || LATIN.test(unquoted)) return null
  return unquoted.slice(0, LINE_MAX)
}

/** A short line of the character's own, for when the model does not answer; null when they have none. */
export function fallback(c: Character, rand: () => number): string | null {
  const short = c.lines.filter(l => l.length <= 60 && !LATIN.test(l))
  return short.length ? short[Math.floor(rand() * short.length)]! : null
}

/** The character's line for the turn: the model's, or one of their own when the model does not answer. */
export async function speak($: { model: Pick<EngineInterface['model'], 'complete'> }, model: string, c: Character, turn: Turn): Promise<string | null> {
  try {
    const { system, prompt } = speechPrompt(c, turn)
    // The persona, game lines and all, stays the same all session: cached; the conversation changes each turn.
    const r = await $.model.complete({ model, system: [{ text: system, cache: true }], prompt, maxTokens: MAX_TOKENS, timeoutMs: SPEECH_TIMEOUT_MS })
    const line = r.isAnswered ? cleanReply(r.text) : null
    if (line) return line
  } catch {}
  return fallback(c, Math.random)
}
