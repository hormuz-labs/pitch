import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_STUDIO_MODELS, parseModelSpec } from '../apps/api/src/studio/model-picker.js'

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  profile: vi.fn(async () => ({ gptEnabled: false })),
}))
vi.mock('@earendil-works/pi-coding-agent', () => ({
  ModelRuntime: { create: mocks.create },
  SessionManager: {},
  DefaultResourceLoader: class {},
  createAgentSession: vi.fn(),
}))
vi.mock('@saas/db', () => ({ prisma: { userProfile: { findUnique: mocks.profile } } }))
vi.mock('@saas/shared', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))
vi.mock('../apps/api/src/agent/toolkit.js', () => ({ EXTENSIONS: [], BUILTIN_TOOLS: [] }))
vi.mock('../apps/api/src/projects/assets.js', () => ({ ASSET_PATH: /uploads\// }))
vi.mock('../apps/api/src/projects/styles.js', () => ({ AUTO_KIND: 'auto', findStyle: vi.fn() }))
vi.mock('../apps/api/src/studio/watch.js', () => ({}))
vi.mock('../apps/api/src/studio/history.js', () => ({}))
vi.mock('../apps/api/src/studio/host-actions.js', () => ({}))

function runtime() {
  const configured = new Set<string>()
  const catalog = DEFAULT_STUDIO_MODELS.map(spec => ({
    ...parseModelSpec(spec),
    name: spec,
    api: 'openai-responses',
    reasoning: true,
    input: ['text'],
    contextWindow: 200_000,
    maxTokens: 65_536,
    cost: { input: 2, output: 12, cacheRead: 0.2, cacheWrite: 0 },
  }))
  return {
    getModels: (provider: string) => catalog.filter(model => model.provider === provider),
    getModel: (provider: string, id: string) =>
      catalog.find(model => model.provider === provider && model.id === id),
    getAvailable: async () => catalog.filter(model => configured.has(model.provider)),
    hasConfiguredAuth: (provider: string) => configured.has(provider),
    registerProvider: vi.fn(),
    setRuntimeApiKey: vi.fn(async (provider: string) => {
      configured.add(provider)
    }),
  }
}

beforeEach(() => {
  vi.resetModules()
  for (const name of [
    'BIFROST_BASE_URL',
    'BIFROST_API_KEY',
    'STUDIO_MODELS',
    'STUDIO_MODEL',
    'GEMINI_API_KEY',
    'GOOGLE_GENERATIVE_AI_API_KEY',
    'OPENAI_API_KEY',
    'AZURE_APIM_PRIMARY_KEY',
    'AZURE_APIM_SECONDARY_KEY',
    'AZURE_APIM_API_KEY',
  ])
    vi.stubEnv(name, '')
  mocks.create.mockReset()
  mocks.profile.mockResolvedValue({ gptEnabled: false })
})
afterEach(() => vi.unstubAllEnvs())

describe('studio model activation', () => {
  it('activates gateway models for existing and new accounts without exposing its key', async () => {
    vi.stubEnv('BIFROST_BASE_URL', 'http://bifrost:8080')
    vi.stubEnv('BIFROST_API_KEY', 'vk-private')
    vi.stubEnv('OPENAI_API_KEY', 'direct-openai')
    vi.stubEnv('GEMINI_API_KEY', 'direct-google')
    const r = runtime()
    mocks.create.mockResolvedValue(r)
    const { listStudioModels, studioModelAccess } = await import(
      '../apps/api/src/studio/session.js'
    )
    const models = await listStudioModels('user-1')
    expect(models.map(model => model.spec)).toEqual([...DEFAULT_STUDIO_MODELS])
    expect((await listStudioModels()).map(model => model.spec)).toEqual([...DEFAULT_STUDIO_MODELS])
    expect(studioModelAccess()).toEqual({ bifrostEnabled: true, azureEnabled: false })
    expect(r.setRuntimeApiKey.mock.calls).toEqual([
      ['google', 'vk-private'],
      ['openai', 'vk-private'],
      ['azure-apim', 'vk-private'],
    ])
    expect(JSON.stringify(models)).not.toContain('vk-private')
  })

  it('preserves direct OpenAI opt-in while activating configured Azure automatically', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'direct-google')
    vi.stubEnv('OPENAI_API_KEY', 'direct-openai')
    vi.stubEnv('AZURE_APIM_PRIMARY_KEY', 'direct-azure')
    const r = runtime()
    mocks.create.mockResolvedValue(r)
    const { listStudioModels } = await import('../apps/api/src/studio/session.js')
    const models = await listStudioModels('user-1')
    expect(models.some(model => model.spec.startsWith('azure-apim/'))).toBe(true)
    expect(models.some(model => model.spec.startsWith('openai/'))).toBe(false)
    expect(r.registerProvider).not.toHaveBeenCalled()
    mocks.profile.mockResolvedValue({ gptEnabled: true })
    expect((await listStudioModels('user-1')).some(model => model.spec.startsWith('openai/'))).toBe(
      true,
    )
  })

  it('honors the deployment allowlist in gateway mode', async () => {
    vi.stubEnv('BIFROST_BASE_URL', 'http://bifrost:8080')
    vi.stubEnv('BIFROST_API_KEY', 'vk-private')
    vi.stubEnv('STUDIO_MODELS', 'google/gemini-4-argon,azure-apim/gpt-6-astra')
    mocks.create.mockResolvedValue(runtime())
    const { listStudioModels } = await import('../apps/api/src/studio/session.js')
    expect((await listStudioModels('user-1')).map(model => model.spec)).toEqual([
      'google/gemini-4-argon',
      'azure-apim/gpt-6-astra',
    ])
  })

  it('does not silently initialize direct providers for a partially configured gateway', async () => {
    vi.stubEnv('BIFROST_BASE_URL', 'http://bifrost:8080')
    vi.stubEnv('GEMINI_API_KEY', 'direct-google')
    const { listStudioModels } = await import('../apps/api/src/studio/session.js')
    await expect(listStudioModels('user-1')).rejects.toThrow('must both be set')
    expect(mocks.create).not.toHaveBeenCalled()
  })
})
