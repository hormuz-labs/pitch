/** Server-only ElevenLabs credentials and the account's playable voice catalog. */
export function elevenLabsKey(): string {
  const key = process.env.ELEVEN_LABS_KEY || process.env.ELEVENLABS_API_KEY
  if (!key) throw new Error('ElevenLabs needs ELEVEN_LABS_KEY in the API environment')
  return key
}

export interface StudioVoice {
  id: string
  name: string
  description: string
  labels: Record<string, string>
  previewUrl: string | null
}

interface VoicePage {
  voices: StudioVoice[]
  nextCursor: string | null
  source: 'account' | 'default'
}

const cache = new Map<string, { expires: number; page: Promise<VoicePage> }>()
let cachedKey = ''

export function listElevenLabsVoices(search = '', cursor = ''): Promise<VoicePage> {
  const key = elevenLabsKey()
  if (cachedKey !== key) {
    cache.clear()
    cachedKey = key
  }
  const query = new URLSearchParams({ page_size: '40', sort: 'name', sort_direction: 'asc' })
  if (search.trim()) query.set('search', search.trim())
  if (cursor) query.set('next_page_token', cursor)
  const cacheId = query.toString()
  const existing = cache.get(cacheId)
  if (existing && existing.expires > Date.now()) return existing.page

  const page = (async (): Promise<VoicePage> => {
    const response = await fetch(`https://api.elevenlabs.io/v2/voices?${query}`, {
      headers: { 'xi-api-key': key },
      signal: AbortSignal.timeout(15_000),
    })
    let body = await response.json()
    let source: VoicePage['source'] = 'account'
    if (!response.ok) {
      // The public catalog is explicitly unauthenticated. Restricted generation
      // keys can still offer these stock voices without reading account data.
      if (response.status !== 401 || body.detail?.status !== 'missing_permissions') {
        throw new Error(`ElevenLabs voice catalog returned HTTP ${response.status}`)
      }
      const defaults = await fetch('https://api.elevenlabs.io/v1/voices', {
        signal: AbortSignal.timeout(15_000),
      })
      if (!defaults.ok)
        throw new Error(`ElevenLabs default catalog returned HTTP ${defaults.status}`)
      body = await defaults.json()
      source = 'default'
    }
    if (!Array.isArray(body.voices)) throw new Error('ElevenLabs returned an invalid voice catalog')
    return {
      source,
      voices: body.voices
        .filter(
          (voice: any) => typeof voice.voice_id === 'string' && typeof voice.name === 'string',
        )
        .map((voice: any) => ({
          id: voice.voice_id,
          name: voice.name,
          description: typeof voice.description === 'string' ? voice.description : '',
          labels: Object.fromEntries(
            Object.entries(voice.labels ?? {}).filter(
              (entry): entry is [string, string] => typeof entry[1] === 'string',
            ),
          ),
          previewUrl:
            typeof voice.preview_url === 'string' && voice.preview_url.startsWith('https://')
              ? voice.preview_url
              : null,
        }))
        .filter(
          (voice: StudioVoice) =>
            source === 'account' ||
            `${voice.name} ${voice.description} ${Object.values(voice.labels).join(' ')}`
              .toLowerCase()
              .includes(search.trim().toLowerCase()),
        )
        .sort((a: StudioVoice, b: StudioVoice) => a.name.localeCompare(b.name)),
      nextCursor:
        body.has_more && typeof body.next_page_token === 'string' ? body.next_page_token : null,
    }
  })()
  // Bound the shared catalog cache, including distinct searches and in-flight requests.
  if (cache.size >= 100) cache.delete(cache.keys().next().value!)
  cache.set(cacheId, { expires: Date.now() + 5 * 60_000, page })
  void page.catch(() => {
    if (cache.get(cacheId)?.page === page) cache.delete(cacheId)
  })
  return page
}
