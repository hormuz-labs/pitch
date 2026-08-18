/**
 * Behaviour tests for the public-share DB functions (packages/db/src/index.ts:
 * makeJobPublic, unmakeJobPublic, getPublicJobBySlug, incrementShareViews).
 *
 * Important limitation: like referral.db.test.ts, @zenstackhq/runtime's
 * `enhance` is mocked as an identity passthrough here, so these tests verify
 * this file's own branching logic (idempotency, collision retry, which client
 * getEnhancedPrisma is called with) — they do NOT exercise the actual
 * ZenStack access policy in schema.zmodel (`@@allow('read', isPublic == true)`
 * / the narrowed `@@deny`). That policy — specifically, that a non-owner is
 * rejected when calling makeJobPublic on someone else's job — was verified
 * manually against a real Postgres + real generated ZenStack client; it isn't
 * covered by this mocked suite.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@prisma/client', () => {
  const instance = {
    job: { findUnique: vi.fn(), update: vi.fn() },
  }
  function PrismaClient() {
    return instance
  }
  return { PrismaClient, Prisma: {} }
})

vi.mock('@zenstackhq/runtime', () => ({ enhance: vi.fn((p: any) => p) }))
vi.mock('dotenv', () => ({ config: vi.fn(), default: { config: vi.fn() } }))

import { PrismaClient } from '@prisma/client'
import { enhance } from '@zenstackhq/runtime'
import {
  getPublicJobBySlug,
  incrementShareViews,
  makeJobPublic,
  unmakeJobPublic,
} from '../packages/db/src/index.js'

const prisma = new (PrismaClient as any)() as any

function rawJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job_1',
    userId: 'owner_user',
    status: 'COMPLETED',
    videoUrl: 'https://cdn.example/video.mp4',
    thumbnailUrl: null,
    parameters: JSON.stringify({ url: 'https://example.com' }),
    phases: null,
    isPublic: false,
    shareSlug: null,
    shareViews: 0,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('makeJobPublic', () => {
  it('mints a new slug on first share and persists it with isPublic: true', async () => {
    prisma.job.findUnique
      .mockResolvedValueOnce({ shareSlug: null }) // the owner-scoped existence check
      .mockResolvedValueOnce(null) // slug-collision probe: first candidate is free
    prisma.job.update.mockResolvedValue({})

    const result = await makeJobPublic('job_1', { id: 'owner_user' })

    expect(result.shareSlug).toMatch(/^[A-Za-z0-9_-]{6,}$/)
    expect(prisma.job.update).toHaveBeenCalledWith({
      where: { id: 'job_1' },
      data: { isPublic: true, shareSlug: result.shareSlug },
    })
  })

  it('is idempotent — reshares an already-shared job without rotating the slug', async () => {
    prisma.job.findUnique.mockResolvedValueOnce({ shareSlug: 'existing-slug' })
    prisma.job.update.mockResolvedValue({})

    const result = await makeJobPublic('job_1', { id: 'owner_user' })

    expect(result.shareSlug).toBe('existing-slug')
    expect(prisma.job.update).toHaveBeenCalledWith({
      where: { id: 'job_1' },
      data: { isPublic: true },
    })
    // No collision probe needed — the slug already exists, so it never
    // generates a candidate to check.
    expect(prisma.job.findUnique).toHaveBeenCalledTimes(1)
  })

  it('retries slug generation on collision until a free one is found', async () => {
    prisma.job.findUnique
      .mockResolvedValueOnce({ shareSlug: null }) // existence check
      .mockResolvedValueOnce({ id: 'some_other_job' }) // 1st candidate taken
      .mockResolvedValueOnce({ id: 'some_other_job' }) // 2nd candidate taken
      .mockResolvedValueOnce(null) // 3rd candidate free
    prisma.job.update.mockResolvedValue({})

    const result = await makeJobPublic('job_1', { id: 'owner_user' })

    expect(result.shareSlug).toBeTruthy()
    expect(prisma.job.findUnique).toHaveBeenCalledTimes(4)
  })

  it('throws when the job does not exist for this (enhanced-client-scoped) user', async () => {
    // Under the real ZenStack policy this is also what a non-owner sees:
    // the row is invisible to the enhanced client, so findUnique resolves
    // null rather than the policy throwing — see the file header note.
    prisma.job.findUnique.mockResolvedValueOnce(null)

    await expect(makeJobPublic('job_1', { id: 'someone_else' })).rejects.toThrow('Job not found')
    expect(prisma.job.update).not.toHaveBeenCalled()
  })
})

describe('unmakeJobPublic', () => {
  it('sets isPublic: false and leaves the slug untouched', async () => {
    prisma.job.update.mockResolvedValue({})

    await unmakeJobPublic('job_1', { id: 'owner_user' })

    expect(prisma.job.update).toHaveBeenCalledWith({
      where: { id: 'job_1' },
      data: { isPublic: false },
    })
    const writeData = prisma.job.update.mock.calls[0][0].data
    expect(writeData).not.toHaveProperty('shareSlug')
  })
})

describe('getPublicJobBySlug', () => {
  it('returns null for an unknown slug', async () => {
    prisma.job.findUnique.mockResolvedValueOnce(null)

    const result = await getPublicJobBySlug('nonexistent')

    expect(result).toBeNull()
  })

  it('looks up through the anonymous (no-user) enhanced client, not a raw bypass', async () => {
    prisma.job.findUnique.mockResolvedValueOnce(rawJob())

    await getPublicJobBySlug('some-slug')

    // The point of going through getEnhancedPrisma(undefined) rather than the
    // raw `prisma` singleton is that ZenStack's isPublic==true policy is what
    // actually gates this read. Assert the anonymous context was used, so a
    // future refactor can't silently swap in the unsafe raw-client shortcut
    // (the pattern getWebhookDelivery uses) without this test catching it.
    expect(enhance).toHaveBeenCalledWith(expect.anything(), { user: undefined })
  })

  it('returns the serialized job when found', async () => {
    prisma.job.findUnique.mockResolvedValueOnce(rawJob({ shareSlug: 'abc123', isPublic: true }))

    const result = await getPublicJobBySlug('abc123')

    expect(result).toMatchObject({
      id: 'job_1',
      status: 'COMPLETED',
      videoUrl: 'https://cdn.example/video.mp4',
      parameters: { url: 'https://example.com' },
    })
  })
})

describe('incrementShareViews', () => {
  it('bumps the view counter by one', async () => {
    prisma.job.update.mockResolvedValue({})

    await incrementShareViews('job_1')

    expect(prisma.job.update).toHaveBeenCalledWith({
      where: { id: 'job_1' },
      data: { shareViews: { increment: 1 } },
    })
  })
})
