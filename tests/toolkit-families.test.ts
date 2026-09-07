/**
 * Which tools a session is built with.
 *
 * Measured on a real launch film: 58 tools, ~40KB of names, descriptions and
 * schemas, shipped on every one of 60 model requests — about a quarter of the
 * token bill, mostly for tools the project never calls. Every extension is
 * loaded once; the tools the model is shown are chosen per turn.
 *
 * The rule this must not break: a project is not a category. Anything can
 * become anything, so the gate has to widen on its own rather than decide once
 * what kind of project this is.
 */
import { describe, expect, it } from 'vitest'
import {
  activeToolNames,
  EXTENSIONS,
  FAMILIES,
  type Family,
  familiesFor,
} from '../apps/api/src/agent/toolkit'

const families = (e: Parameters<typeof familiesFor>[0]) => [...familiesFor(e)].sort()

describe('what the request asks for', () => {
  it('gives a launch film the motion tools, not the demo or deck ones', () => {
    expect(
      families({
        prompt: 'Make a 30 second launch video for example.com',
        files: ['project.json'],
      }),
    ).toEqual(['core', 'motion'])
  })

  it('takes the skill pill the user picked as evidence, whatever the words say', () => {
    // "A cinematic brand documentary" with skill: launch-video landed in a
    // session with no motion tools; the agent read the extensions' source to
    // find out how recon worked.
    expect(
      families({
        prompt: 'A cinematic brand documentary about our origin for https://box.ascii.dev',
        files: ['project.json', 'assets', 'audio', 'recon', 'renders', 'uploads'],
        skill: 'launch-video',
      }),
    ).toEqual(['core', 'motion'])
    expect(families({ prompt: 'go', files: ['project.json'], skill: 'slide-deck' })).toEqual([
      'core',
      'deck',
    ])
    expect(families({ prompt: 'go', files: ['project.json'], skill: 'recording-edit' })).toEqual([
      'core',
      'recording',
    ])
  })

  it('knows a film by its other names', () => {
    for (const p of [
      'a brand film',
      'a documentary about us',
      'a 30s commercial',
      'an explainer for the API',
    ])
      expect(families({ prompt: p, files: ['project.json'] })).toContain('motion')
  })

  it('gives a deck the deck tools', () => {
    expect(
      families({ prompt: 'build me a pitch deck about our Q3 numbers', files: ['project.json'] }),
    ).toEqual(['core', 'deck'])
  })

  it('gives a walkthrough the demo tools', () => {
    expect(
      families({
        prompt: 'record a narrated walkthrough of our dashboard',
        files: ['project.json'],
      }),
    ).toEqual(['core', 'demo'])
  })

  it('treats a bare "video" as ambiguous and loads both video pipelines', () => {
    // A launch film and a demo are both "a video"; guessing wrong costs a turn.
    expect(families({ prompt: 'make me a video', files: ['project.json'] })).toEqual([
      'core',
      'demo',
      'motion',
    ])
  })

  it('hands over everything when there is nothing to go on', () => {
    // A bare "help me" must not land in a project that can do nothing.
    expect(families({ prompt: 'hi' })).toEqual(Object.keys(FAMILIES).sort())
  })
})

describe('what the workspace already holds', () => {
  it('recognises a launch film in progress', () => {
    expect(families({ files: ['index.html', 'shots.js', 'audio'] })).toEqual(['core', 'motion'])
  })

  it('recognises a deck in progress', () => {
    expect(families({ files: ['deck.html'] })).toEqual(['core', 'deck'])
    expect(families({ files: ['build/pdf-builder.js'] })).toEqual(['core', 'deck'])
  })

  it('recognises an uploaded recording, so "turn the music down" has its tools', () => {
    expect(families({ files: ['recording/upload.mp4'] })).toEqual(['core', 'demo', 'recording'])
  })

  it('routes uploads by type', () => {
    expect(families({ uploads: ['slides.pptx'] })).toEqual(['core', 'deck'])
    expect(families({ uploads: ['screencast.mov'] })).toEqual(['core', 'recording'])
  })
})

describe('a project is not a category', () => {
  it('widens when a deck is asked to become a film', () => {
    const before = familiesFor({ files: ['deck.html'] })
    const after = familiesFor({ files: ['deck.html'], prompt: 'now turn this into a launch video' })
    expect([...before]).not.toContain('motion')
    expect([...after]).toContain('motion')
    // and it keeps what it had, so the deck is still editable
    for (const f of before) expect([...after]).toContain(f)
  })

  it('always carries the media toolbox, whatever else it has', () => {
    for (const evidence of [{ prompt: 'a deck' }, { files: ['shots.js', 'index.html'] }, {}]) {
      expect([...familiesFor(evidence)]).toContain('core')
    }
  })
})

describe('the active tool list', () => {
  // What pi would report after loading every extension.
  const loaded = new Map<string, string[]>([
    [FAMILIES.core[0], ['media_probe', 'media_ffmpeg', 'media_publish']],
    [FAMILIES.motion[0], ['motion_recon', 'motion_render']],
    [FAMILIES.motion[1], ['video_generate']],
    [FAMILIES.deck[0], ['deck_render', 'deck_publish']],
    [FAMILIES.deck[1], ['pdf_scaffold', 'pdf_build']],
    [FAMILIES.demo[0], ['demo_narrate']],
    [FAMILIES.demo[1], ['demo_record_start']],
    [FAMILIES.recording[0], ['probe_video']],
    [FAMILIES.recording[1], ['edit_render']],
  ])
  const files = ['read', 'write', 'edit', 'ls', 'find', 'grep', 'bash']

  it('is a real reduction for a launch film, and keeps the file tools', () => {
    const film = activeToolNames(
      familiesFor({ prompt: 'launch video', files: ['shots.js', 'index.html'] }),
      loaded,
      files,
    )
    expect(film).toEqual(
      expect.arrayContaining([...files, 'media_probe', 'motion_render', 'video_generate']),
    )
    expect(film).not.toContain('probe_video')
    expect(film).not.toContain('pdf_build')
    expect(film).not.toContain('demo_narrate')
  })

  it('names each tool once when two families share an extension', () => {
    const both = activeToolNames(familiesFor({ prompt: 'make me a video' }), loaded, files)
    expect(both.filter(n => n === 'video_generate')).toHaveLength(1)
  })

  it('covers every family in EXTENSIONS, so nothing is orphaned', () => {
    for (const f of Object.keys(FAMILIES) as Family[])
      for (const e of FAMILIES[f]) expect(EXTENSIONS).toContain(e)
  })
})
