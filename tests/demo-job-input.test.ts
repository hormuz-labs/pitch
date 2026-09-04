import { describe, expect, it } from 'vitest'
import { buildDemoJobInput } from '../apps/api/src/render/utils/demo-job-input'

describe('buildDemoJobInput', () => {
  it('keeps prepared assets on the standard demo-generator without inventing an empty URL instruction', () => {
    const input = buildDemoJobInput({
      hasPreparedAssets: true,
      assetCount: 2,
      url: '',
      instructions: 'Explain the quarterly results.',
      script: '',
    })

    expect(input.agent).toBe('demo-generator')
    expect(input.prompt).toContain('2 prepared asset(s)')
    expect(input.prompt).toContain('Display every prepared page in manifest order at least once')
    expect(input.prompt).toContain('Never jump over pages')
    expect(input.prompt).toContain('Shorten narration instead of skipping a page')
    expect(input.prompt).toContain('demo_analyze_slide')
    expect(input.prompt).toMatch(/every page.*before narrat/i)
    expect(input.prompt).toMatch(/Gemini.*rendered slide pixels/i)
    expect(input.prompt).toMatch(/OCR.*fallback/i)
    expect(input.prompt).toContain('Explain the quarterly results.')
    expect(input.prompt).not.toContain('Go to .')
  })

  it('makes the approved storyboard the exact source of truth for rendering', () => {
    const input = buildDemoJobInput({
      hasPreparedAssets: true,
      assetCount: 1,
      storyboard: {
        revision: 3,
        approvedRevision: 3,
        status: 'approved',
        transition: 'fade',
        scenes: [
          {
            id: 'scene-1',
            pageIndex: 0,
            previewUrl: 'https://cdn.example/page-1.png',
            enabled: true,
            title: 'Results',
            screenText: ['93 percent'],
            narration: 'The approved result reaches 93 percent.',
            emphasis: [
              {
                phrase: '93 percent',
                rect: { leftPct: 20, topPct: 30, widthPct: 25, heightPct: 20 },
                coordinateSpace: 'page',
                style: 'pulse',
                zoom: 1.7,
              },
            ],
            overlays: [
              {
                kind: 'callout',
                rect: { leftPct: 55, topPct: 20, widthPct: 18, heightPct: 14 },
                text: 'Key result',
                shape: 'box',
                color: 'blue',
              },
            ],
            estimatedDurationSec: 3,
          },
        ],
      },
    })

    expect(input.prompt).toContain('APPROVED STORYBOARD REVISION 3')
    expect(input.prompt).toContain('The approved result reaches 93 percent.')
    expect(input.prompt).toContain('"leftPct":20')
    expect(input.prompt).toContain('"slideshowTransition":"fade"')
    expect(input.prompt).toContain('"overlays":[{"kind":"callout"')
    expect(input.prompt).toMatch(/persistent overlays.*slideshow/i)
    expect(input.prompt).not.toContain('"zoom":1.7')
    expect(input.prompt).toMatch(/camera.*automatic.*bounding box/i)
    expect(input.prompt).toMatch(/Do not rewrite, rephrase, omit, or add narration/i)
    expect(input.prompt).toMatch(/display only the pages listed in the approved storyboard/i)
    expect(input.prompt).toMatch(/deleted pages must not be displayed, analyzed, or narrated/i)
    expect(input.prompt).not.toContain(
      'Display every prepared page in manifest order at least once',
    )
  })
})
