import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createProject: vi.fn(),
  getRow: vi.fn(),
  listProjects: vi.fn(),
  currentOwner: vi.fn(),
  withOwner: vi.fn(),
  uploadFile: vi.fn(),
  deleteFile: vi.fn(),
}))

vi.mock('@saas/shared', () => ({
  createLogger: () => ({ warn: vi.fn() }),
}))
vi.mock('@saas/storage', () => ({
  uploadFile: mocks.uploadFile,
  deleteFile: mocks.deleteFile,
}))
vi.mock('../apps/api/src/projects/service.js', () => ({
  createProject: mocks.createProject,
  getProject: vi.fn(),
  getRow: mocks.getRow,
  listProjects: mocks.listProjects,
  promptProject: vi.fn(),
}))
vi.mock('../apps/api/src/worker/client.js', () => ({
  currentOwner: mocks.currentOwner,
  withOwner: mocks.withOwner,
}))
vi.mock('../apps/api/src/projects/export.js', () => ({
  IDLE_EXPORT: { running: false, stage: 'idle' },
}))
vi.mock('../apps/api/src/projects/usage.js', () => ({
  CREDIT_USD: 0.0025,
  COMPUTE_USD_PER_SEC: 0.002,
  PROVIDED_SKILL_MODEL_MULTIPLIER: 250,
}))

const { createFromApi, exportFromApi, exportStatusFromApi, listFromApi, pricing } = await import(
  '../apps/api/src/lib/public-api.js'
)

const project = {
  id: 'p1',
  title: 'Project',
  status: 'empty',
  busy: false,
  prompt: '',
  options: {},
  outputs: [],
  thumbnailUrl: null,
  isPublic: false,
  shareSlug: null,
  lastError: null,
  createdAt: 'now',
  updatedAt: 'now',
}

describe('shared public API', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns a pre-limit total and no internal flow field', async () => {
    mocks.listProjects.mockResolvedValue([
      { ...project, id: 'p1', flow: 'studio' },
      { ...project, id: 'p2', flow: 'launch-video' },
    ])
    const result = await listFromApi('user_1', 1)
    expect(result.total).toBe(2)
    expect(result.data).toHaveLength(1)
    expect(result.data[0]).not.toHaveProperty('flow')
    expect(mocks.listProjects).toHaveBeenCalledWith('user_1')
  })

  it('routes export start and status through the owning worker', async () => {
    const owner = { startExport: vi.fn(), exportStatus: vi.fn() }
    mocks.getRow.mockResolvedValue({ id: 'p1' })
    mocks.withOwner.mockImplementation(async (_id, fn) => fn(owner))
    mocks.currentOwner.mockResolvedValue(owner)
    owner.startExport.mockResolvedValue({ stage: 'starting' })
    owner.exportStatus.mockResolvedValue({ stage: 'encoding' })

    await expect(exportFromApi('user_1', 'p1', { res: '4k' })).resolves.toEqual({
      stage: 'starting',
    })
    await expect(exportStatusFromApi('user_1', 'p1')).resolves.toEqual({ stage: 'encoding' })
    expect(owner.startExport).toHaveBeenCalledWith('p1', { res: '4k' })
    expect(owner.exportStatus).toHaveBeenCalledWith('p1')
  })

  it('removes staged objects when project creation fails', async () => {
    mocks.uploadFile.mockResolvedValue('https://storage/file.pdf')
    mocks.createProject.mockRejectedValue(new Error('no worker'))
    await expect(
      createFromApi('user_1', {
        prompt: 'Use this',
        uploads: [{ fileBase64: Buffer.from('pdf').toString('base64'), fileName: 'file.pdf' }],
      }),
    ).rejects.toThrow('no worker')
    expect(mocks.deleteFile).toHaveBeenCalledWith('https://storage/file.pdf')
  })

  it('discloses provided-skill model pricing separately from compute', () => {
    expect(pricing()).toMatchObject({
      providedSkillModelMultiplier: 250,
      computeUsdPerSecond: 0.002,
    })
    expect(pricing().explanation).toContain('host compute and provider charges are not multiplied')
  })
})
