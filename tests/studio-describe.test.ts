/**
 * Does the studio recognise what the agent just built?
 *
 * hasResult() decides whether a finished turn produced anything; when it says
 * no, the project is marked failed and the credits refunded. It asked for the
 * shot list under js/, where no project has ever kept it, so every completed
 * launch film was reported as "The agent finished without producing anything"
 * while sitting complete on disk.
 */
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { artifactKind, describeWorkspace, hasArtifact } from '../apps/api/src/agent/describe'

const dirs: string[] = []

function workspace(files: Record<string, string>) {
  const dir = mkdtempSync(path.join(tmpdir(), 'describe-'))
  dirs.push(dir)
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(dir, rel)
    mkdirSync(path.dirname(abs), { recursive: true })
    writeFileSync(abs, body)
  }
  return { dir, internal: path.basename(dir), userId: 'u', name: 'n', flow: 'studio' } as never
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true })
})

const FILM = {
  'index.html': '<!doctype html><script src="shots.js"></script>',
  'shots.js': 'window.SHOTS = { shots: [{ id: "a", type: "word-cut", dur: 1.5 }] }',
}

describe('a finished launch film counts as a result', () => {
  it('finds shots.js at the workspace root, where index.html loads it from', async () => {
    await expect(hasArtifact(workspace(FILM))).resolves.toBe(true)
  })

  it('still accepts the legacy js/shots.js layout', async () => {
    const ws = workspace({
      'index.html': '<!doctype html>',
      'js/shots.js': 'window.SHOTS = { shots: [] }',
    })
    await expect(hasArtifact(ws)).resolves.toBe(true)
  })

  it('is not fooled by js/shots.custom.js, which is a different file', async () => {
    const ws = workspace({
      'index.html': '<!doctype html>',
      'js/shots.custom.js': 'window.SHOT_TYPES = {}',
    })
    await expect(hasArtifact(ws)).resolves.toBe(false)
  })

  it('needs both halves — a page with no shot list is not a film', async () => {
    await expect(hasArtifact(workspace({ 'index.html': '<!doctype html>' }))).resolves.toBe(false)
    await expect(hasArtifact(workspace({ 'shots.js': 'window.SHOTS = {}' }))).resolves.toBe(false)
  })

  it('says no for an empty workspace', async () => {
    await expect(hasArtifact(workspace({ 'project.json': '{}' }))).resolves.toBe(false)
  })
})

describe('an export never displaces the artifact it came from', () => {
  // The exported file is the newest thing in the workspace, so sorting by
  // mtime made the preview jump from the shots.js editor to a plain video
  // player the moment the user pressed Export — and the film was no longer
  // editable. utimes puts the export a minute ahead so the test cannot pass
  // on a tie.
  const later = (dir: string, rel: string) => {
    const t = new Date(Date.now() + 60_000)
    utimesSync(path.join(dir, rel), t, t)
  }

  it('keeps a launch film in the editor after renders/launch-720p.mp4 lands', async () => {
    const ws = workspace({ ...FILM, 'renders/launch-720p.mp4': 'mp4' })
    later((ws as any).dir, 'renders/launch-720p.mp4')
    expect(await artifactKind(ws)).toBe('launch')
  })

  it('keeps a deck in the deck editor after deck_publish renders build/output.pdf', async () => {
    const ws = workspace({
      'deck.html': '<section class="slide">one</section>',
      'build/output.pdf': '%PDF',
    })
    later((ws as any).dir, 'build/output.pdf')
    expect(await artifactKind(ws)).toBe('deck')
  })

  it('offers the PDF as the deck download without exposing deck.html as an export', async () => {
    const ws = workspace({
      'deck.html': '<section class="slide">one</section>',
      'build/output.pdf': '%PDF',
    })
    const description = await describeWorkspace(ws)
    expect(description.outputs.map(output => output.kind)).toEqual(['pdf'])
  })

  it('still previews a plain render when there is no film to edit', async () => {
    const ws = workspace({ 'renders/demo-1.mp4': 'mp4' })
    expect(await artifactKind(ws)).toBe('video')
  })

  it('still previews an uploaded PDF, and an uploaded video over the film', async () => {
    const pdf = workspace({ 'uploads/pitch.pdf': '%PDF' })
    expect(await artifactKind(pdf)).toBe('pdf')
    // A video the user just dropped in IS a new thing to look at.
    const film = workspace({ ...FILM, 'uploads/clip.mp4': 'mp4' })
    later((film as any).dir, 'uploads/clip.mp4')
    expect(await artifactKind(film)).toBe('launch')
  })
})
