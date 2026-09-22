import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import demoCommands from '../.pi/cli/demo.ts'
import { collectCommands } from '../.pi/lib/testing.ts'

const { bash: demo_bash } = collectCommands(demoCommands)

const originalPath = process.env.PATH

describe('demo_bash slide advance', () => {
  afterEach(() => {
    process.env.PATH = originalPath
  })

  it('runs a non-navigating browser command once without URL probes', async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-bash-command-'))
    const recordings = path.join(base, 'recording')
    const bin = path.join(base, 'bin')
    const calls = path.join(base, 'calls')
    fs.mkdirSync(recordings, { recursive: true })
    fs.mkdirSync(bin, { recursive: true })
    fs.writeFileSync(
      path.join(recordings, 'demo-config.json'),
      JSON.stringify({ startTime: Date.now() }),
    )
    fs.writeFileSync(
      path.join(bin, 'playwright-cli'),
      `#!/bin/sh\nprintf '%s\\n' "$*" >> "${calls}"\n`,
    )
    fs.chmodSync(path.join(bin, 'playwright-cli'), 0o755)
    process.env.PATH = `${bin}:${originalPath ?? ''}`

    await demo_bash.run({ command: 'playwright-cli snapshot' }, base)

    expect(fs.readFileSync(calls, 'utf8').trim().split('\n')).toHaveLength(1)
    fs.rmSync(base, { recursive: true, force: true })
  })

  it('uses raw URL probes only for commands that can navigate', async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-bash-navigation-'))
    const recordings = path.join(base, 'recording')
    const bin = path.join(base, 'bin')
    const calls = path.join(base, 'calls')
    fs.mkdirSync(recordings, { recursive: true })
    fs.mkdirSync(bin, { recursive: true })
    fs.writeFileSync(
      path.join(recordings, 'demo-config.json'),
      JSON.stringify({ startTime: Date.now() }),
    )
    fs.writeFileSync(
      path.join(bin, 'playwright-cli'),
      `#!/bin/sh\nprintf '%s\\n' "$*" >> "${calls}"\ncase "$*" in *location.href*) echo '"https://example.test/"';; esac\n`,
    )
    fs.chmodSync(path.join(bin, 'playwright-cli'), 0o755)
    process.env.PATH = `${bin}:${originalPath ?? ''}`

    await demo_bash.run({ command: 'playwright-cli goto https://example.test' }, base)

    const commands = fs.readFileSync(calls, 'utf8').trim().split('\n')
    expect(commands).toHaveLength(3)
    expect(commands[0]).toContain('--raw eval')
    expect(commands[1]).toContain('goto https://example.test')
    expect(commands[2]).toContain('--raw eval')
    fs.rmSync(base, { recursive: true, force: true })
  })

  it('advances the slideshow without adding camera events to legacy state', async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-bash-advance-'))
    const recordings = path.join(base, 'recording')
    const bin = path.join(base, 'bin')
    fs.mkdirSync(recordings, { recursive: true })
    fs.mkdirSync(bin, { recursive: true })

    const startTime = Date.now()
    fs.writeFileSync(
      path.join(recordings, 'demo-config.json'),
      JSON.stringify({ startTime, voiceName: 'Puck' }),
    )
    fs.writeFileSync(
      path.join(recordings, 'slideshow-progress.json'),
      JSON.stringify({
        totalSlides: 2,
        currentSlide: 0,
        visitedSlides: [0],
        analyzedSlides: [0],
        narratedSlides: [0],
      }),
    )
    fs.writeFileSync(
      path.join(recordings, 'demo-state.json'),
      JSON.stringify({
        startTime,
        voiceName: 'Puck',
        audioClips: [],
        zoomEvents: [{ type: 'in', videoTimeSec: 5, x: 100, y: 200, zoom: 2 }],
        clickEvents: [],
        annotationEvents: [],
        tabEvents: [{ tabId: 0, wallSec: 0 }],
        tabCreationTimes: { 0: 0 },
        currentTabId: 0,
        lastTargetCoords: null,
        pageUrlEvents: [],
      }),
    )

    const playwright = path.join(bin, 'playwright-cli')
    fs.writeFileSync(
      playwright,
      '#!/bin/sh\n' +
        'if [ "$1" = "eval" ]; then\n' +
        '  echo "http://example.com/slideshow.html"\n' +
        '  exit 0\n' +
        'fi\n' +
        'exit 0\n',
    )
    fs.chmodSync(playwright, 0o755)
    process.env.PATH = `${bin}:${originalPath ?? ''}`

    const result = await demo_bash.run({ command: 'playwright-cli press ArrowRight' }, base)

    expect(JSON.parse(result)).toMatchObject({ stdout: '', stderr: '' })

    const state = JSON.parse(fs.readFileSync(path.join(recordings, 'demo-state.json'), 'utf-8'))
    expect(state.zoomEvents).toHaveLength(1)
    expect(state.zoomEvents[0]).toMatchObject({ type: 'in' })
    const progress = JSON.parse(
      fs.readFileSync(path.join(recordings, 'slideshow-progress.json'), 'utf8'),
    )
    expect(progress.currentSlide).toBe(1)
  })

  it('preserves historical camera metadata without applying it during capture', async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-bash-advance-out-'))
    const recordings = path.join(base, 'recording')
    const bin = path.join(base, 'bin')
    fs.mkdirSync(recordings, { recursive: true })
    fs.mkdirSync(bin, { recursive: true })

    const startTime = Date.now()
    fs.writeFileSync(
      path.join(recordings, 'demo-config.json'),
      JSON.stringify({ startTime, voiceName: 'Puck' }),
    )
    fs.writeFileSync(
      path.join(recordings, 'slideshow-progress.json'),
      JSON.stringify({
        totalSlides: 2,
        currentSlide: 0,
        visitedSlides: [0],
        analyzedSlides: [0],
        narratedSlides: [0],
      }),
    )
    fs.writeFileSync(
      path.join(recordings, 'demo-state.json'),
      JSON.stringify({
        startTime,
        voiceName: 'Puck',
        audioClips: [],
        zoomEvents: [
          { type: 'in', videoTimeSec: 5, x: 100, y: 200, zoom: 2 },
          { type: 'out', videoTimeSec: 8 },
        ],
        clickEvents: [],
        annotationEvents: [],
        tabEvents: [{ tabId: 0, wallSec: 0 }],
        tabCreationTimes: { 0: 0 },
        currentTabId: 0,
        lastTargetCoords: null,
        pageUrlEvents: [],
      }),
    )

    const playwright = path.join(bin, 'playwright-cli')
    fs.writeFileSync(
      playwright,
      '#!/bin/sh\n' +
        'if [ "$1" = "eval" ]; then\n' +
        '  echo "http://example.com/slideshow.html"\n' +
        '  exit 0\n' +
        'fi\n' +
        'exit 0\n',
    )
    fs.chmodSync(playwright, 0o755)
    process.env.PATH = `${bin}:${originalPath ?? ''}`

    await demo_bash.run({ command: 'playwright-cli press ArrowRight' }, base)

    const state = JSON.parse(fs.readFileSync(path.join(recordings, 'demo-state.json'), 'utf-8'))
    expect(state.zoomEvents).toHaveLength(2)
    expect(state.zoomEvents[state.zoomEvents.length - 1]).toMatchObject({ type: 'out' })
  })
})
