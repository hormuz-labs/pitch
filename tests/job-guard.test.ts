import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@saas/db', () => ({
  prisma: { job: { findUnique: vi.fn() } },
}))

import * as db from '@saas/db'
import { jobAlreadyTerminal } from '../apps/api/src/render/utils/job-guard'

describe('job guard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('skips a queued job whose database record was deleted during cancellation', async () => {
    ;(db.prisma.job.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)

    await expect(jobAlreadyTerminal('deleted-job')).resolves.toBe(true)
  })
})
