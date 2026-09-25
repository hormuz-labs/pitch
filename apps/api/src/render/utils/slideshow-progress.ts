import type { SlideshowProgress } from '../../../../../.pi/lib/slideshow-progress.ts'

// flows/demo-video imports the type from here.
export type { SlideshowProgress }

interface StoryboardCoverageLike {
  status: string
  scenes: Array<{ enabled: boolean }>
}

export function expectedSlideshowSlideCount(
  preparedSlideCount: number,
  storyboard?: StoryboardCoverageLike,
): number {
  if (storyboard?.status !== 'approved') return preparedSlideCount
  return storyboard.scenes.filter(scene => scene.enabled).length
}

export function validateSlideshowCoverage(
  progress: SlideshowProgress,
  expectedSlides: number,
): void {
  if (progress.totalSlides !== expectedSlides) {
    throw new Error(
      `Prepared PDF has ${expectedSlides} pages, but the slideshow contains ${progress.totalSlides}.`,
    )
  }

  const missingVisited: number[] = []
  const missingAnalyzed: number[] = []
  const missingNarrated: number[] = []
  for (let index = 0; index < expectedSlides; index += 1) {
    if (!progress.visitedSlides.includes(index)) missingVisited.push(index + 1)
    if (!(progress.analyzedSlides ?? []).includes(index)) missingAnalyzed.push(index + 1)
    if (!progress.narratedSlides.includes(index)) missingNarrated.push(index + 1)
  }

  if (missingVisited.length > 0) {
    throw new Error(`Missing displayed PDF pages: ${missingVisited.join(', ')}`)
  }
  if (missingAnalyzed.length > 0) {
    throw new Error(`Missing analyzed PDF pages: ${missingAnalyzed.join(', ')}`)
  }
  if (missingNarrated.length > 0) {
    throw new Error(`Missing narrated PDF pages: ${missingNarrated.join(', ')}`)
  }
}
