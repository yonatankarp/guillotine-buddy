/** The language the characters speak. */
export type Language = 'he' | 'en'

declare module 'claude-code' {
  interface PluginState {
    'piposh-buddy': {
      /** The session's character, by roster id; picked at random when the session starts. */
      character: string | null
      /** The character's last line. */
      bubble: string | null
      /** The face's frame: 0 rests, the others are its mouths while it talks. */
      frame: number
      /** Hidden and silent, by /piposh quiet; kept across sessions in the store. */
      quiet: boolean
    }
  }
}

