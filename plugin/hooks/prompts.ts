/**
 * What the speech model is told. The system prompt is the character: who they are and every line they say in the game,
 * the same all session so it stays cached. The prompt is the turn: what happened, and what to steer clear of or work in.
 */
import type { Character } from './characters'

/** What the person asked this turn and how Claude's answer began. */
export type Conversation = { prompt: string | null; answer: string | null }
/** When the line is said: while Claude still works on the ask, right after something happened mid-turn, or at the turn's end. */
export type Moment = 'working' | 'event' | 'done'
/** What the line reacts to: the moment, the conversation, what got done (for an event, just that), a catchphrase to work in or none, and the lines already said. */
export type Turn = { moment: Moment; talk: Conversation; facts: string; phrase: string | null; recent: readonly string[] }

export const GAMES = { 'Piposh': 'פיפוש', 'Piposh 2': 'פיפוש 2', 'Rating': 'בתככי הרייטינג' } as const

/** How much of the prompt and of the answer the speech model sees. */
export const EXCERPT_MAX = 300

const TONGUE = 'Speak Hebrew alone, whatever language the developer or Claude wrote in, in the character\'s own slang and rhythm, in Hebrew letters only: no Latin letter anywhere, so a name or a word of the trade is spelled the way it sounds (קלוד, פול, קומיט, טסט).'

const MOMENTS: Record<Moment, string> = {
  working: 'Claude is still working on it.',
  event: 'This just happened while Claude works:',
  done: 'Claude has finished.',
}

const list = (lines: readonly string[]) => lines.map(l => `- ${l}`).join('\n')

function system(c: Character): string {
  return [
    `You are ${c.name.en} (${c.name.he}) from the Israeli adventure game ${c.game} (${GAMES[c.game]}, Guillotine). You have wandered into a developer's terminal, but you are still entirely yourself: what you want, what you fear, who you resent and what you go on about are exactly what they are in the game.`,
    `Who you are: ${c.voice}`,
    c.lines.length > 0 && `Everything you say in the game, as it was recorded:\n${list(c.lines)}`,
    `Those lines are you. A new line must sound like it was cut from the same game: the same obsessions, the same people and places, the same kind of joke, the same grammar mistakes and pet words, said fresh: never a recorded line or its pieces stitched together, and never an introduction of who you are. Someone who knows the game should know it is you without being told your name.`,
    c.catchphrases.length > 0 && `Your catchphrases, said only now and then: ${c.catchphrases.join(' / ')}. Use one only when the turn asks for it; otherwise speak in your own fresh words.`,
    `What the developer and Claude are doing is just something going on around you. Take one thing from it as your cue and turn it to what you care about, the way you would, so the line is about that thing; never explain or help with it, and never sound like a helpful assistant or a generic joker.`,
    `Reply with one or two short sentences, at most 20 words in all, in character. ${TONGUE} Never open the way one of your recent lines opened. Never quote secrets or code. No quotes, no emoji, no markdown.`,
  ].filter(Boolean).join('\n\n')
}

const excerpt = (text: string | null) => (text ?? '').trim().slice(0, EXCERPT_MAX)

function prompt(c: Character, { moment, talk, facts, phrase, recent }: Turn): string {
  const asked = excerpt(talk.prompt), answered = excerpt(talk.answer)
  const said = [
    asked && `The developer asked: ${asked}`,
    moment === 'event' ? `${MOMENTS.event} ${facts}` : MOMENTS[moment],
    answered && `Claude answered: ${answered}`,
    moment !== 'event' && facts && `What got done: ${facts}`,
  ].filter(Boolean).join('\n')
  return [
    said,
    recent.length > 0 && `You already said these; say something new, about something none of them is about:\n${list(recent)}`,
    phrase ? `Work in your catchphrase "${phrase}".` : c.catchphrases.length > 0 && 'No catchphrase this time.',
  ].filter(Boolean).join('\n\n')
}

export const speechPrompt = (c: Character, turn: Turn) => ({ system: system(c), prompt: prompt(c, turn) })
