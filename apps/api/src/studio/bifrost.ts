import type { Model } from '@earendil-works/pi-ai'
import type { ModelRuntime } from '@earendil-works/pi-coding-agent'

export interface BifrostConfig {
  baseUrl: string
  apiKey: string
  /** Optional authentication layer in front of virtual-key governance. */
  authorization?: string
}

/** Server configuration only. A partial configuration must never bypass the gateway. */
export function bifrostConfig(env = process.env): BifrostConfig | null {
  const baseUrl = env.BIFROST_BASE_URL?.trim()
  const apiKey = env.BIFROST_API_KEY?.trim()
  if (!baseUrl && !apiKey) return null
  if (!baseUrl || !apiKey) {
    throw new Error('BIFROST_BASE_URL and BIFROST_API_KEY must both be set')
  }
  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    throw new Error('BIFROST_BASE_URL must be an HTTP(S) gateway root URL')
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    /\/(?:openai|genai|v1|v1beta)\/?$/.test(url.pathname)
  ) {
    throw new Error('BIFROST_BASE_URL must be an HTTP(S) gateway root URL without credentials')
  }
  const authorization = env.BIFROST_AUTH?.trim()
  if (
    authorization &&
    !/^(?:Basic [A-Za-z0-9+/]+={0,2}|Bearer [A-Za-z0-9._~+/-]+={0,2})$/.test(authorization)
  ) {
    throw new Error('BIFROST_AUTH must be a Basic or Bearer authorization header')
  }
  return {
    baseUrl: url.toString().replace(/\/+$/, ''),
    apiKey,
    ...(authorization ? { authorization } : {}),
  }
}

/** Keep Pitch model identities/prices; only the server-side transport changes. */
export async function configureBifrost(
  runtime: ModelRuntime,
  config: BifrostConfig,
): Promise<void> {
  const { streamSimple } = await import('@earendil-works/pi-ai/api/openai-responses')
  for (const provider of ['google', 'openai', 'azure-apim']) {
    const google = provider === 'google'
    const gatewayProvider = google ? 'gemini' : provider
    const baseUrl = `${config.baseUrl}/${google ? 'genai/v1beta' : 'openai'}`
    // Replace model-specific direct URLs and headers as well as provider defaults.
    const models = runtime.getModels(provider).map(model => ({
      ...model,
      api: google ? 'google-generative-ai' : 'openai-responses',
      baseUrl,
      headers: {},
    }))
    runtime.registerProvider(provider, {
      baseUrl,
      // Provider registration starts asynchronous availability checks. Give
      // those the gateway key immediately, before the credential sync below.
      apiKey: config.apiKey,
      api: google ? 'google-generative-ai' : 'openai-responses',
      // authHeader:true overwrites Authorization with the virtual key. When the
      // gateway has separate HTTP auth, it must receive that header instead.
      authHeader: !config.authorization,
      headers: {
        'x-bf-vk': config.apiKey,
        'x-model-provider': gatewayProvider,
        ...(config.authorization ? { Authorization: config.authorization } : {}),
      },
      models,
      ...(!google && {
        streamSimple: (model, context, options) =>
          streamSimple(model as Model<'openai-responses'>, context, {
            ...options,
            // Bifrost uses provider/model on Responses requests, including custom APIM.
            // Do not rename the runtime model: transcripts and billing use Pitch ids.
            onPayload: async (payload, originalModel) => {
              const replacement = await options?.onPayload?.(payload, originalModel)
              const body = (replacement ?? payload) as Record<string, unknown>
              return {
                ...body,
                model: `${gatewayProvider}/${model.id}`,
                // OpenAI permits omitted `type` on easy-input messages, but
                // Bifrost serializes it as an empty type when forwarding them.
                // Leave explicitly typed reasoning/tool items untouched.
                ...(Array.isArray(body.input) && {
                  input: body.input.map(item =>
                    item &&
                    typeof item === 'object' &&
                    item.type === undefined &&
                    ['system', 'developer', 'user', 'assistant'].includes(item.role)
                      ? { ...item, type: 'message' }
                      : item,
                  ),
                }),
              }
            },
          }),
      }),
    })
    // Runtime credentials are memory-only; no keys are written into projects or transcripts.
    await runtime.setRuntimeApiKey(provider, config.apiKey)
  }
}
