export interface SlideshowProgress {
  totalSlides: number
  currentSlide: number
  visitedSlides: number[]
  analyzedSlides: number[]
  narratedSlides: number[]
}

function addUnique(values: number[], value: number): number[] {
  return values.includes(value) ? values : [...values, value].sort((a, b) => a - b)
}

export function createSlideshowProgress(totalSlides: number): SlideshowProgress {
  return {
    totalSlides,
    currentSlide: 0,
    visitedSlides: totalSlides > 0 ? [0] : [],
    analyzedSlides: [],
    narratedSlides: [],
  }
}

export function markCurrentSlideAnalyzed(progress: SlideshowProgress): SlideshowProgress {
  return {
    ...progress,
    analyzedSlides: addUnique(progress.analyzedSlides ?? [], progress.currentSlide),
  }
}

export function assertCurrentSlideAnalyzed(progress: SlideshowProgress): void {
  if (!(progress.analyzedSlides ?? []).includes(progress.currentSlide)) {
    throw new Error(
      `Analyze slide ${progress.currentSlide + 1} of ${progress.totalSlides} before narrating.`,
    )
  }
}

export function markCurrentSlideNarrated(progress: SlideshowProgress): SlideshowProgress {
  return {
    ...progress,
    narratedSlides: addUnique(progress.narratedSlides, progress.currentSlide),
  }
}

export function countForwardSlideAdvances(command: string): number {
  return command.match(/playwright-cli\s+press\s+(?:ArrowRight|Space)\b/g)?.length ?? 0
}

export function advanceSlideshowProgress(
  progress: SlideshowProgress,
  advanceCount: number,
): SlideshowProgress {
  if (advanceCount !== 1) {
    throw new Error('Advance exactly one slide at a time; batched page jumps are not allowed.')
  }
  if (!progress.narratedSlides.includes(progress.currentSlide)) {
    throw new Error(
      `Narrate slide ${progress.currentSlide + 1} of ${progress.totalSlides} before advancing.`,
    )
  }
  if (progress.currentSlide >= progress.totalSlides - 1) {
    throw new Error(`Slide ${progress.totalSlides} is the final slide; do not advance past it.`)
  }

  const currentSlide = progress.currentSlide + 1
  return {
    ...progress,
    currentSlide,
    visitedSlides: addUnique(progress.visitedSlides, currentSlide),
  }
}
