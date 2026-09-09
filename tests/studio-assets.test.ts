import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildContext } from '../apps/api/src/agent/index.js'
import { describeUsage, videoFromInteraction } from '../apps/api/src/pipelines/video-gen.js'
import { assetThumbnail, deleteAsset, kindOf, listAssets } from '../apps/api/src/projects/assets.js'
import type { Workspace } from '../apps/api/src/studio/paths.js'
import { withTargetLegend } from '../apps/web/src/solid/studio/helpers.js'

function workspace(): Workspace {
  const dir = mkdtempSync(path.join(tmpdir(), 'studio-assets-'))
  return { flow: 'studio', userId: 'user_1', name: 'demo', internal: 'studio--user_1--demo', dir }
}

function write(ws: Workspace, rel: string, body = 'x', atSec?: number): void {
  const file = path.join(ws.dir, rel)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, body)
  if (atSec) utimesSync(file, atSec, atSec)
}

describe('kindOf', () => {
  it('recognises the media a project works with', () => {
    expect(kindOf('logo.PNG')).toBe('image')
    expect(kindOf('clip.mov')).toBe('video')
    expect(kindOf('bed.wav')).toBe('audio')
    expect(kindOf('pitch.pdf')).toBe('pdf')
  })

  it('ignores everything else, so the shelf stays a shelf', () => {
    for (const f of ['pdf-builder.js', 'notes.md', 'shots.js', 'project.json'])
      expect(kindOf(f), f).toBeNull()
  })
})

describe('listAssets', () => {
  it('is empty for a workspace that does not exist yet', async () => {
    expect(await listAssets({ ...workspace(), dir: '/nope/nowhere' }, 'proj1')).toEqual([])
  })

  it('collects material from every source and labels where it came from', async () => {
    const ws = workspace()
    write(ws, 'uploads/logo.png', 'x', 1_000_000)
    write(ws, 'renders/gen-establishing.mp4', 'x', 2_000_000)
    write(ws, 'recon/brand/hero.jpg', 'x', 3_000_000)

    const assets = await listAssets(ws, 'proj1')
    expect(assets.map(a => a.path)).toEqual([
      'recon/brand/hero.jpg',
      'renders/gen-establishing.mp4',
      'uploads/logo.png',
    ])
    expect(assets.map(a => a.origin)).toEqual(['harvested', 'generated', 'upload'])
    // The path is the point: it is what a tool takes.
    expect(assets[1].path).toBe('renders/gen-establishing.mp4')
    expect(assets[1].url).toContain('studio--user_1--demo')
  })

  it('leaves working files and pipeline intermediates off the shelf', async () => {
    const ws = workspace()
    write(ws, 'build/qa-renders/slide_1.png')
    write(ws, 'renders/__intermediate.mp4')
    write(ws, 'vendor/gsap/gsap.min.js')
    write(ws, 'build/pdf-builder.js')
    expect(await listAssets(ws, 'proj1')).toEqual([])
  })

  it('does not list the recording editor’s duplicate of an upload', async () => {
    const ws = workspace()
    write(ws, 'uploads/clip.mov')
    write(ws, 'recording/upload.mov')
    expect((await listAssets(ws, 'proj1')).map(a => a.path)).toEqual(['uploads/clip.mov'])
  })
})

describe('asset targets', () => {
  it('reads a picked file as a path, not as an element', () => {
    const out = withTargetLegend('use [1] as the first frame', [
      {
        ref: 1,
        sceneId: null,
        tagName: 'asset',
        className: '',
        id: '',
        text: 'logo.png',
        selector: 'uploads/logo.png',
        asset: 'uploads/logo.png',
        assetOrigin: 'yours',
      },
    ])
    expect(out).toContain('[1] the file uploads/logo.png')
    expect(out).not.toContain('<asset')
    expect(out.endsWith('use [1] as the first frame')).toBe(true)
  })

  it('tells the agent a file target is material, not the thing to change', async () => {
    const ws = workspace()
    const context = await buildContext(ws, {
      first: false,
      options: {},
      targets: [{ asset: 'uploads/logo.png', assetOrigin: 'yours' }],
    })
    expect(context).toContain('[1] the file uploads/logo.png (yours)')
    expect(context).toContain('material to USE')
    expect(context).not.toContain('Change these, not their neighbours')
  })

  it('still says "change these" for an element target', async () => {
    const ws = workspace()
    const context = await buildContext(ws, {
      first: false,
      options: {},
      targets: [{ tagName: 'h1', className: 'title', slide: 2, text: 'Hello', selector: '.title' }],
    })
    expect(context).toContain('Change these, not their neighbours')
  })
})

describe('video generation replies', () => {
  it('finds the clip in the interaction, whichever way it was delivered', () => {
    const uri = videoFromInteraction({
      steps: [
        { type: 'thought', signature: '…' },
        {
          type: 'model_output',
          content: [{ type: 'video', uri: 'https://x/f:download?alt=media' }],
        },
      ],
    })
    expect(uri?.uri).toBe('https://x/f:download?alt=media')

    const inline = videoFromInteraction({
      steps: [{ type: 'model_output', content: [{ mime_type: 'video/mp4', data: 'AAAA' }] }],
    })
    expect(inline?.data).toBe('AAAA')
  })

  it('returns nothing when the model answered without a video', () => {
    expect(videoFromInteraction({ steps: [{ type: 'model_output', content: [] }] })).toBeNull()
    expect(videoFromInteraction({})).toBeNull()
  })

  it('summarises what the generation cost', () => {
    expect(
      describeUsage({
        total_tokens: 20669,
        output_tokens_by_modality: [{ modality: 'video', tokens: 19310 }],
      }),
    ).toBe('20,669 tokens, 19,310 of them video')
    expect(describeUsage(null)).toBe('')
  })
})

describe('page targets', () => {
  it('addresses a PDF page by file and page, not as an element', () => {
    const out = withTargetLegend('rebuild [1] with a lighter palette', [
      {
        ref: 1,
        sceneId: null,
        tagName: 'page',
        className: '',
        id: '',
        text: '',
        selector: 'uploads/pitch-deck.pdf#page=4',
        asset: 'uploads/pitch-deck.pdf',
        page: 4,
      },
    ])
    expect(out).toContain('[1] page 4 of uploads/pitch-deck.pdf')
    expect(out).not.toContain('<page')
  })

  it('reaches the agent as a page of a file', async () => {
    const context = await buildContext(workspace(), {
      first: false,
      options: {},
      targets: [{ asset: 'uploads/pitch-deck.pdf', page: 4 }],
    })
    expect(context).toContain('[1] page 4 of uploads/pitch-deck.pdf')
    expect(context).toContain('material to USE')
  })
})

describe('asset thumbnails', () => {
  it('offers a thumbnail for everything with something to show', async () => {
    const ws = workspace()
    write(ws, 'renders/gen.mp4')
    write(ws, 'uploads/logo.png')
    write(ws, 'input/deck.pdf')
    write(ws, 'audio/mix.wav')
    const by = Object.fromEntries((await listAssets(ws, 'proj1')).map(a => [a.kind, a]))
    for (const kind of ['video', 'image', 'pdf'])
      expect(by[kind]?.thumbUrl, kind).toContain('/assets/thumb?path=')
    // Audio has no picture; the shelf shows a glyph instead of a broken image.
    expect(by.audio?.thumbUrl).toBeNull()
  })

  it('refuses to render anything that is not shelf material', async () => {
    const ws = workspace()
    write(ws, 'build/pdf-builder.js')
    for (const path of ['../../../etc/passwd', '/etc/passwd', 'build/pdf-builder.js'])
      expect(await assetThumbnail(ws, { path }), path).toBeNull()
  })
})

describe('deleteAsset', () => {
  it('removes shelf material and says so', async () => {
    const ws = workspace()
    write(ws, 'uploads/clip.mp4')
    expect(await deleteAsset(ws, 'uploads/clip.mp4')).toBe(true)
    expect((await listAssets(ws, 'proj1')).length).toBe(0)
  })

  it('reports a file that was already gone rather than throwing', async () => {
    expect(await deleteAsset(workspace(), 'uploads/never-existed.mp4')).toBe(false)
  })

  it('refuses anything that is not shelf material', async () => {
    const ws = workspace()
    write(ws, 'build/pdf-builder.js')
    write(ws, 'project.json')
    for (const bad of [
      '../../../etc/hosts',
      '/etc/hosts',
      'build/pdf-builder.js',
      'project.json',
      'vendor/gsap/gsap.min.js',
      // Thumbnail-able but not shelf material: the deck's own output stays.
      'build/output.pdf',
    ])
      await expect(deleteAsset(ws, bad), bad).rejects.toThrow()
  })
})
