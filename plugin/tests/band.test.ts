import { describe, expect, test } from 'claude-code/testing'
import type { RenderElement, RenderNode } from 'claude-code'
import { CHARACTERS } from '../hooks/characters'
import { FACES } from '../hooks/data/faces.generated'
import { band, SVG_HEIGHT, wrapText, type BandElements, type BandView } from '../hooks/render/band'
import { faceSize } from '../hooks/render/face'

type Fake = { children?: unknown } & Record<string, unknown>
const make = (type: string) => ({ children, ...props }: Fake): RenderElement => ({
  type,
  props: props as Record<string, string | number | boolean>,
  children: [children].flat(Infinity).filter((c): c is RenderNode => typeof c === 'string' || (typeof c === 'object' && c !== null)),
}) as RenderElement
const els: BandElements = { Box: make('Box'), Text: make('Text') }
const appEls = { ...els, Svg: make('Svg') } as BandElements

type Node = { type?: string; props?: Record<string, unknown>; children?: unknown[] }
const all = (n: unknown): Node[] => (typeof n === 'object' && n ? [n as Node, ...((n as Node).children ?? []).flatMap(all)] : [])
const textOf = (n: unknown): string => typeof n === 'string' ? n : ((n as Node).children ?? []).map(textOf).join('')

const character = CHARACTERS.find(c => FACES[c.id])!
const view: BandView = { character, frame: 0, bubble: 'אני רואה... אני רואה צרות!' }

describe('band', () => {
  test('a roomy terminal draws the face in half-blocks with the bubble beside it, and no name', () => {
    const tree = band(els, view, 80, 120, false)
    const rows = faceSize(FACES[character.id]!.small).rows
    expect(all(tree).filter(n => n.props?.flexDirection === 'row' && String((n.props as { key?: string }).key ?? '').startsWith('r')).length).toBeLessThanOrEqual(rows)
    expect(textOf(tree)).toContain('אני רואה')
    expect(textOf(tree)).not.toContain(character.name.he)
    expect(all(tree).some(n => n.type === 'Svg')).toBe(false)
  })
  test('a short or narrow terminal gives way to the line alone, and to nothing before there is one', () => {
    const narrow = faceSize(FACES[character.id]!.small).cols + 8 + 19
    for (const [rows, cols] of [[20, 120], [80, narrow]] as const) {
      const tree = band(els, view, rows, cols, false)
      expect(textOf(tree)).toBe(view.bubble!)
      expect(band(els, { ...view, bubble: null }, rows, cols, false)).toBeNull()
    }
  })
  test('the app draws the native face as an Svg, scaled to its height, whatever the room', () => {
    const tree = band(appEls, view, 10, 40, false, 'desktop')
    const svg = all(tree).find(n => n.type === 'Svg')!
    expect(svg.props?.height).toBe(SVG_HEIGHT)
    expect(String(svg.props?.source)).toContain(`viewBox="0 0 ${FACES[character.id]!.big.w} ${FACES[character.id]!.big.h}"`)
    expect(svg.props?.alt).toBe(character.name.he)
    expect(textOf(tree)).not.toContain(character.name.he)
  })
  test('the face and bubble, or the line alone, stand centered in the band', () => {
    for (const tree of [band(els, view, 80, 120, false), band(els, view, 20, 120, false), band(appEls, view, 10, 40, false, 'desktop')]) {
      expect((tree as Node).props?.justifyContent).toBe('center')
    }
  })
  test('a frame past the face\'s last mouth draws its last mouth, not nothing', () => {
    expect(() => band(els, { ...view, frame: 99 }, 80, 120, false)).not.toThrow()
  })
  test('wrapText breaks at words and splits a word too long for the line', () => {
    expect(wrapText('אחת שתיים שלוש', 9)).toEqual(['אחת שתיים', 'שלוש'])
    expect(wrapText('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij'])
  })
})
