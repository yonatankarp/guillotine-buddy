import type { On, RenderSurface } from 'claude-code'
import { describe, expect, mock, test, type Engine } from 'claude-code/testing'
import { CHARACTERS } from '../hooks/characters'
import { cast } from '../hooks/register'

/** What lies beneath the mod in a session, answered in memory; beneath the band, a marker standing for another buddy's band. */
function world(on: On) {
  const store = new Map<string, unknown>()
  on('session.surfaces', async () => ({ value: [] }))
  on('store.get', async (_$, e) => ({ value: store.get(e.key) }))
  on('store.set', async (_$, e) => { store.set(e.key, e.value); return { value: undefined } })
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('command.register', async (_$, e) => ({ value: { command: e.name } }))
  on('ui.invalidate', async () => ({ value: undefined }))
  on('ui.render', async ($, e) => { const { Text } = $.ui.resolve(e); return <Text>NOTHING</Text> })
}
const piposh = ($: Engine, args: string) => $.command.run({ command: 'piposh', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })
const mount = ($: Engine, surface: RenderSurface, maxRows: number, bodyColumns: number) => $.ui.mount({
  plugin: 'piposh-buddy', surface, component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows, bodyColumns, scroll: { offset: 0, bodyRows: maxRows }, view: {} },
  viewport: { columns: bodyColumns + 5, rows: maxRows },
})
const fritz = CHARACTERS.find(c => c.id === 'p1-fritz')!

describe('/piposh <name>', () => {
  // 55 columns fit Piposh's face beside a bubble but not Fritz's wider one, and 20 rows no face: the line alone shows there.
  for (const [surface, maxRows, bodyColumns] of [['terminal', 40, 55], ['terminal', 20, 120], ['desktop', 40, 55]] as const) {
    test(`the character named shows at once with a line of their own, before any turn (${surface}, ${maxRows}x${bodyColumns})`, async ($, on) => {
      world(on)
      mock.clock(on)
      await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
      await piposh($, 'p1-piposh')
      const ui = await mount($, surface, maxRows, bodyColumns)
      expect((await piposh($, 'fritz')).text).toBe(`${fritz.name.he} (פיפוש)`)
      // what lies beneath stays, under the band, so another buddy's band shows too
      expect(await ui.find({ text: 'NOTHING' })).toBeDefined()
      const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text.trim()).filter(t => t.length > 2)
      expect(texts.some(t => fritz.lines.some(l => l.includes(t)))).toBe(true)
      await ui.unmount()
    })
  }
})

describe('every character', () => {
  // The host refuses a band it cannot draw and drops it whole, another buddy's band with it.
  test('draws on every surface, with what lies beneath kept', async ($, on) => {
    world(on)
    mock.clock(on)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    for (const c of cast()) {
      await piposh($, c.id)
      for (const surface of ['desktop', 'terminal'] as const) {
        const ui = await mount($, surface, 40, 120)
        expect(await ui.find({ text: 'NOTHING' })).toBeDefined()
        await ui.unmount()
      }
    }
  })
})

describe('/piposh off and on', () => {
  test('off hides the band and keeps it hidden; on brings it back; again is no toggle', async ($, on) => {
    world(on)
    mock.clock(on)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await piposh($, 'fritz')
    const shown = async () => {
      const ui = await mount($, 'terminal', 40, 120)
      const n = (await ui.findAll({ type: 'Text' })).filter(t => t.text.trim() !== 'NOTHING').length
      await ui.unmount()
      return n > 0
    }
    expect(await shown()).toBe(true)
    await piposh($, 'off')
    await piposh($, 'off')
    expect(await shown()).toBe(false)
    await piposh($, 'on')
    await piposh($, 'on')
    expect(await shown()).toBe(true)
  })
})
