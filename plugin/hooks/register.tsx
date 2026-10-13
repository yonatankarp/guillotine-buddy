import { atom, read, update } from 'claude-code'
import type { EngineInterface, PromptOrigin, Register, ToolCallResult } from 'claude-code'
import { CHARACTERS, type Character } from './characters'
import { FACES } from './data/faces.generated'
import { band } from './render/band'
import { signalsFromTool, type Outcome, type Signal } from './signals'
import { angle, catchphrase, examples, EXCERPT_MAX, fallback, RECENT_MAX, speak, turnFacts, type Language, type Turn } from './speech'

const characterAtom = atom({ plugin: 'piposh-buddy', key: 'character' } as const, null)
const bubbleAtom = atom({ plugin: 'piposh-buddy', key: 'bubble' } as const, null)
const frameAtom = atom({ plugin: 'piposh-buddy', key: 'frame' } as const, 0)
const quietAtom = atom({ plugin: 'piposh-buddy', key: 'quiet' } as const, false)

export const COMMAND = 'piposh'

/** How often the mouth moves while a new line is said, and how long the saying lasts for its length. */
export const TALK_TICK_MS = 140
export const talkMs = (line: string) => Math.min(5000, Math.max(1500, line.length * 60))
/** A turn still running this long after the prompt gets a line about the ask. */
export const WORKING_MS = 20_000
/** Lines in the middle of a turn are at least this far apart, so the character comments rather than chatters. */
export const CHIME_GAP_MS = 15_000

/** Something worth a word mid-turn: a check's result, a commit, a push, a PR. */
export const isNotable = (s: Signal) => s.kind === 'check' || s.kind === 'commit' || s.kind === 'push' || s.kind === 'pr'

/** The session's speaking: its lines so far (newest last, so none is said again), when the last came, and whether one is on its way. */
const voice = { recent: [] as string[], lastAt: 0, isBusy: false }

/** Whether a mid-turn line may come now: none on its way, and the last one long enough ago. */
export const mayChime = (now: number, v: { lastAt: number; isBusy: boolean } = voice) => !v.isBusy && now - v.lastAt >= CHIME_GAP_MS

/** The characters with a face baked: the roster lists some before their art is in. */
export const cast = (): Character[] => CHARACTERS.filter(c => FACES[c.id] !== undefined)

/** A character at random, never `except` (the one showing) when there is another. */
export function pick(rand: () => number, except: string | null = null): Character {
  const all = cast().filter(c => c.id !== except)
  return all[Math.floor(rand() * all.length)] ?? cast()[0]!
}

/** The character a /piposh argument names: by Hebrew or English name or id, a part of it is enough. */
export function findCharacter(query: string): Character | null {
  const q = query.trim().toLowerCase()
  if (!q) return null
  return cast().find(c => [c.id, c.name.en, c.name.he].some(n => n.toLowerCase().includes(q))) ?? null
}

/** The next mouth: any frame but the one showing, the resting face among them, so the mouth opens and closes. */
export function nextFrame(current: number, talkFrames: number, rand: () => number): number {
  const k = Math.floor(rand() * talkFrames)
  return k >= current ? k + 1 : k
}

export function shouldHandleTurn(e: { agentId?: string }): boolean {
  return e.agentId === undefined
}

/** Only the person's own typing is the conversation the character reacts to. */
export function countsAsPrompt(e: { text: string; origin: PromptOrigin }, isAttached = false): boolean {
  const kind = e.origin.kind
  return (kind === 'composer' || kind === 'bridge' || (kind === 'sdk' && isAttached)) && !e.text.trimStart().startsWith('/')
}

async function hasAppClient($: EngineInterface): Promise<boolean> {
  return (await $.session.surfaces()).some(s => s !== 'terminal')
}

// shortcut: a call the person denies at the permission prompt reads as failed here, as in pokebuddy.
function outcome(ran: ToolCallResult): Outcome {
  if (ran.deny !== undefined) return 'unknown'
  return ran.isError === true ? 'failed' : 'ok'
}

/** The loader follows `$` only into this file, so the speech module gets a client that spells the call out. */
function clients($: EngineInterface) {
  return { model: { complete: (...a: Parameters<EngineInterface['model']['complete']>) => $.model.complete(...a) } }
}

/** Which talk is current: a newer line makes the older one's ticks stop. */
const talking = { generation: 0 }

/** Moves the mouth until `until`, then rests the face. */
function talk($: EngineInterface, frames: number, until: number) {
  const generation = ++talking.generation
  const tick = async () => {
    if (generation !== talking.generation) return
    if ((await $.clock.now()) >= until) { await update($, frameAtom, () => 0); return }
    await update($, frameAtom, f => nextFrame(f, frames, Math.random))
    $.clock.after(TALK_TICK_MS, tick)
  }
  void tick()
}

/**
 * Puts `c` above the prompt with a short line of their own, so they show at once: a terminal too small for the face
 * draws the line alone, and draws nothing without one. English has no lines of its own, so a catchphrase.
 */
async function meet($: EngineInterface, c: Character, language: Language) {
  const line = fallback(c, language, Math.random) ?? c.catchphrases[0] ?? null
  voice.recent = line ? [line] : []
  await update($, characterAtom, () => c.id)
  await update($, bubbleAtom, () => line)
}

/** The character on screen when one may speak: a person is watching and it is not quiet; null otherwise. */
async function speaker($: EngineInterface, isInteractive: boolean): Promise<Character | null> {
  if (!isInteractive || await read($, quietAtom)) return null
  const id = await read($, characterAtom)
  return CHARACTERS.find(c => c.id === id) ?? null
}

/** Has `c` say a line about `turn` and move its mouth; dropped when another character took over meanwhile. */
async function say($: EngineInterface, model: string, language: Language, c: Character, turn: Omit<Turn, 'phrase' | 'angle' | 'examples' | 'recent'>) {
  voice.isBusy = true
  try {
    const line = await speak(clients($), model, c, language, { ...turn, phrase: catchphrase(c, Math.random, voice.recent), angle: angle(Math.random), examples: examples(c, Math.random), recent: voice.recent })
    if (!line || (await read($, characterAtom)) !== c.id) return
    voice.recent = [...voice.recent, line].slice(-RECENT_MAX)
    voice.lastAt = await $.clock.now()
    await update($, bubbleAtom, () => line)
    talk($, FACES[c.id]!.big.talk.length, voice.lastAt + talkMs(line))
  } finally {
    voice.isBusy = false
  }
}

export const HELP = [
  `/${COMMAND}            who is here`,
  `/${COMMAND} next       someone else`,
  `/${COMMAND} <name>     that character (Hebrew or English, part of the name is enough)`,
  `/${COMMAND} quiet      hide the character and stop the lines; again to bring them back`,
].join('\n')

export const register: Register = (on, options) => {
  const model = String(options.speechModel ?? 'haiku')
  const language: Language = options.language === 'en' ? 'en' : 'he'
  let turnPrompt: string | null = null
  let signals: Signal[] = []
  // Which turn is running (0: none), so a line timed for one turn never lands in the next.
  let turn = 0
  let turns = 0
  // Until a session.start says otherwise (a reload may not raise one), assume a person is there.
  let isInteractive = true

  on('session.start', async ($, e, next) => {
    isInteractive = e.isInteractive || await hasAppClient($)
    await $.command.register({ name: COMMAND, description: 'Your Piposh buddy: next, a character by name, or quiet' })
    const isQuiet = (await $.store.get('quiet')) === true
    await update($, quietAtom, () => isQuiet)
    // A reload keeps the session's character; a new session meets a new one.
    voice.recent = []
    if (!FACES[(await read($, characterAtom)) ?? '']) await meet($, pick(Math.random), language)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('session.attach', async ($, e, next) => {
    isInteractive = true
    return next(e)
  }).catch(($, e, next) => next(e))

  on('prompt.submit', async ($, e, next) => {
    if (countsAsPrompt(e, e.origin.kind === 'sdk' && await hasAppClient($))) {
      turnPrompt ??= e.text.slice(0, EXCERPT_MAX)
      // A long turn hears from the character while Claude still works on it.
      if (turn === 0) {
        const mine = turn = ++turns
        $.clock.after(WORKING_MS, async () => {
          if (turn !== mine || !mayChime(await $.clock.now())) return
          const c = await speaker($, isInteractive)
          if (c) await say($, model, language, c, { moment: 'working', talk: { prompt: turnPrompt, answer: null }, facts: turnFacts(signals) })
        })
      }
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    try {
      const got = signalsFromTool(String(e.tool), e as unknown as Record<string, unknown>, outcome(ran), ran.text ?? '')
      signals.push(...got)
      // A check's result, a commit, a push or a PR gets a word right away, not only at the turn's end.
      const notable = got.filter(isNotable)
      if (notable.length > 0 && turn !== 0 && mayChime(await $.clock.now())) {
        const c = await speaker($, isInteractive)
        if (c) $.clock.after(0, () => say($, model, language, c, { moment: 'event', talk: { prompt: turnPrompt, answer: null }, facts: turnFacts(notable) }))
      }
    } catch {}
    return ran
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (!shouldHandleTurn(e)) return result
    const conversation = { prompt: turnPrompt, answer: e.answer.slice(0, EXCERPT_MAX) }
    const facts = turnFacts(signals)
    turnPrompt = null
    signals = []
    turn = 0
    // A headless run (-p, the SDK) has no one watching, and a quiet character says nothing: no model call.
    const c = await speaker($, isInteractive)
    if (c) $.clock.after(0, () => say($, model, language, c, { moment: 'done', talk: conversation, facts }))
    return result
  }).catch(($, e, next) => next(e))

  on('command.run', { command: COMMAND }, async ($, e) => {
    const arg = e.args.trim()
    const id = await read($, characterAtom)
    const current = CHARACTERS.find(c => c.id === id)
    if (arg === 'quiet') {
      const isQuiet = !(await read($, quietAtom))
      await $.store.set('quiet', isQuiet)
      await update($, quietAtom, () => isQuiet)
      return { text: isQuiet ? 'Quiet: the character is hidden and says nothing until /piposh quiet again.' : `${current?.name[language] ?? 'Your buddy'} is back.` }
    }
    if (arg === 'help') return { text: HELP }
    if (!arg) return { text: current ? `${current.name.he} · ${current.name.en} (${current.game})\n\n${HELP}` : HELP }
    const next = arg === 'next' ? pick(Math.random, id) : findCharacter(arg)
    if (!next) return { text: `No character matches "${arg}".\n\n${HELP}` }
    await meet($, next, language)
    return { text: `${next.name.he} · ${next.name.en} (${next.game})` }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || await read($, quietAtom)) return next(e)
    const id = await read($, characterAtom)
    const character = CHARACTERS.find(c => c.id === id)
    if (!character || !FACES[character.id]) return next(e)
    const view = { character, frame: await read($, frameAtom), bubble: await read($, bubbleAtom), language }
    return band($.ui.resolve(e), view, e.props.maxRows, e.props.bodyColumns, e.viewport?.isFullscreen === true, e.surface) ?? next(e)
  })
}
