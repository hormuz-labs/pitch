import { describe, expect, it } from 'vitest'
import {
  advanceSlideshowProgress,
  assertCurrentSlideAnalyzed,
  createSlideshowProgress,
  markCurrentSlideAnalyzed,
  markCurrentSlideNarrated,
} from '../.pi/lib/slideshow-progress'
import {
  expectedSlideshowSlideCount,
  validateSlideshowCoverage,
} from '../apps/api/src/render/utils/slideshow-progress'

describe('slideshow progress guard', () => {
  it('requires Gemini page understanding before slideshow narration', () => {
    const pending = createSlideshowProgress(2)
    expect(() => assertCurrentSlideAnalyzed(pending)).toThrow(
      'Analyze slide 1 of 2 before narrating',
    )

    const analyzed = markCurrentSlideAnalyzed(pending)
    expect(() => assertCurrentSlideAnalyzed(analyzed)).not.toThrow()
    expect(analyzed.analyzedSlides).toEqual([0])
  })

  it('refuses to leave a slide before it has narration', () => {
    const progress = createSlideshowProgress(13)

    expect(() => advanceSlideshowProgress(progress, 1)).toThrow(
      'Narrate slide 1 of 13 before advancing',
    )
  })

  it('allows exactly one narrated page advance and records coverage', () => {
    let progress = markCurrentSlideNarrated(createSlideshowProgress(13))
    progress = advanceSlideshowProgress(progress, 1)

    expect(progress.currentSlide).toBe(1)
    expect(progress.visitedSlides).toEqual([0, 1])
    expect(progress.narratedSlides).toEqual([0])
  })

  it('refuses batched page jumps', () => {
    const progress = markCurrentSlideNarrated(createSlideshowProgress(13))

    expect(() => advanceSlideshowProgress(progress, 2)).toThrow(
      'Advance exactly one slide at a time',
    )
  })

  it('requires every expected page before the worker renders', () => {
    expect(() =>
      validateSlideshowCoverage(
        {
          totalSlides: 13,
          currentSlide: 12,
          visitedSlides: Array.from({ length: 13 }, (_, index) => index),
          analyzedSlides: Array.from({ length: 13 }, (_, index) => index),
          narratedSlides: [0, 1, 2, 3, 4, 8, 10, 12],
        },
        13,
      ),
    ).toThrow('Missing narrated PDF pages: 6, 7, 8, 10, 12')
  })

  it('requires Gemini analysis coverage for every prepared page before rendering', () => {
    expect(() =>
      validateSlideshowCoverage(
        {
          totalSlides: 3,
          currentSlide: 2,
          visitedSlides: [0, 1, 2],
          analyzedSlides: [0, 2],
          narratedSlides: [0, 1, 2],
        },
        3,
      ),
    ).toThrow('Missing analyzed PDF pages: 2')
  })

  it('expects only approved storyboard scenes after a slide is deleted', () => {
    expect(
      expectedSlideshowSlideCount(3, {
        status: 'approved',
        scenes: [
          { pageIndex: 0, enabled: true },
          { pageIndex: 2, enabled: true },
        ],
      }),
    ).toBe(2)
  })
})
