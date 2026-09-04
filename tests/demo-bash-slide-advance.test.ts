import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import demoTools from '../.pi/extensions/demo-tools.ts'
import { collectTools } from '../.pi/lib/testing.ts'

const { demo_bash } = collectTools(demoTools)

const originalPath = process.env.PATH

describe('demo_bash slide advance', () => {
  afterEach(() => {
    process.env.PATH = originalPath
  })

  it('injects a zoom-out event when advancing a slideshow while zoomed in', async () => {
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
    expect(state.zoomEvents).toHaveLength(2)
    expect(state.zoomEvents[0]).toMatchObject({ type: 'in' })
    expect(state.zoomEvents[1]).toMatchObject({ type: 'out' })
  })

  it('does not inject a zoom-out event when already zoomed out', async () => {
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
