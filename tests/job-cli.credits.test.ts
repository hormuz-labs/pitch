/**
 * Unit tests for job-cli credit-refund logic.
 *
 * We recreate the two action handlers inline (mirroring apps/job-cli/src/index.ts)
 * and verify the correct credit behaviour without spawning a child process.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JobStatus, JOB_UPDATES_CHANNEL } from '../packages/shared/src/index.js';

// ── vi.mock factories must be self-contained (hoisted before any const) ───────
vi.mock('../packages/db/src/index.js', () => ({
  updateJob:   vi.fn(),
  addCredits:  vi.fn(),
}));

vi.mock('../packages/storage/src/index.js', () => ({
  uploadFile: vi.fn(),
  deleteFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../packages/email/src/index.js', () => ({
  getClerkUserEmail:  vi.fn().mockResolvedValue(null),
  sendJobCompleteEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('ioredis', () => {
  const instance = { publish: vi.fn().mockResolvedValue(1) };
  function Redis() { return instance; }
  return { Redis };
});

vi.mock('dotenv', () => ({ default: { config: vi.fn() }, config: vi.fn() }));

// ── Import mocked modules ─────────────────────────────────────────────────────
import * as db      from '../packages/db/src/index.js';
import * as storage from '../packages/storage/src/index.js';
import { Redis }    from 'ioredis';

// Grab the singleton the mock always returns
const mockRedisInstance = new (Redis as any)();

// ── Inline recreation of job-cli push/status action handlers ─────────────────
async function pushAction(options: { jobId: string; file: string; audio?: string; bucket?: string }) {
  const redis = new (Redis as any)('redis://localhost:6379');
  const { jobId, file, audio, bucket } = options;
  const uploadedUrls: string[] = [];

  try {
    const videoUrl = await (storage.uploadFile as any)(file, bucket);
    uploadedUrls.push(videoUrl);

    let audioUrl: string | undefined;
    if (audio) {
      audioUrl = await (storage.uploadFile as any)(audio, bucket);
      uploadedUrls.push(audioUrl);
    }

    const updatedJob = await (db.updateJob as any)(jobId, { status: JobStatus.COMPLETED, videoUrl, audioUrl });
    await redis.publish(JOB_UPDATES_CHANNEL, JSON.stringify(updatedJob));
    return { success: true, job: updatedJob };
  } catch (error: any) {
    // Clean up any already-uploaded files
    for (const url of uploadedUrls) {
      try { await (storage.deleteFile as any)(url, bucket); } catch { /* swallow */ }
    }
    // Mark FAILED and refund
    try {
      const failedJob = await (db.updateJob as any)(jobId, { status: JobStatus.FAILED });
      await redis.publish(JOB_UPDATES_CHANNEL, JSON.stringify(failedJob));
      const tenantId = failedJob.orgId || failedJob.userId;
      await (db.addCredits as any)(tenantId, 1, 'job_failed_refund', jobId);
    } catch { /* swallow refund errors */ }
    return { success: false, error: error.message };
  }
}

async function statusAction(options: { jobId: string; status: string }) {
  const redis = new (Redis as any)('redis://localhost:6379');
  const { jobId } = options;
  const jobStatus = options.status.toUpperCase() as JobStatus;

  const updatedJob = await (db.updateJob as any)(jobId, { status: jobStatus });
  await redis.publish(JOB_UPDATES_CHANNEL, JSON.stringify(updatedJob));

  if (jobStatus === JobStatus.FAILED) {
    const tenantId = updatedJob.orgId || updatedJob.userId;
    await (db.addCredits as any)(tenantId, 1, 'job_failed_refund', jobId);
  }

  return updatedJob;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────
const makeJob = (overrides: Record<string, any> = {}) => ({
  id:        'job_1',
  userId:    'user_test',
  orgId:     'org_abc',
  status:    JobStatus.PENDING,
  parameters: {},
  videoUrl:  undefined,
  audioUrl:  undefined,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// Grab the redis instance the action handlers use (same mock object each time)

beforeEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
describe('push action — success path', () => {
  it('uploads video, marks job COMPLETED, publishes to redis', async () => {
    vi.mocked(storage.uploadFile as any).mockResolvedValue('https://cdn/video.mp4');
    vi.mocked(db.updateJob as any).mockResolvedValue(makeJob({ status: JobStatus.COMPLETED, videoUrl: 'https://cdn/video.mp4' }));

    const result = await pushAction({ jobId: 'job_1', file: '/tmp/video.mp4' });

    expect(result.success).toBe(true);
    expect(db.updateJob).toHaveBeenCalledWith('job_1', {
      status:   JobStatus.COMPLETED,
      videoUrl: 'https://cdn/video.mp4',
      audioUrl: undefined,
    });
    expect(db.addCredits).not.toHaveBeenCalled();
  });

  it('uploads audio too when audio path is provided', async () => {
    vi.mocked(storage.uploadFile as any)
      .mockResolvedValueOnce('https://cdn/video.mp4')
      .mockResolvedValueOnce('https://cdn/audio.mp3');
    vi.mocked(db.updateJob as any).mockResolvedValue(makeJob({ status: JobStatus.COMPLETED }));

    await pushAction({ jobId: 'job_1', file: '/tmp/video.mp4', audio: '/tmp/audio.mp3' });

    expect(storage.uploadFile).toHaveBeenCalledTimes(2);
    expect(db.updateJob).toHaveBeenCalledWith(
      'job_1',
      expect.objectContaining({ audioUrl: 'https://cdn/audio.mp3' })
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('push action — partial upload failure', () => {
  it('cleans up the video when audio upload fails, refunds credit', async () => {
    vi.mocked(storage.uploadFile as any)
      .mockResolvedValueOnce('https://cdn/video.mp4')   // video succeeds
      .mockRejectedValueOnce(new Error('audio upload failed')); // audio fails
    const failedJob = makeJob({ status: JobStatus.FAILED });
    vi.mocked(db.updateJob as any).mockResolvedValue(failedJob);
    vi.mocked(db.addCredits as any).mockResolvedValue(1);

    const result = await pushAction({ jobId: 'job_1', file: '/tmp/video.mp4', audio: '/tmp/audio.mp3' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('audio upload failed');

    // The video that was already uploaded must be deleted
    expect(storage.deleteFile).toHaveBeenCalledWith('https://cdn/video.mp4', undefined);

    // Job should be marked FAILED
    expect(db.updateJob).toHaveBeenCalledWith('job_1', { status: JobStatus.FAILED });

    // Credit must be refunded — user is not charged for a partial failure
    expect(db.addCredits).toHaveBeenCalledWith('org_abc', 1, 'job_failed_refund', 'job_1');
  });

  it('does not call deleteFile when video upload itself fails (nothing was uploaded)', async () => {
    vi.mocked(storage.uploadFile as any).mockRejectedValueOnce(new Error('video upload failed'));
    const failedJob = makeJob({ status: JobStatus.FAILED });
    vi.mocked(db.updateJob as any).mockResolvedValue(failedJob);
    vi.mocked(db.addCredits as any).mockResolvedValue(1);

    const result = await pushAction({ jobId: 'job_1', file: '/tmp/video.mp4', audio: '/tmp/audio.mp3' });

    expect(result.success).toBe(false);
    // Nothing was uploaded so nothing should be cleaned up
    expect(storage.deleteFile).not.toHaveBeenCalled();
    // Still refunds credit
    expect(db.addCredits).toHaveBeenCalledWith('org_abc', 1, 'job_failed_refund', 'job_1');
  });

  it('cleans up both video and audio when db update fails after both uploads succeed', async () => {
    vi.mocked(storage.uploadFile as any)
      .mockResolvedValueOnce('https://cdn/video.mp4')
      .mockResolvedValueOnce('https://cdn/audio.mp3');
    vi.mocked(db.updateJob as any)
      .mockRejectedValueOnce(new Error('db write failed')) // COMPLETED update fails
      .mockResolvedValueOnce(makeJob({ status: JobStatus.FAILED })); // FAILED update succeeds
    vi.mocked(db.addCredits as any).mockResolvedValue(1);

    const result = await pushAction({ jobId: 'job_1', file: '/tmp/video.mp4', audio: '/tmp/audio.mp3' });

    expect(result.success).toBe(false);

    // Both uploaded files must be cleaned up
    expect(storage.deleteFile).toHaveBeenCalledWith('https://cdn/video.mp4', undefined);
    expect(storage.deleteFile).toHaveBeenCalledWith('https://cdn/audio.mp3', undefined);
    expect(storage.deleteFile).toHaveBeenCalledTimes(2);

    // Credit refunded
    expect(db.addCredits).toHaveBeenCalledWith('org_abc', 1, 'job_failed_refund', 'job_1');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('push action — failure path (credit refund)', () => {
  it('marks job FAILED and refunds 1 credit when upload fails', async () => {
    vi.mocked(storage.uploadFile as any).mockRejectedValue(new Error('S3 timeout'));
    const failedJob = makeJob({ status: JobStatus.FAILED });
    vi.mocked(db.updateJob as any).mockResolvedValue(failedJob);
    vi.mocked(db.addCredits as any).mockResolvedValue(1);

    const result = await pushAction({ jobId: 'job_1', file: '/tmp/video.mp4' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('S3 timeout');
    expect(db.updateJob).toHaveBeenCalledWith('job_1', { status: JobStatus.FAILED });
    expect(db.addCredits).toHaveBeenCalledWith('org_abc', 1, 'job_failed_refund', 'job_1');
  });

  it('uses userId as tenantId when orgId is empty', async () => {
    vi.mocked(storage.uploadFile as any).mockRejectedValue(new Error('network error'));
    const failedJob = makeJob({ orgId: '', userId: 'user_solo', status: JobStatus.FAILED });
    vi.mocked(db.updateJob as any).mockResolvedValue(failedJob);
    vi.mocked(db.addCredits as any).mockResolvedValue(1);

    await pushAction({ jobId: 'job_1', file: '/tmp/video.mp4' });

    expect(db.addCredits).toHaveBeenCalledWith('user_solo', 1, 'job_failed_refund', 'job_1');
  });

  it('publishes FAILED status to redis after upload error', async () => {
    vi.mocked(storage.uploadFile as any).mockRejectedValue(new Error('boom'));
    const failedJob = makeJob({ status: JobStatus.FAILED });
    vi.mocked(db.updateJob as any).mockResolvedValue(failedJob);
    vi.mocked(db.addCredits as any).mockResolvedValue(0);

    await pushAction({ jobId: 'job_1', file: '/tmp/video.mp4' });

    // At least one publish call should contain FAILED
    const calls = mockRedisInstance.publish.mock.calls;
    const hasFailedPublish = calls.some(([, msg]: [any, string]) =>
      msg.includes('"FAILED"')
    );
    expect(hasFailedPublish).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('status action — FAILED triggers refund', () => {
  it('refunds 1 credit when status is set to FAILED', async () => {
    const failedJob = makeJob({ status: JobStatus.FAILED });
    vi.mocked(db.updateJob as any).mockResolvedValue(failedJob);
    vi.mocked(db.addCredits as any).mockResolvedValue(1);

    await statusAction({ jobId: 'job_1', status: 'FAILED' });

    expect(db.updateJob).toHaveBeenCalledWith('job_1', { status: JobStatus.FAILED });
    expect(db.addCredits).toHaveBeenCalledWith('org_abc', 1, 'job_failed_refund', 'job_1');
  });

  it('does NOT refund when status is set to COMPLETED', async () => {
    vi.mocked(db.updateJob as any).mockResolvedValue(makeJob({ status: JobStatus.COMPLETED }));
    await statusAction({ jobId: 'job_1', status: 'COMPLETED' });
    expect(db.addCredits).not.toHaveBeenCalled();
  });

  it('does NOT refund when status is set to PROCESSING', async () => {
    vi.mocked(db.updateJob as any).mockResolvedValue(makeJob({ status: JobStatus.PROCESSING }));
    await statusAction({ jobId: 'job_1', status: 'PROCESSING' });
    expect(db.addCredits).not.toHaveBeenCalled();
  });

  it('does NOT refund when status is set to PENDING', async () => {
    vi.mocked(db.updateJob as any).mockResolvedValue(makeJob({ status: JobStatus.PENDING }));
    await statusAction({ jobId: 'job_1', status: 'PENDING' });
    expect(db.addCredits).not.toHaveBeenCalled();
  });
});
