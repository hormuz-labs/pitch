import { PitchApiError, type PitchBotApi } from './handler.js'

type Fetch = typeof fetch

export function createPitchApi(
  apiUrl: string,
  serviceToken: string,
  request: Fetch = fetch,
): PitchBotApi {
  const baseUrl = apiUrl.replace(/\/$/, '')

  const call = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const response = await request(`${baseUrl}/internal/discord${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${serviceToken}`,
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    })
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    if (!response.ok)
      throw new PitchApiError(response.status, body.error ?? 'Pitch API request failed')
    return body as T
  }

  return {
    createVideo: (discordUserId, prompt) =>
      call('/projects', {
        method: 'POST',
        body: JSON.stringify({ discordUserId, prompt }),
      }),
    getProject: (discordUserId, projectId) =>
      call(
        `/projects/${encodeURIComponent(projectId)}?discordUserId=${encodeURIComponent(discordUserId)}`,
      ),
  }
}
