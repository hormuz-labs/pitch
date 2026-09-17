import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildGallery } from '../effects/build-index.mjs'

let root: string
let effect: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'effects-gallery-'))
  effect = join(root, 'text', 'snap')
  mkdirSync(effect, { recursive: true })
  writeFileSync(join(effect, 'index.html'), '<div>Effect</div>')
  writeFileSync(
    join(root, 'catalog.json'),
    JSON.stringify([
      { familySlug: 'text', slug: 'snap', name: 'Snap', seconds: 2, description: '' },
    ]),
  )
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('effects gallery freshness', () => {
  it('uses live pages without depending on MP4s, posters or saved gallery state', () => {
    writeFileSync(join(root, 'index.html'), 'stale gallery: 7 rendered')
    writeFileSync(join(effect, 'render.json'), JSON.stringify({ duration: 2, errors: [] }))
    writeFileSync(join(effect, 'render.mp4'), 'fixture')
    const updated = buildGallery(root)
    expect(updated.html).toContain('data-src="text/snap/index.html"')
    expect(updated.html).toContain('<iframe title="Live preview: Snap"')
    expect(updated.html).toContain('data-status="ok"')
    expect(updated.html).toContain('1/1 live effects')
    expect(updated.html).not.toContain('render.mp4')
    expect(updated.html).not.toContain('poster.jpg')

    rmSync(join(effect, 'render.mp4'))
    expect(buildGallery(root).html).toContain('data-src="text/snap/index.html"')
  })

  it('ignores an existing poster and offers the full-size live page', () => {
    writeFileSync(join(effect, 'poster.jpg'), 'fixture')
    const { html } = buildGallery(root)
    expect(html).not.toContain('poster.jpg')
    expect(html).toContain('>open live</a>')
  })

  it('discovers a new effect outside the catalog on the next request', () => {
    const another = join(root, 'logos', 'spin')
    mkdirSync(another, { recursive: true })
    writeFileSync(join(another, 'index.html'), '<div>Spin</div>')
    writeFileSync(join(another, 'render.mp4'), 'fixture')
    expect(buildGallery(root)).toMatchObject({ total: 2, built: 2 })
  })
})
