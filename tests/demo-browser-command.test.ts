import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import demoCommands from '../.pi/cli/demo.ts'
import { hostAction } from '../.pi/lib/studio-host.ts'
import { collectCommands } from '../.pi/lib/testing.ts'

vi.mock('../.pi/lib/studio-host.ts', () => ({ hostAction: vi.fn() }))

const { browser } = collectCommands(demoCommands)
let base: string
const recording = (name: string) => path.join(base, 'recording', name)
const write = (name: string, value: unknown) =>
  fs.writeFileSync(recording(name), JSON.stringify(value))
const read = (name: string) => JSON.parse(fs.readFileSync(recording(name), 'utf8'))
/** Every request the command made to the host, in order. */
const requests = () =>
  vi.mocked(hostAction).mock.calls.map(([, name, params]) => ({ name, ...params }))

beforeEach(() => {
  vi.clearAllMocks()
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-browser-'))
  fs.mkdirSync(path.join(base, 'recording'))
  write('demo-config.json', { startTime: Date.now(), voiceName: 'Puck' })
  vi.mocked(hostAction).mockResolvedValue(
    JSON.stringify({ text: 'done', url: 'http://example.com/slideshow.html' }),
  )
})
afterEach(() => {
  fs.rmSync(base, { recursive: true, force: true })
})

function slideshowAt(currentSlide: number, narrated: number[]) {
  write('slideshow-progress.json', {
    totalSlides: 2,
    currentSlide,
    visitedSlides: [0],
    analyzedSlides: [0],
    narratedSlides: narrated,
  })
  write('demo-state.json', {
    startTime: Date.now(),
    voiceName: 'Puck',
    audioClips: [],
    zoomEvents: [{ type: 'in', videoTimeSec: 5, x: 100, y: 200, zoom: 2 }],
    clickEvents: [],
  })
}

describe('pitch demo browser', () => {
  it('makes exactly one host call per step — no probes around it', async () => {
    expect(await browser.run({ command: 'snapshot' }, base)).toBe('done')
    await browser.run({ command: 'goto https://example.test' }, base)
    expect(requests()).toEqual([
      { name: 'demo_browser', kind: 'run', op: { op: 'snapshot' } },
      { name: 'demo_browser', kind: 'run', op: { op: 'goto', url: 'https://example.test' } },
    ])
  })

  it('advances the slideshow one page, clearing callouts first, keeping old state', async () => {
    slideshowAt(0, [0])
    await browser.run({ command: 'playwright-cli press ArrowRight' }, base)
    const [clear, press] = requests()
    expect(clear).toMatchObject({ name: 'demo_browser', kind: 'evaluate' })
    expect(press).toEqual({
      name: 'demo_browser',
      kind: 'run',
      op: { op: 'press', key: 'ArrowRight' },
    })
    expect(read('slideshow-progress.json').currentSlide).toBe(1)
    expect(read('demo-state.json').zoomEvents).toHaveLength(1)
  })

  it('blocks advancing past a page that has not been narrated', async () => {
    slideshowAt(0, [])
    const result = JSON.parse(await browser.run({ command: 'press ArrowRight' }, base))
    expect(result.status).toBe('slide_advance_blocked')
    expect(requests()).toEqual([])
    expect(read('slideshow-progress.json').currentSlide).toBe(0)
  })
})
