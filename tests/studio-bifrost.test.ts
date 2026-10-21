import { createServer, type Server } from 'node:http'
import path from 'node:path'
import { InMemoryCredentialStore } from '@earendil-works/pi-ai'
import { ModelRuntime } from '@earendil-works/pi-coding-agent'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bifrostConfig, configureBifrost } from '../apps/api/src/studio/bifrost.js'

afterEach(() => vi.unstubAllEnvs())

describe('Bifrost configuration', () => {
  it('is opt-in and normalizes the gateway root', () => {
    expect(bifrostConfig({})).toBeNull()
    expect(bifrostConfig({ BIFROST_BASE_URL: ' ', BIFROST_API_KEY: ' ' })).toBeNull()
    expect(
      bifrostConfig({ BIFROST_BASE_URL: ' http://bifrost:8080/ ', BIFROST_API_KEY: ' vk-test ' }),
    ).toEqual({ baseUrl: 'http://bifrost:8080', apiKey: 'vk-test' })
  })

  it('accepts separate gateway authentication without treating metadata as credentials', () => {
    expect(
      bifrostConfig({
        BIFROST_BASE_URL: 'http://bifrost:8080',
        BIFROST_API_KEY: 'vk-test',
        BIFROST_AUTH: ' Basic dGVzdDp0ZXN0 ',
        BIFROST_VIRTUAL_KEY_ID: 'metadata-only',
      }),
    ).toEqual({
      baseUrl: 'http://bifrost:8080',
      apiKey: 'vk-test',
      authorization: 'Basic dGVzdDp0ZXN0',
    })
  })

  it.each(['Basic secret\r\nx-leak: secret', 'not-auth-secret', 'Basic', 'Bearer secret value'])(
    'rejects malformed authentication without exposing it %#',
    auth => {
      expect(() =>
        bifrostConfig({
          BIFROST_BASE_URL: 'http://bifrost:8080',
          BIFROST_API_KEY: 'vk-test',
          BIFROST_AUTH: auth,
        }),
      ).toThrow('BIFROST_AUTH must be a Basic or Bearer authorization header')
    },
  )

  it.each([
    { BIFROST_BASE_URL: 'http://localhost:8080' },
    { BIFROST_API_KEY: 'vk-test' },
    { BIFROST_BASE_URL: 'not a URL', BIFROST_API_KEY: 'vk-test' },
    { BIFROST_BASE_URL: 'file:///private', BIFROST_API_KEY: 'vk-test' },
    { BIFROST_BASE_URL: 'https://user:secret@gateway.test', BIFROST_API_KEY: 'vk-test' },
    { BIFROST_BASE_URL: 'https://gateway.test?key=secret', BIFROST_API_KEY: 'vk-test' },
    { BIFROST_BASE_URL: 'https://gateway.test#secret', BIFROST_API_KEY: 'vk-test' },
    { BIFROST_BASE_URL: 'http://localhost:8080/openai', BIFROST_API_KEY: 'vk-test' },
    { BIFROST_BASE_URL: 'http://localhost:8080/genai/v1beta', BIFROST_API_KEY: 'vk-test' },
  ])('fails closed on invalid/partial configuration %#', env => {
    expect(() => bifrostConfig(env)).toThrow('BIFROST_')
    try {
      bifrostConfig(env)
    } catch (error) {
      expect(String(error)).not.toContain('secret')
      expect(String(error)).not.toContain('vk-test')
    }
  })
})

async function runtime() {
  return ModelRuntime.create({
    modelsPath: path.resolve('.pi/models.json'),
    credentials: new InMemoryCredentialStore(),
    refreshOnCreate: false,
  })
}

describe('Bifrost runtime transport', () => {
  it('finishes initialization with every provider available across repeated runtimes', async () => {
    for (let attempt = 0; attempt < 6; attempt++) {
      const r = await runtime()
      await configureBifrost(r, { baseUrl: 'http://bifrost:8080', apiKey: 'vk-test' })
      const available = await r.getAvailable()
      for (const provider of ['google', 'openai', 'azure-apim']) {
        expect(r.hasConfiguredAuth(provider)).toBe(true)
        expect(available.some(model => model.provider === provider)).toBe(true)
      }
    }
  })

  it('routes every provider through the gateway while preserving prices and identities', async () => {
    const r = await runtime()
    const original = r.getModel('azure-apim', 'gpt-6-astra')!
    await configureBifrost(r, { baseUrl: 'http://bifrost:8080', apiKey: 'vk-test' })
    for (const provider of ['google', 'openai', 'azure-apim']) {
      expect(r.getRegisteredProviderConfig(provider)?.apiKey).toBe('vk-test')
      expect(r.hasConfiguredAuth(provider)).toBe(true)
      for (const model of r.getModels(provider)) {
        expect(model.baseUrl).toBe(
          `http://bifrost:8080/${provider === 'google' ? 'genai/v1beta' : 'openai'}`,
        )
        expect(model.provider).toBe(provider)
      }
    }
    const proxied = r.getModel('azure-apim', 'gpt-6-astra')!
    expect(proxied.id).toBe(original.id)
    expect(proxied.cost).toEqual(original.cost)
    expect(proxied.contextWindow).toBe(original.contextWindow)
    expect(r.getModel('google', 'gemini-4-argon')?.thinkingLevelMap).toEqual({
      off: null,
      low: 'low',
      medium: 'medium',
      high: 'high',
    })
    const auth = await r.getAuth(proxied)
    expect(auth?.auth.apiKey).toBe('vk-test')
    expect(auth?.auth.headers).toMatchObject({
      Authorization: 'Bearer vk-test',
      'x-bf-vk': 'vk-test',
      'x-model-provider': 'azure-apim',
    })
  })

  it.each([undefined, 'Basic dGVzdDp0ZXN0'])(
    'sends SDK streams with separate gateway authentication %s',
    async authorization => {
      vi.stubEnv('GEMINI_API_KEY', 'direct-google-secret')
      vi.stubEnv('OPENAI_API_KEY', 'direct-openai-secret')
      const requests: Array<{ url: string; headers: unknown; body: any }> = []
      const server: Server = createServer(async (req, res) => {
        let text = ''
        for await (const chunk of req) text += chunk
        const body = JSON.parse(text)
        requests.push({ url: req.url!, headers: req.headers, body })
        res.writeHead(200, { 'Content-Type': 'text/event-stream' })
        if (req.url?.startsWith('/genai/')) {
          res.end(
            `data: ${JSON.stringify({
              candidates: [
                { content: { role: 'model', parts: [{ text: 'Hello' }] }, finishReason: 'STOP' },
              ],
              usageMetadata: {
                promptTokenCount: 20,
                candidatesTokenCount: 10,
                totalTokenCount: 30,
              },
            })}\n\n`,
          )
        } else {
          const response = {
            id: 'response-test',
            status: 'completed',
            model: body.model,
            output: [
              {
                type: 'message',
                id: 'message-test',
                role: 'assistant',
                content: [{ type: 'output_text', text: 'Hello', annotations: [] }],
              },
            ],
            usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 },
          }
          res.end(
            `event: response.completed\ndata: ${JSON.stringify({ type: 'response.completed', response })}\n\n`,
          )
        }
      })
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
      try {
        const port = (server.address() as { port: number }).port
        const r = await runtime()
        await configureBifrost(r, {
          baseUrl: `http://127.0.0.1:${port}`,
          apiKey: 'vk-test',
          authorization,
        })
        for (const [provider, id] of [
          ['google', 'gemini-4-argon'],
          ['openai', 'gpt-5.4'],
          ['azure-apim', 'gpt-6-astra'],
        ]) {
          const model = r.getModel(provider, id)!
          const message = await r
            .streamSimple(model, {
              systemPrompt: 'Be helpful',
              messages: [{ role: 'user', content: 'Hello', timestamp: Date.now() }],
              tools: [
                {
                  name: 'read',
                  description: 'Read a file',
                  parameters: {
                    type: 'object',
                    properties: { path: { type: 'string' } },
                    required: ['path'],
                  },
                },
              ],
            })
            .result()
          expect(message.stopReason).not.toBe('error')
          expect(message.model).toBe(id)
          expect(message.provider).toBe(provider)
          expect(message.usage.input).toBe(20)
          expect(message.usage.output).toBe(10)
          expect(message.usage.cost.total).toBeGreaterThan(0)
        }
        expect(requests.map(req => req.url)).toEqual([
          '/genai/v1beta/models/gemini-4-argon:streamGenerateContent?alt=sse',
          '/openai/responses',
          '/openai/responses',
        ])
        expect(requests[1].body.model).toBe('openai/gpt-5.4')
        expect(requests[2].body.model).toBe('azure-apim/gpt-6-astra')
        // OpenAI accepts implicit message types; Bifrost's translation does not.
        // Exercise the actual SDK's developer and user message serialization.
        for (const req of requests.slice(1)) {
          expect(req.body.input).toEqual([
            { type: 'message', role: 'developer', content: 'Be helpful' },
            {
              type: 'message',
              role: 'user',
              content: [{ type: 'input_text', text: 'Hello' }],
            },
          ])
        }
        for (const req of requests) {
          expect(req.headers).toMatchObject({
            'x-bf-vk': 'vk-test',
            authorization: authorization ?? 'Bearer vk-test',
          })
          expect(JSON.stringify(req)).not.toContain('direct-google-secret')
          expect(JSON.stringify(req)).not.toContain('direct-openai-secret')
          expect(req.body).toHaveProperty('tools')
        }
      } finally {
        server.closeAllConnections()
        await new Promise<void>(resolve => server.close(() => resolve()))
      }
    },
  )
})
