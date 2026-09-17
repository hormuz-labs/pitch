import { afterEach, describe, expect, it, vi } from 'vitest'
import { run } from '../.pi/cli/run.ts'
import { hostAction } from '../.pi/lib/studio-host.ts'

vi.mock('../.pi/lib/studio-host.ts', async original => ({
  ...(await original<typeof import('../.pi/lib/studio-host.ts')>()),
  hostAction: vi.fn(),
}))
afterEach(() => vi.resetAllMocks())

describe('media review CLI', () => {
  it('dispatches the real media and brief to the host', async () => {
    vi.mocked(hostAction).mockResolvedValue('timestamped review')
    const result = await run(
      'media review --file review/film.mp4 --purpose film --brief "About 30 seconds, music only"',
      { cwd: process.cwd() },
    )
    expect(result).toEqual({ ok: true, text: 'timestamped review' })
    expect(hostAction).toHaveBeenCalledWith(process.cwd(), 'media_review', {
      file: 'review/film.mp4',
      purpose: 'film',
      brief: 'About 30 seconds, music only',
    })
  })

  it('fails explicitly when perceptual review is unavailable', async () => {
    vi.mocked(hostAction).mockRejectedValue(new Error('No review was completed'))
    const result = await run('media review film.mp4 --purpose film --brief "A launch"', {
      cwd: process.cwd(),
    })
    expect(result.ok).toBe(false)
    expect(result.text).toContain('No review was completed')
  })

  it('does not expose launch rendering to the agent; export belongs to the user', async () => {
    const result = await run('motion render --out review/film.mp4 --out-res 720p --fps 30', {
      cwd: process.cwd(),
    })
    expect(result.ok).toBe(false)
    expect(result.text).toContain('No "pitch motion render"')
    expect(hostAction).not.toHaveBeenCalled()
  })
})
