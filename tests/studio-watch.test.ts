import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ASSET_PATH } from '../apps/api/src/projects/assets.js'
import { unwatchWorkspace, watchWorkspace } from '../apps/api/src/studio/watch.js'

describe('ASSET_PATH', () => {
  it('matches material the shelf lists, wherever it was written', () => {
    for (const rel of [
      'renders/gen-establishing.mp4', // video_generate
      'recon/hero.png', // motion_harvest
      'recon/brand/logo.svg',
      'build/images/dawn/pinterest_01.jpg', // pdf_scrape_images
      'build/input-images/slide3.png', // pdf_parse, preserve mode
      'uploads/clip.MOV', // added mid-session
      'audio/mix.wav',
      'input/pitch.pdf',
    ])
      expect(ASSET_PATH.test(rel), rel).toBe(true)
  })

  it('ignores working files, intermediates and the engine runtime', () => {
    for (const rel of [
      'build/pdf-builder.js',
      'deck.html',
      'js/shots.js',
      'renders/gen-establishing.mp4.omni.json',
      'vendor/gsap/gsap.min.js',
      'project.json',
      'renders/notmp4', // the extension needs its dot
    ])
      expect(ASSET_PATH.test(rel), rel).toBe(false)
  })
})

/**
 * The routing that matters: a harvested logo must refresh the shelf WITHOUT
 * re-describing the workspace, because that is the expensive half and it also
 * reseeks the player the user is watching.
 */
describe('watchWorkspace routing', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const d of dirs.splice(0)) unwatchWorkspace(d)
  })

  function harness() {
    const dir = mkdtempSync(path.join(tmpdir(), 'studio-watch-'))
    dirs.push(dir)
    const events: Array<{ type: string; files: string[] }> = []
    let probes = 0
    watchWorkspace(
      dir,
      {
        relevant: /^renders\/.+\.mp4$/,
        assets: ASSET_PATH,
        probe: async () => {
          probes += 1
          return { ok: true, error: null, description: {} as any }
        },
        debounceMs: 30,
      },
      ev => events.push({ type: ev.type, files: ev.files }),
    )
    return { dir, events, probeCount: () => probes }
  }

  const write = (dir: string, rel: string) => {
    const file = path.join(dir, rel)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, 'x')
  }

  /** fs.watch delivery is asynchronous and platform-dependent. */
  async function settle(check: () => boolean, ms = 4000): Promise<void> {
    const until = Date.now() + ms
    while (Date.now() < until) {
      if (check()) return
      await new Promise(r => setTimeout(r, 50))
    }
  }

  it('reports shelf-only changes without describing the workspace', async () => {
    const h = harness()
    write(h.dir, 'recon/harvested-logo.png')
    await settle(() => h.events.length > 0)

    expect(h.events.map(e => e.type)).toEqual(['assets'])
    expect(h.events[0].files).toContain('recon/harvested-logo.png')
    expect(h.probeCount()).toBe(0)
  })

  it('still describes the workspace when the preview changes', async () => {
    const h = harness()
    write(h.dir, 'renders/gen-establishing.mp4')
    await settle(() => h.events.length > 0)

    expect(h.events.map(e => e.type)).toEqual(['preview'])
    expect(h.probeCount()).toBe(1)
  })

  it('prefers the preview event when a batch touches both', async () => {
    const h = harness()
    write(h.dir, 'recon/harvested-logo.png')
    write(h.dir, 'renders/gen-establishing.mp4')
    await settle(() => h.events.length > 0)

    // One event, not two: the client refreshes the shelf on a preview too.
    expect(h.events.map(e => e.type)).toEqual(['preview'])
  })

  it('says nothing about files that are neither', async () => {
    const h = harness()
    write(h.dir, 'build/pdf-builder.js')
    write(h.dir, 'notes.md')
    await settle(() => h.events.length > 0, 800)

    expect(h.events).toEqual([])
    expect(h.probeCount()).toBe(0)
  })
})
