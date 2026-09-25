import { describe, expect, it } from 'vitest'
import { storyboardContract } from '../apps/api/src/render/utils/storyboard-contract'

describe('storyboardContract', () => {
  it('hands the approved scenes to capture and camera work to shared video editing', () => {
    const contract = storyboardContract({
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
        {
          id: 'scene-2',
          pageIndex: 1,
          previewUrl: 'https://cdn.example/page-2.png',
          enabled: false,
          title: 'Deleted',
          screenText: [],
          narration: 'This page was removed.',
          emphasis: [],
          estimatedDurationSec: 3,
        },
      ],
    } as any)

    expect(contract).toMatch(/^APPROVED STORYBOARD REVISION 3/)
    expect(contract).toContain('The approved result reaches 93 percent.')
    expect(contract).not.toContain('This page was removed.')
    expect(contract).toContain('"leftPct":20')
    expect(contract).toContain('"slideshowTransition":"fade"')
    expect(contract).toContain('"overlays":[{"kind":"callout"')
    expect(contract).not.toContain('"zoom":1.7')
    expect(contract).toMatch(/persistent overlays.*slideshow/i)
    expect(contract).toMatch(/camera intentions.*shared video-editing skill after recording/i)
    expect(contract).toMatch(/Do not rewrite, rephrase, omit, or add narration/i)
    expect(contract).toMatch(/deleted pages must not be displayed, analyzed, or narrated/i)
  })
})
