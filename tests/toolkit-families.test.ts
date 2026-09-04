/**
 * Which tools a session is built with.
 *
 * Measured on a real launch film: 58 tools, ~42KB of names, descriptions and
 * schemas, shipped on every one of 60 model requests — about a quarter of the
 * token bill, mostly for tools the project never calls. pi cannot vary the
 * tool list per turn, so the families are chosen when the session is built.
 *
 * The rule this must not break: a project is not a category. Anything can
 * become anything, so the gate has to widen on its own rather than decide once
 * what kind of project this is.
 */
import { describe, expect, it } from 'vitest'
import {
  EXTENSIONS,
  extensionsFor,
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

describe('the extension list', () => {
  it('is a real reduction for a launch film', () => {
    const film = extensionsFor({ prompt: 'launch video', files: ['shots.js', 'index.html'] })
    expect(film.length).toBeLessThan(EXTENSIONS.length)
    expect(film.some(e => e.includes('recording-tools'))).toBe(false)
    expect(film.some(e => e.includes('pdf-tools'))).toBe(false)
    expect(film.some(e => e.includes('html-motion-tools'))).toBe(true)
  })

  it('deduplicates extensions two families share', () => {
    const both = extensionsFor({ prompt: 'make me a video' }) // motion + demo, both want video-gen
    expect(both.length).toBe(new Set(both).size)
  })

  it('covers every family in EXTENSIONS, so nothing is orphaned', () => {
    for (const f of Object.keys(FAMILIES) as Family[])
      for (const e of FAMILIES[f]) expect(EXTENSIONS).toContain(e)
  })
})
