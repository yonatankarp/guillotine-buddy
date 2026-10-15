import type { Elements, RenderSurface } from 'claude-code'
import type { Character } from '../characters'
import { FACES } from '../data/faces.generated'
import { faceRows, faceSize, faceSvg, type Run } from './face'

/** What the band draws: who, which frame of their face (0 rests, others talk), and their last line. */
export type BandView = { character: Character; frame: number; bubble: string | null }

/** `Svg` off the terminal: the face is drawn as the game's own pixels there, not half-blocks. */
export type BandElements = Pick<Elements['terminal'], 'Box' | 'Text'> & Partial<Pick<Elements['desktop'], 'Svg'>>

/** CSS pixels the face stands where it is an Svg. */
export const SVG_HEIGHT = 112
const BUBBLE_MIN = 20
const BUBBLE_MAX = 44
// The gap beside the face, the bubble's tail, border and padding.
const SIDE_EXTRA = 8

/** Words wrapped to `width`; a word longer than that is broken. */
export function wrapText(text: string, width: number): string[] {
  const lines: string[] = []
  let line = ''
  for (let word of text.split(/\s+/).filter(Boolean)) {
    while (word.length > width) {
      if (line) { lines.push(line); line = '' }
      lines.push(word.slice(0, width))
      word = word.slice(width)
    }
    if (!word) continue
    if (!line) line = word
    else if (line.length + 1 + word.length <= width) line += ' ' + word
    else { lines.push(line); line = word }
  }
  if (line) lines.push(line)
  return lines
}

function drawRows({ Box, Text }: BandElements, rows: Run[][]) {
  return rows.map((runs, y) => (
    <Box key={`r${y}`} flexDirection="row">
      {runs.map((r, x) => <Text key={`c${y}-${x}`} color={r.fg} backgroundColor={r.bg}>{r.text}</Text>)}
    </Box>
  ))
}

/**
 * The face with the bubble beside it, centered in the band; fans know who it is, so no name is shown. The terminal draws the small face in
 * half-blocks and gives way to the line alone when the face would take more than half the screen or leave the bubble
 * no room; null there before the character has said anything.
 */
export function band(els: BandElements, view: BandView, maxRows: number, columns: number, isFullscreen: boolean, surface: RenderSurface = 'terminal') {
  const { Box, Text } = els
  const { character, bubble } = view
  const name = character.name.he
  const isApp = surface !== 'terminal' && els.Svg !== undefined
  const face = FACES[character.id]!
  const small = faceSize(face.small)
  const width = Math.min(BUBBLE_MAX, isApp ? BUBBLE_MAX : columns - small.cols - SIDE_EXTRA)
  const fits = isApp || (width >= BUBBLE_MIN && (isFullscreen || small.rows <= maxRows / 2))
  if (!fits) return bubble ? <Box flexDirection="row" justifyContent="center"><Text wrap="truncate-end">{bubble}</Text></Box> : null
  const frame = Math.min(view.frame, face.big.talk.length)
  const art = isApp && els.Svg
    ? <els.Svg key="face" source={faceSvg(face.big, frame)} alt={name} width={Math.round(face.big.w * SVG_HEIGHT / face.big.h)} height={SVG_HEIGHT} />
    : drawRows(els, faceRows(face.small, Math.min(view.frame, face.small.talk.length)))
  return (
    <Box flexDirection="row" justifyContent="center">
      <Box key="face" flexDirection="column">{art}</Box>
      <Box key="side" flexDirection="column" marginLeft={2} justifyContent="center">
        {bubble && (
          <Box key="bubble" flexDirection="row">
            <Box flexDirection="column"><Text> </Text><Text dimColor>◀</Text></Box>
            <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1} width={width} alignItems="flex-end">
              {wrapText(bubble, width - 4).map((l, i) => <Text key={`b${i}`} wrap="truncate-end">{l}</Text>)}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  )
}
