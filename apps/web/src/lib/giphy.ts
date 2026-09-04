export interface GiphyResult {
  id: string
  title: string
  alt: string
  previewUrl: string
  assetUrl: string
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

const httpUrl = (value: unknown): value is string =>
  typeof value === 'string' && /^https?:\/\/\S+$/i.test(value)

export async function searchGiphy(
  query: string,
  apiKey: string,
  request: FetchLike = fetch,
): Promise<GiphyResult[]> {
  const exactQuery = query.trim().slice(0, 50)
  if (!exactQuery) return []
  if (!apiKey.trim()) throw new Error('GIPHY search is not configured.')

  const url = new URL('https://api.giphy.com/v1/gifs/search')
  url.searchParams.set('api_key', apiKey)
  url.searchParams.set('q', exactQuery)
  url.searchParams.set('limit', '12')
  url.searchParams.set('rating', 'g')

  const response = await request(url.toString())
  if (!response.ok) throw new Error(`GIPHY search failed (${response.status}).`)
  const payload = (await response.json()) as { data?: any[] }

  return (payload.data ?? []).flatMap(item => {
    const previewUrl = item?.images?.fixed_width?.webp ?? item?.images?.fixed_width?.url
    const assetUrl = item?.images?.original?.webp ?? item?.images?.original?.url
    if (!item?.id || !httpUrl(previewUrl) || !httpUrl(assetUrl)) return []
    return [
      {
        id: String(item.id),
        title: String(item.title ?? 'GIPHY GIF'),
        alt: String(item.alt_text || item.title || 'Animated GIF'),
        previewUrl,
        assetUrl,
      },
    ]
  })
}
