import { beforeEach, describe, expect, it, vi } from 'vitest'

const findJob = vi.fn()
const updateJob = vi.fn()
const addCredits = vi.fn()

vi.mock('@saas/db', () => ({
  prisma: {
    job: { findUnique: findJob },
  },
  updateJob,
  addCredits,
}))

vi.mock('@saas/storage', () => ({ uploadFile: vi.fn() }))
vi.mock('../apps/worker/src/job-processor.js', () => ({ reportJobPhase: vi.fn() }))

describe('launch-video worker failure recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findJob.mockResolvedValue({
      id: 'job_launch_1',
      status: 'PENDING',
      phases: JSON.stringify([
        { phase: 'workspace_init', status: 'completed' },
        { phase: 'processing', status: 'running', startedAt: '2026-08-11T00:00:00.000Z' },
      ]),
    })
    updateJob.mockResolvedValue({ id: 'job_launch_1', status: 'FAILED' })
    addCredits.mockResolvedValue(28)
  })

  it('marks the job failed and refunds launch credits idempotently', async () => {
    const publish = vi.fn().mockResolvedValue(1)
    const { recoverLaunchVideoJobFailure } = await import(
      '../apps/worker/src/launch-video-job-processor.js'
    )

    await recoverLaunchVideoJobFailure({
      jobId: 'job_launch_1',
      userId: 'user_1',
      error: new Error('OpenCode exploded'),
      connection: { publish } as any,
    })

    expect(updateJob).toHaveBeenCalledWith(
      'job_launch_1',
      expect.objectContaining({
        status: 'FAILED',
        error: 'OpenCode exploded',
        phases: expect.any(String),
      }),
    )
    const phases = JSON.parse(updateJob.mock.calls[0][1].phases)
    expect(phases[1]).toEqual(
      expect.objectContaining({ status: 'failed', completedAt: expect.any(String) }),
    )
    expect(addCredits).toHaveBeenCalledWith(
      'user_1',
      5,
      'refund',
      'Refund: Launch video generation failed',
      {
        jobId: 'job_launch_1',
        idempotencyKey: 'refund:launch-video:job_launch_1',
      },
    )
    expect(publish).toHaveBeenCalledTimes(1)
  })

  it('marks a picked-up launch-video job as processing and publishes it', async () => {
    const publish = vi.fn().mockResolvedValue(1)
    updateJob.mockResolvedValue({ id: 'job_launch_1', status: 'PROCESSING' })
    const { markLaunchVideoJobProcessing } = await import(
      '../apps/worker/src/launch-video-job-processor.js'
    )

    await markLaunchVideoJobProcessing('job_launch_1', { publish } as any)

    expect(updateJob).toHaveBeenCalledWith('job_launch_1', { status: 'PROCESSING' })
    expect(publish).toHaveBeenCalledWith(
      'job-updates',
      JSON.stringify({ id: 'job_launch_1', status: 'PROCESSING' }),
    )
  })

  it('recognizes current OpenCode idle signals and an idle status snapshot', async () => {
    const { isLaunchVideoCompletionEvent, isLaunchVideoSessionIdle } = await import(
      '../apps/worker/src/launch-video-job-processor.js'
    )

    expect(isLaunchVideoCompletionEvent({ type: 'session.idle', properties: {} })).toBe(true)
    expect(
      isLaunchVideoCompletionEvent({
        type: 'session.status',
        properties: { status: { type: 'idle' } },
      }),
    ).toBe(true)
    expect(isLaunchVideoSessionIdle({}, 'session-1')).toBe(true)
    expect(isLaunchVideoSessionIdle({ 'session-1': { type: 'busy' } }, 'session-1')).toBe(false)
  })

  it('derives launch phases from bash command inputs, not only tool names', async () => {
    const { detectLaunchVideoPhase } = await import(
      '../apps/worker/src/launch-video-job-processor.js'
    )

    expect(detectLaunchVideoPhase('bash', 'node motion_tts.mjs --text hello')).toBe('voiceover')
    expect(detectLaunchVideoPhase('bash', 'node capture.mjs --output renders/demo.mp4')).toBe(
      'rendering',
    )
    expect(detectLaunchVideoPhase('bash', 'ffmpeg -i vo.wav audio/mix.wav')).toBe('mixing')
    expect(detectLaunchVideoPhase('bash', 'write js/scenes/scene3.js')).toBe('building')
  })
})
