import { describe, expect, it, vi } from 'vitest'
import {
  analyzeVisualSlide,
  box2dToViewportRect,
  groundVisualRegion,
  parseGroundingResponse,
} from '../.opencode/lib/visual-grounding'

describe('analyzeVisualSlide', () => {
  it('returns narration-ready facts and boxes from rendered pixels without extracted text', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    title: 'Education outcomes',
                    summary: 'A comparison of reading performance and literacy.',
                    confidence: 0.94,
                    narration_points: [
                      {
                        narration: 'Girls lead reading performance by 24 PISA points.',
                        visual_query: 'the complete +24 PISA reading points statistic',
                        confidence: 0.91,
                        box_2d: [210, 430, 360, 620],
                      },
                    ],
                  }),
                },
              ],
            },
          },
        ],
      }),
    })

    const result = await analyzeVisualSlide({
      apiKey: 'test-key',
      model: 'gemini-test',
      imageBase64: 'aW1hZ2U=',
      fetchImpl,
    })

    expect(result).toEqual({
      title: 'Education outcomes',
      summary: 'A comparison of reading performance and literacy.',
      confidence: 0.94,
      narrationPoints: [
        {
          narration: 'Girls lead reading performance by 24 PISA points.',
          visualQuery: 'the complete +24 PISA reading points statistic',
          confidence: 0.91,
          rect: { leftPct: 43, topPct: 21, widthPct: 19, heightPct: 15 },
        },
      ],
    })
    const [, request] = fetchImpl.mock.calls[0]
    const body = JSON.parse(request.body)
    expect(body.contents[0].parts[1].inlineData).toEqual({
      mimeType: 'image/png',
      data: 'aW1hZ2U=',
    })
    expect(body.contents[0].parts[0].text).toMatch(/rendered pixels/i)
    expect(body.contents[0].parts[0].text).toMatch(/no machine-readable text/i)
    expect(body.generationConfig.responseSchema.properties.narration_points).toBeDefined()
    expect(body.tools).toEqual([{ codeExecution: {} }])
  })

  it('excludes low-confidence narration points instead of highlighting a guess', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    title: 'Scanned chart',
                    summary: 'A chart is visible, but some labels are unclear.',
                    confidence: 0.72,
                    narration_points: [
                      {
                        narration: 'This might show 75 percent growth.',
                        visual_query: 'the possible 75 percent label',
                        confidence: 0.32,
                        box_2d: [100, 100, 200, 300],
                      },
                      {
                        narration: 'The blue series finishes above the orange series.',
                        visual_query: 'the final blue and orange data points',
                        confidence: 0.88,
                        box_2d: [300, 500, 700, 900],
                      },
                    ],
                  }),
                },
              ],
            },
          },
        ],
      }),
    })

    const result = await analyzeVisualSlide({
      apiKey: 'test-key',
      model: 'gemini-test',
      imageBase64: 'aW1hZ2U=',
      fetchImpl,
    })

    expect(result.narrationPoints.map(point => point.narration)).toEqual([
      'The blue series finishes above the orange series.',
    ])
  })

  it('rejects an unusable page analysis instead of returning empty narration', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '{}' }] } }],
      }),
    })

    await expect(
      analyzeVisualSlide({
        apiKey: 'test-key',
        model: 'gemini-test',
        imageBase64: 'aW1hZ2U=',
        fetchImpl,
      }),
    ).rejects.toThrow('no usable summary')
  })
})

describe('box2dToViewportRect', () => {
  it('normalizes, orders, and clamps Gemini box_2d coordinates', () => {
    expect(box2dToViewportRect([500, 1100, 100, 200])).toEqual({
      leftPct: 20,
      topPct: 10,
      widthPct: 80,
      heightPct: 40,
    })
  })
})

describe('parseGroundingResponse', () => {
  it('returns only validated matches with a usable viewport rectangle', () => {
    const result = parseGroundingResponse({
      candidates: [
        {
          content: {
            parts: [
              {
                text: '```json\n{"found":true,"label":"Revenue chart","confidence":0.86,"box_2d":[100,200,500,800]}\n```',
              },
            ],
          },
        },
      ],
    })

    expect(result).toEqual({
      found: true,
      label: 'Revenue chart',
      confidence: 0.86,
      rect: { leftPct: 20, topPct: 10, widthPct: 60, heightPct: 40 },
    })
  })
})

describe('groundVisualRegion', () => {
  it('calls Gemini at the system boundary with an image and structured box schema', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: '{"found":true,"label":"Total","confidence":0.9,"box_2d":[100,100,200,300]}',
                },
              ],
            },
          },
        ],
      }),
    })

    const result = await groundVisualRegion({
      apiKey: 'test-key',
      model: 'gemini-test',
      imageBase64: 'aW1hZ2U=',
      query: 'the total revenue number',
      fetchImpl,
    })

    expect(result.found).toBe(true)
    expect(fetchImpl).toHaveBeenCalledOnce()
    const [url, request] = fetchImpl.mock.calls[0]
    expect(url).toContain('/models/gemini-test:generateContent')
    const body = JSON.parse(request.body)
    expect(body.contents[0].parts[1].inlineData).toEqual({
      mimeType: 'image/png',
      data: 'aW1hZ2U=',
    })
    expect(body.generationConfig.responseMimeType).toBe('application/json')
    expect(body.generationConfig.responseSchema.properties.box_2d).toBeDefined()
    expect(body.tools).toEqual([{ codeExecution: {} }])
    expect(body.contents[0].parts[0].text).toMatch(/rendered pixels/i)
    expect(body.contents[0].parts[0].text).toMatch(/machine-readable text/i)
    expect(body.contents[0].parts[0].text).toMatch(/crop|zoom/i)
  })
})
