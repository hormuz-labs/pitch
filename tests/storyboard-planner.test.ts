import { describe, expect, it, vi } from 'vitest'
import {
  analyzeStoryboardPage,
  buildStoryboardDraft,
} from '../apps/api/src/render/utils/storyboard-planner'

describe('PDF video storyboard planning', () => {
  it('turns every prepared page into an ordered reviewable scene', async () => {
    const analyzePage = vi.fn(async ({ pageIndex }: { pageIndex: number }) => ({
      title: `Page ${pageIndex + 1}`,
      summary: `Summary for page ${pageIndex + 1}.`,
      confidence: 0.9,
      narrationPoints:
        pageIndex === 0
          ? [
              {
                narration: 'The literacy rate reaches 93 percent.',
                visualQuery: 'the green 93 percent statistic',
                confidence: 0.95,
                rect: { leftPct: 20, topPct: 30, widthPct: 25, heightPct: 20 },
              },
            ]
          : [],
    }))
    const uploadPreview = vi.fn(async ({ pageIndex }: { pageIndex: number }) =>
      Promise.resolve(`https://cdn.example/page-${pageIndex + 1}.png`),
    )

    const storyboard = await buildStoryboardDraft(
      [
        { pageIndex: 0, imagePath: '/tmp/page-1.png' },
        { pageIndex: 1, imagePath: '/tmp/page-2.png' },
      ],
      { analyzePage, uploadPreview },
    )

    expect(storyboard).toMatchObject({
      revision: 1,
      status: 'draft',
      scenes: [
        {
          pageIndex: 0,
          previewUrl: 'https://cdn.example/page-1.png',
          title: 'Page 1',
          screenText: ['The literacy rate reaches 93 percent.'],
          narration: 'The literacy rate reaches 93 percent.',
          emphasis: [
            {
              phrase: 'The literacy rate reaches 93 percent.',
              coordinateSpace: 'page',
              rect: { leftPct: 20, topPct: 30, widthPct: 25, heightPct: 20 },
            },
          ],
        },
        {
          pageIndex: 1,
          previewUrl: 'https://cdn.example/page-2.png',
          narration: 'Summary for page 2.',
          emphasis: [],
        },
      ],
    })
  })

  it('uses rendered pixels and user guidance to draft grounded narration', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    title: 'Results',
                    summary: 'The page compares literacy results.',
                    confidence: 0.91,
                    narration_points: [
                      {
                        narration: 'Global youth literacy reaches 93 percent.',
                        visual_query: 'the green 93 percent statistic',
                        confidence: 0.94,
                        box_2d: [300, 200, 500, 450],
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

    const analysis = await analyzeStoryboardPage({
      apiKey: 'test-key',
      model: 'gemini-test',
      imageBase64: 'rendered-page',
      instructions: 'Focus on education outcomes.',
      fetchImpl: fetchImpl as typeof fetch,
    })

    expect(analysis.narrationPoints[0]).toMatchObject({
      narration: 'Global youth literacy reaches 93 percent.',
      rect: { leftPct: 20, topPct: 30, widthPct: 25, heightPct: 20 },
    })
    const request = JSON.parse(fetchImpl.mock.calls[0]![1].body)
    expect(request.contents[0].parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: expect.stringContaining('Focus on education outcomes.') }),
        expect.objectContaining({ inlineData: { mimeType: 'image/png', data: 'rendered-page' } }),
      ]),
    )
  })

  it('preserves a supplied exact script as the initial review narration', async () => {
    const script =
      'First, introduce the report and its purpose. Then explain the central result. Finally, close with the recommendation.'
    const storyboard = await buildStoryboardDraft(
      [
        { pageIndex: 0, imagePath: '/tmp/page-1.png' },
        { pageIndex: 1, imagePath: '/tmp/page-2.png' },
      ],
      {
        analyzePage: async ({ pageIndex }) => ({
          title: `Page ${pageIndex + 1}`,
          summary: `Generated summary ${pageIndex + 1}`,
          confidence: 0.9,
          narrationPoints: [],
        }),
        uploadPreview: async ({ pageIndex }) => `page-${pageIndex + 1}.png`,
      },
      { script },
    )

    expect(storyboard.scenes.map(scene => scene.narration).join(' ')).toBe(script)
    expect(storyboard.scenes.map(scene => scene.narration).join(' ')).not.toContain(
      'Generated summary',
    )
  })

  it('limits concurrent page analysis to avoid Gemini quota bursts', async () => {
    let active = 0
    let maximumActive = 0
    const pages = Array.from({ length: 7 }, (_, pageIndex) => ({
      pageIndex,
      imagePath: `/tmp/page-${pageIndex + 1}.png`,
    }))

    await buildStoryboardDraft(pages, {
      analyzePage: async ({ pageIndex }) => {
        active += 1
        maximumActive = Math.max(maximumActive, active)
        await new Promise(resolve => setTimeout(resolve, 5))
        active -= 1
        return {
          title: `Page ${pageIndex + 1}`,
          summary: `Summary ${pageIndex + 1}`,
          confidence: 0.9,
          narrationPoints: [],
        }
      },
      uploadPreview: async ({ pageIndex }) => `page-${pageIndex + 1}.png`,
    })

    expect(maximumActive).toBeLessThanOrEqual(3)
  })
})
