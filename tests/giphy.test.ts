import { describe, expect, it, vi } from 'vitest'
import { searchGiphy } from '../apps/studio-web/src/lib/giphy'

describe('searchGiphy', () => {
  it('requests g-rated GIFs with the exact user query and returns animated image renditions', async () => {
    const request = vi.fn(async () =>
      Response.json({
        data: [
          {
            id: 'celebrate-1',
            title: 'Celebration GIF',
            alt_text: 'People celebrating',
            images: {
              fixed_width: { webp: 'https://media.giphy.com/preview.webp' },
              original: { webp: 'https://media.giphy.com/original.webp' },
            },
          },
        ],
      }),
    )

    const results = await searchGiphy('project success', 'web-api-key', request)

    const url = new URL(request.mock.calls[0]?.[0] as string)
    expect(url.pathname).toBe('/v1/gifs/search')
    expect(url.searchParams.get('q')).toBe('project success')
    expect(url.searchParams.get('rating')).toBe('g')
    expect(url.searchParams.get('api_key')).toBe('web-api-key')
    expect(results).toEqual([
      {
        id: 'celebrate-1',
        title: 'Celebration GIF',
        alt: 'People celebrating',
        previewUrl: 'https://media.giphy.com/preview.webp',
        assetUrl: 'https://media.giphy.com/original.webp',
      },
    ])
  })
})
