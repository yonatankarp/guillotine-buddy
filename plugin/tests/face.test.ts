import { describe, expect, test } from 'claude-code/testing'
import { CHARACTERS } from '../hooks/characters'
import { FACES } from '../hooks/data/faces.generated'
import { faceRows, faceSize, faceSvg, frames, SVG_SOURCE_MAX, type Face } from '../hooks/render/face'

// A 2x3 face, rest all colour 1; one talk frame paints its middle pixel in colour 2. Bytes pack two indexes each.
const tiny: Face = {
  w: 2, h: 3, palette: ['', '#000000', '#ff0000'],
  rest: btoa(String.fromCharCode(0x11, 0x11, 0x11)),
  talk: [{ x: 1, y: 1, w: 1, h: 1, px: btoa(String.fromCharCode(0x20)) }],
}

describe('face', () => {
  test('a talk frame is the rest with its patch laid on', () => {
    expect(frames(tiny)).toEqual([[1, 1, 1, 1, 1, 1], [1, 1, 1, 2, 1, 1]])
  })
  test('half-block rows: two pixel rows per text row, a clear bottom half on an odd height', () => {
    expect(faceSize(tiny)).toEqual({ rows: 2, cols: 2 })
    const rows = faceRows(tiny, 1)
    expect(rows[0]).toEqual([{ text: '▀', fg: '#000000', bg: '#000000' }, { text: '▀', fg: '#000000', bg: '#ff0000' }])
    expect(rows[1]).toEqual([{ text: '▀▀', fg: '#000000' }])
  })
  test('svg: a path per colour, a subpath per run, nothing for clear pixels', () => {
    const svg = faceSvg({ ...tiny, rest: btoa(String.fromCharCode(0x01, 0x11, 0x11)) }, 0)
    expect(svg).toContain('viewBox="0 0 2 3"')
    expect(svg.match(/<path/g)?.length).toBe(1)
    expect(svg).toContain('<path fill="#000000" d="M1 0h1v1H1zM0 1h2v1H0zM0 2h2v1H0z"/>')
  })
  test('every baked frame\'s svg fits under the host\'s source limit, or the whole band is dropped', () => {
    for (const { big } of Object.values(FACES)) {
      for (let f = 0; f <= big.talk.length; f++) expect(faceSvg(big, f).length).toBeLessThanOrEqual(SVG_SOURCE_MAX)
    }
  })
  test('every baked face is a roster character, decodes whole and talks with at least two mouths', () => {
    for (const [id, { big, small }] of Object.entries(FACES)) {
      expect(CHARACTERS.some(c => c.id === id)).toBe(true)
      for (const face of [big, small]) {
        expect(face.talk.length).toBeGreaterThanOrEqual(2)
        expect(face.palette.length).toBeLessThanOrEqual(16)
        for (const f of frames(face)) expect(f.length).toBe(face.w * face.h)
      }
      expect(small.h).toBeLessThan(big.h)
    }
  })
})
