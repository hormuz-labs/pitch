import { describe, expect, it, vi } from 'vitest'
import { MEDIA_REVIEW_MAX_BYTES, reviewMedia } from '../.pi/lib/media-review.ts'

const report = {
  summary: 'The OS sequence is readable only at the heading level.',
  strengths: ['The same viewport maintains orientation.'],
  findings: [
    {
      start: 6,
      end: 11.8,
      priority: 'high',
      observation: 'Four dense panels cycle within 5.8 seconds.',
      suggestion: 'Remove supporting logs and badges, then extend the remaining reading holds.',
      confidence: 0.9,
    },
  ],
  limitations: ['Fast transition details require targeted frame review.'],
}
const options = {
  apiKey: 'test-key',
  model: 'review-model',
  data: Buffer.from('media bytes'),
  mimeType: 'video/mp4',
  purpose: 'film' as const,
  brief: 'Music-only Cua film, approximately 15s. Show cross-platform capability.',
  duration: 15,
}
const response = (value: unknown, finishReason = 'STOP') =>
  new Response(
    JSON.stringify({
      candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(value) }] } }],
    }),
  )

describe('perceptual media review', () => {
  it('sends actual media and the brief, returning timestamped evidence without a pass score', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(report))
    expect(await reviewMedia({ ...options, fetchImpl })).toEqual(report)
    const [url, request] = fetchImpl.mock.calls[0]
    expect(url).not.toContain(options.apiKey)
    expect(request.headers['x-goog-api-key']).toBe(options.apiKey)
    const body = JSON.parse(request.body)
    expect(body.contents[0].parts[1].inlineData).toEqual({
      mimeType: 'video/mp4',
      data: options.data.toString('base64'),
    })
    expect(body.contents[0].parts[0].text).toContain(options.brief)
    expect(body.systemInstruction.parts[0].text).toContain('EVERY internal text state')
    expect(body.systemInstruction.parts[0].text).toContain(
      'shorter or moderately longer is acceptable',
    )
  })

  it('uses the listening task for soundtrack candidates', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({ ...report, findings: [] }))
    await reviewMedia({ ...options, purpose: 'music', mimeType: 'audio/mpeg', fetchImpl })
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(body.systemInstruction.parts[0].text).toContain('Listen to this candidate soundtrack')
    expect(body.contents[0].parts[1].inlineData.mimeType).toBe('audio/mpeg')
  })

  it.each([
    null,
    { ...report, summary: '' },
    { ...report, findings: [{ ...report.findings[0], end: 40 }] },
    { ...report, findings: [{ ...report.findings[0], start: -1 }] },
    { ...report, findings: [{ ...report.findings[0], confidence: 2 }] },
    { ...report, findings: [{ ...report.findings[0], priority: 'perfect' }] },
  ])('rejects incomplete or invalid evidence instead of returning success', async value => {
    await expect(
      reviewMedia({ ...options, fetchImpl: vi.fn().mockResolvedValue(response(value)) }),
    ).rejects.toThrow('no review was completed')
  })

  it('rejects truncated output even if the JSON happens to parse', async () => {
    await expect(
      reviewMedia({
        ...options,
        fetchImpl: vi.fn().mockResolvedValue(response(report, 'MAX_TOKENS')),
      }),
    ).rejects.toThrow('did not finish')
  })

  it('does not reflect provider errors containing secrets', async () => {
    await expect(
      reviewMedia({
        ...options,
        fetchImpl: vi.fn().mockResolvedValue(new Response('secret provider body', { status: 429 })),
      }),
    ).rejects.toThrow('HTTP 429')
  })

  it('rejects oversized media before sending a request', async () => {
    const fetchImpl = vi.fn()
    await expect(
      reviewMedia({ ...options, data: Buffer.alloc(MEDIA_REVIEW_MAX_BYTES + 1), fetchImpl }),
    ).rejects.toThrow('at most 14 MiB')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('propagates cancellation to the provider request', async () => {
    const controller = new AbortController()
    const fetchImpl = vi.fn().mockResolvedValue(response(report))
    await reviewMedia({ ...options, signal: controller.signal, fetchImpl })
    controller.abort()
    expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(true)
  })
})
