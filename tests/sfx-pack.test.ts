import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterAll, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const SCRIPT = path.resolve('.pi/scripts/launch-video/sfx.mjs')
const dirs: string[] = []

afterAll(async () => {
  for (const d of dirs) await rm(d, { recursive: true, force: true })
})

async function plan(cues: object[], settings?: object) {
  const ws = await mkdtemp(path.join(tmpdir(), 'pitch-sfx-pack-'))
  dirs.push(ws)
  await mkdir(path.join(ws, 'audio'), { recursive: true })
  await writeFile(path.join(ws, 'audio/sfx-cues.json'), JSON.stringify({ duration: 10, cues }))
  if (settings) await writeFile(path.join(ws, 'audio/mix-settings.json'), JSON.stringify(settings))
  const run = await execFileAsync('node', [SCRIPT, 'build', '--duration=10', '--dry-run'], {
    cwd: ws,
  }).catch((e: { stdout: string; code: number }) => ({ stdout: e.stdout, code: e.code }))
  return run.stdout
}
const row = (out: string, clip: string) => out.split('\n').find(l => l.includes(clip)) || ''
const startOf = (line: string) => Number(line.trim().replace(/^★\s*/, '').split(/\s+/)[1])

describe('curated SFX pack', () => {
  it('ranks the studio pack first and resolves its short ids', async () => {
    const out = await plan([
      { t: 2, event: 'whoosh_soft' },
      { t: 5, event: 'impact', clip: 'gakuyen-deep-thud', dur: 0.8 },
    ])
    expect(out).toMatch(/Pack gakuyen first · density heavy/)
    expect(out).toMatch(/whoosh_soft\s+gakuyen-/)
    expect(out).toContain('gakuyen-deep-thud.opus')
    expect(out).not.toMatch(/not in manifest/)
  })

  it('lets different classes layer on one moment but flags the same class smearing', async () => {
    const layered = await plan([
      { t: 5, event: 'riser', clip: 'gakuyen-cinematic-riser', dur: 1.5 },
      { t: 5, event: 'impact', clip: 'gakuyen-hit-large', dur: 2 },
      { t: 5, event: 'subdrop', dur: 2 },
      { t: 5, event: 'whoosh_deep', clip: 'gakuyen-dramatic-whoosh', dur: 1.2 },
    ])
    expect(layered).not.toMatch(/smear/)
    const smeared = await plan([
      { t: 5, event: 'impact', clip: 'gakuyen-hit-large', dur: 2 },
      { t: 5.05, event: 'impact', clip: 'gakuyen-deep-thud', dur: 1 },
    ])
    expect(smeared).toMatch(/smear/)
  })

  it('ends a riser on its crest and peaks a whoosh on its cue', async () => {
    const out = await plan([
      { t: 6, event: 'riser', clip: 'gakuyen-cinematic-riser', dur: 1.5 },
      { t: 3, event: 'whoosh_soft', clip: 'gakuyen-flyby-whoosh' },
    ])
    // A crest riser starts its audible approach dur seconds before t.
    expect(startOf(row(out, 'gakuyen-cinematic-riser'))).toBeCloseTo(4.5, 2)
    // The flyby peaks ~1.25s after its onset, so it must start well before 3s.
    expect(startOf(row(out, 'gakuyen-flyby-whoosh'))).toBeLessThan(2)
  })

  it('keeps the old sparse budget when a project asks for standard density', async () => {
    const cues = Array.from({ length: 8 }, (_, i) => ({ t: 0.5 + i, event: 'impact', dur: 0.5 }))
    expect(await plan(cues, { 'sfx-density': 'standard' })).toMatch(/budget ~6/)
    expect(await plan(cues)).not.toMatch(/budget ~22/)
  })
})
