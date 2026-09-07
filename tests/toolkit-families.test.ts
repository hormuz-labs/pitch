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
 * what kind of project this is. And it never guesses from the user's words:
 * the evidence is what is on disk, what was uploaded, and the skills — picked
 * on /new or read by the agent — each declaring its tools in its frontmatter.
 */
import { describe, expect, it } from 'vitest'
import {
  activeToolNames,
  EXTENSIONS,
  FAMILIES,
  type Family,
  familiesFor,
  familyOfTool,
  parseSkillTools,
  skillNamed,
} from '../apps/api/src/agent/toolkit'

const families = (e: Parameters<typeof familiesFor>[0]) => [...familiesFor(e)].sort()

const declared = new Map<string, Family[]>([
  ['launch-video', ['motion']],
  ['generated-video', ['motion']],
  ['demo-video', ['demo']],
  ['slide-deck', ['deck']],
  ['recording-edit', ['recording']],
])

describe('what the skills declare', () => {
  it('reads the tools line of a frontmatter, in any of its spellings', () => {
    expect(parseSkillTools('---\nname: x\ntools: motion\ndescription: d\n---\n# X')).toEqual([
      'motion',
    ])
    expect(parseSkillTools('---\nname: x\ntools: [motion, demo]\n---\n')).toEqual([
      'motion',
      'demo',
    ])
    expect(parseSkillTools('---\nname: x\ntools: motion, deck\n---\n')).toEqual(['motion', 'deck'])
  })

  it('ignores a family that does not exist, and a skill with no line', () => {
    expect(parseSkillTools('---\nname: x\ntools: motion, laser\n---\n')).toEqual(['motion'])
    expect(parseSkillTools('---\nname: x\ndescription: d\n---\n')).toEqual([])
    expect(parseSkillTools('# no frontmatter\ntools: motion')).toEqual([])
  })

  it('gives a project the tools of the skill picked on /new, whatever the words say', () => {
    // "A cinematic brand documentary" with skill: launch-video used to land
    // in a session with no motion tools — no keyword matched.
    expect(
      families({
        files: ['project.json', 'assets', 'audio', 'recon', 'renders', 'uploads'],
        skills: ['launch-video'],
        declared,
      }),
    ).toEqual(['core', 'motion'])
    expect(families({ files: ['project.json'], skills: ['slide-deck'], declared })).toEqual([
      'core',
      'deck',
    ])
    expect(families({ files: ['project.json'], skills: ['recording-edit'], declared })).toEqual([
      'core',
      'recording',
    ])
  })

  it('gives a project the tools of every skill the agent has read', () => {
    expect(
      families({
        files: ['project.json'],
        skills: ['launch-video', 'generated-video', 'demo-video'],
        declared,
      }),
    ).toEqual(['core', 'demo', 'motion'])
  })

  it('hands over everything when there is nothing to go on', () => {
    // A bare "help me" must not land in a project that can do nothing.
    expect(families({})).toEqual(Object.keys(FAMILIES).sort())
    expect(families({ files: ['project.json', 'assets', 'audio'] })).toEqual(
      Object.keys(FAMILIES).sort(),
    )
  })

  it('does not hand over everything once a skill is in play', () => {
    expect(families({ skills: ['slide-deck'], declared })).toEqual(['core', 'deck'])
  })
})

describe('the moment the agent reads a skill', () => {
  it('is a read of its SKILL.md, absolute or relative, or a shell command naming it', () => {
    expect(skillNamed({ path: '/srv/pitch/.pi/skills/launch-video/SKILL.md' })).toBe('launch-video')
    expect(skillNamed({ path: '../../.pi/skills/slide-deck/SKILL.md' })).toBe('slide-deck')
    expect(skillNamed({ command: 'cat /srv/pitch/.pi/skills/demo-video/SKILL.md | head' })).toBe(
      'demo-video',
    )
  })

  it('is not any other read', () => {
    expect(skillNamed({ path: 'shots.js' })).toBeNull()
    expect(
      skillNamed({ path: '/srv/pitch/.pi/skills/launch-video/references/audio.md' }),
    ).toBeNull()
    expect(skillNamed(undefined)).toBeNull()
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
  it('widens when a deck reads the launch-video skill', () => {
    const before = familiesFor({ files: ['deck.html'] })
    const after = familiesFor({ files: ['deck.html'], skills: ['launch-video'], declared })
    expect([...before]).not.toContain('motion')
    expect([...after]).toContain('motion')
    // and it keeps what it had, so the deck is still editable
    for (const f of before) expect([...after]).toContain(f)
  })

  it('always carries the media toolbox, whatever else it has', () => {
    for (const evidence of [
      { skills: ['slide-deck'], declared },
      { files: ['shots.js', 'index.html'] },
      {},
    ]) {
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
    const film = activeToolNames(familiesFor({ files: ['shots.js', 'index.html'] }), loaded, files)
    expect(film).toEqual(
      expect.arrayContaining([...files, 'media_probe', 'motion_render', 'video_generate']),
    )
    expect(film).not.toContain('probe_video')
    expect(film).not.toContain('pdf_build')
    expect(film).not.toContain('demo_narrate')
  })

  it('names each tool once when two families share an extension', () => {
    const both = activeToolNames(familiesFor({}), loaded, files)
    expect(both.filter(n => n === 'video_generate')).toHaveLength(1)
  })

  it('knows which family owns a tool the model called without being shown it', () => {
    // pi answers "Tool motion_recon not found"; the session widens and the
    // agent's retry finds it.
    expect(familyOfTool('motion_recon', loaded)).toBe('motion')
    expect(familyOfTool('pdf_build', loaded)).toBe('deck')
    expect(familyOfTool('no_such_tool', loaded)).toBeNull()
  })

  it('covers every family in EXTENSIONS, so nothing is orphaned', () => {
    for (const f of Object.keys(FAMILIES) as Family[])
      for (const e of FAMILIES[f]) expect(EXTENSIONS).toContain(e)
  })
})
