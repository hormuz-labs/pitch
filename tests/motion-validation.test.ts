import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cachedValidation } from '../.pi/lib/validation-cache.ts'
import { actionableOverruns } from '../.pi/scripts/launch-video/lib/overruns.mjs'

const dirs: string[] = []
afterEach(async () => {
  await Promise.all(dirs.splice(0).map(d => rm(d, { recursive: true, force: true })))
})

describe('motion validation feedback', () => {
  it('does not send the agent chasing harmless unnamed overruns', () => {
    expect(
      actionableOverruns([
        { id: 'fine', ran: 3.06, dur: 3 },
        { id: 'fix-me', ran: 5, dur: 3 },
      ]),
    ).toEqual([{ id: 'fix-me', ran: 5, dur: 3, speed: 5 / 3 }])
  })

  it('reuses unchanged checks, but invalidates changed source, scope and output frames', async () => {
    const ws = await mkdtemp(path.join(tmpdir(), 'motion-validation-'))
    dirs.push(ws)
    const source = path.join(ws, 'shots.js'),
      outputs = path.join(ws, 'review')
    await mkdir(outputs)
    await writeFile(source, 'first cut')
    const run = vi.fn(async () => {
      await writeFile(path.join(outputs, 'sheet.jpg'), `capture ${run.mock.calls.length}`)
      return '✅ passed'
    })
    const options = { workspace: ws, key: 'full-review', inputs: [source], outputs: [outputs], run }
    await cachedValidation(options)
    expect(await cachedValidation(options)).toContain('Reused successful validation')
    expect(run).toHaveBeenCalledTimes(1)
    await writeFile(source, 'changed cut')
    await cachedValidation(options)
    await cachedValidation({ ...options, key: 'review --shots hook' })
    await cachedValidation(options) // scoped run replaced the full review's sheet
    expect(run).toHaveBeenCalledTimes(4)
    await rm(outputs, { recursive: true })
    await mkdir(outputs)
    await cachedValidation(options)
    expect(run).toHaveBeenCalledTimes(5)
  })

  it('never caches failed checks', async () => {
    const ws = await mkdtemp(path.join(tmpdir(), 'motion-validation-fail-'))
    dirs.push(ws)
    const run = vi.fn(async () => '❌ overlap')
    const options = { workspace: ws, key: 'audit', inputs: [], outputs: [], run }
    await cachedValidation(options)
    await cachedValidation(options)
    expect(run).toHaveBeenCalledTimes(2)
  })
})
