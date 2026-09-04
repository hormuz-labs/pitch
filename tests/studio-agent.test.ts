import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { describeWorkspace, RELEVANT } from '../apps/studio/src/agent/describe.js'
import { COMPUTE_USD_PER_SEC, creditsOwed, usageUsd } from '../apps/studio/src/projects/usage.js'
import type { Workspace } from '../apps/studio/src/studio/paths.js'
import { withTargetLegend } from '../apps/studio-web/src/studio/useProject.js'

function workspace(): Workspace {
  const dir = mkdtempSync(path.join(tmpdir(), 'studio-ws-'))
  return { flow: 'studio', userId: 'user_1', name: 'demo', internal: 'studio--user_1--demo', dir }
}

function write(ws: Workspace, rel: string, body = 'x', atSec?: number): void {
  const file = path.join(ws.dir, rel)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, body)
  if (atSec) utimesSync(file, atSec, atSec)
}

describe('describeWorkspace', () => {
  it('previews nothing in an empty workspace', async () => {
    expect((await describeWorkspace(workspace())).preview).toBeNull()
  })

  it('previews an uploaded video before anything has been made from it', async () => {
    const ws = workspace()
    write(ws, 'recording/upload.mp4')
    const desc = await describeWorkspace(ws)
    expect(desc.preview).toEqual({ kind: 'video', url: expect.stringContaining('upload.mp4') })
  })

  it('previews the artifact that changed most recently, whatever kind it is', async () => {
    const ws = workspace()
    write(ws, 'deck.html', '<div class="slide">a</div>', 1_000_000)
    write(ws, 'renders/edit.mp4', 'x', 2_000_000)
    expect((await describeWorkspace(ws)).preview?.kind).toBe('video')

    // The user goes back to the deck: the preview follows, with no flag saying
    // which kind of project this is.
    write(ws, 'deck.html', '<div class="slide">b</div>', 3_000_000)
    expect((await describeWorkspace(ws)).preview?.kind).toBe('deck')
  })

  it('shows the live browser while a recording is running, whatever else exists', async () => {
    const ws = workspace()
    write(ws, 'renders/edit.mp4', 'x', 3_000_000)
    write(ws, 'recording/live.json', JSON.stringify({ profileId: 'p1' }), 1_000_000)
    expect((await describeWorkspace(ws)).preview).toEqual({ kind: 'browser', profileId: 'p1' })
  })

  it('ignores render intermediates', async () => {
    const ws = workspace()
    write(ws, 'renders/raw.mp4')
    write(ws, 'renders/__intermediate.mp4')
    expect((await describeWorkspace(ws)).preview).toBeNull()
  })
})

describe('RELEVANT', () => {
  it('matches the files a preview is built from', () => {
    for (const rel of [
      'deck.html',
      'index.html',
      'js/shots.js',
      'renders/demo-1.mp4',
      'recording/upload.mp4',
      'recording/live.json',
      'build/output.pdf',
      'quieter.mp4',
    ])
      expect(RELEVANT.test(rel), rel).toBe(true)
  })

  it('ignores working files that do not change what is on screen', () => {
    for (const rel of ['direction.md', 'recon/brand-tokens.json', 'build/pdf-builder.js'])
      expect(RELEVANT.test(rel), rel).toBe(false)
  })
})

describe('usage billing', () => {
  it('adds model spend to metered compute time', () => {
    expect(usageUsd({ modelUsd: 0.5, computeSeconds: 0 })).toBeCloseTo(0.5)
    expect(usageUsd({ modelUsd: 0, computeSeconds: 100 })).toBeCloseTo(100 * COMPUTE_USD_PER_SEC)
  })

  it('never bills negative usage', () => {
    expect(usageUsd({ modelUsd: -5, computeSeconds: -5 })).toBe(0)
  })

  it('charges nothing until the cost crosses a whole credit', () => {
    // A cheap edit — the case the old per-flow pricing got most wrong.
    expect(creditsOwed(0.085, 0)).toBe(0)
    expect(creditsOwed(0.1, 0)).toBe(1)
    expect(creditsOwed(0.95, 0)).toBe(9)
  })

  it('bills only the credits not already charged, so turns never double-charge', () => {
    expect(creditsOwed(0.35, 3)).toBe(0)
    expect(creditsOwed(0.45, 3)).toBe(1)
    expect(creditsOwed(0.2, 5)).toBe(0)
  })
})

describe('range targets', () => {
  it('reads a dragged range as a span, and a click as a point', () => {
    const range = withTargetLegend('cut this', [
      {
        ref: 1,
        sceneId: null,
        tagName: 'range',
        className: '',
        id: '',
        text: '',
        selector: 't=1.70s..3.90s',
        time: 1.7,
        endTime: 3.9,
      },
    ])
    expect(range).toContain('[1] the range 1.7s–3.9s (2.2s long)')

    const moment = withTargetLegend('what happens here?', [
      {
        ref: 1,
        sceneId: null,
        tagName: 'moment',
        className: '',
        id: '',
        text: '',
        selector: 't=4.00s',
        time: 4,
      },
    ])
    expect(moment).toContain('[1] the moment at 4.0s')
    expect(moment).not.toContain('range')
  })

  it('keeps the user text after the legend so [n] still resolves', () => {
    const out = withTargetLegend('silence [1]', [
      {
        ref: 1,
        sceneId: null,
        tagName: 'range',
        className: '',
        id: '',
        text: '',
        selector: 't=0.00s..1.00s',
        time: 0,
        endTime: 1,
      },
    ])
    expect(out.endsWith('silence [1]')).toBe(true)
  })
})
