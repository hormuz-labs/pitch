export type VideoStoryboardStatus = 'draft' | 'approved'
const STORYBOARD_TRANSITIONS = ['fade', 'slide', 'zoom'] as const

export const STORYBOARD_ANNOTATION_STYLES = [
  'box',
  'circle',
  'underline',
  'highlighter',
  'arrow',
  'spotlight',
  'pulse',
  'bracket',
] as const

export type StoryboardAnnotationStyle = (typeof STORYBOARD_ANNOTATION_STYLES)[number]

export interface StoryboardRect {
  leftPct: number
  topPct: number
  widthPct: number
  heightPct: number
}

export interface StoryboardEmphasis {
  phrase: string
  rect: StoryboardRect
  coordinateSpace: 'page' | 'viewport'
  style: StoryboardAnnotationStyle
  zoom: number
}

export interface StoryboardScene {
  id: string
  pageIndex: number
  previewUrl: string
  enabled: boolean
  title: string
  screenText: string[]
  narration: string
  emphasis: StoryboardEmphasis[]
  estimatedDurationSec: number
}

export interface StoryboardTitleCard {
  enabled: boolean
  title: string
  subtitle: string
}

export interface StoryboardTitleCards {
  intro: StoryboardTitleCard
  outro: StoryboardTitleCard
}

export interface VideoStoryboard {
  revision: number
  approvedRevision?: number
  status: VideoStoryboardStatus
  transition: 'fade' | 'slide' | 'zoom'
  titleCards: StoryboardTitleCards
  scenes: StoryboardScene[]
}

export type NewStoryboardScene = Omit<
  StoryboardScene,
  'id' | 'enabled' | 'title' | 'screenText' | 'estimatedDurationSec'
> &
  Partial<Pick<StoryboardScene, 'id' | 'enabled' | 'title' | 'screenText' | 'estimatedDurationSec'>>

const normalizeTitleCards = (cards?: StoryboardTitleCards): StoryboardTitleCards => ({
  intro: {
    enabled: cards?.intro?.enabled === true,
    title: cards?.intro?.title?.trim() ?? '',
    subtitle: cards?.intro?.subtitle?.trim() ?? '',
  },
  outro: {
    enabled: cards?.outro?.enabled === true,
    title: cards?.outro?.title?.trim() ?? '',
    subtitle: cards?.outro?.subtitle?.trim() ?? '',
  },
})

const narrationDurationSec = (narration: string): number => {
  const words = narration.trim().split(/\s+/).filter(Boolean).length
  return Math.max(2, Math.round((words / 2.5) * 10) / 10)
}

function validateRect(rect: StoryboardRect): void {
  const values = [rect.leftPct, rect.topPct, rect.widthPct, rect.heightPct]
  if (!values.every(Number.isFinite)) throw new Error('Storyboard emphasis has an invalid box.')
  if (
    rect.leftPct < 0 ||
    rect.topPct < 0 ||
    rect.widthPct <= 0 ||
    rect.heightPct <= 0 ||
    rect.leftPct + rect.widthPct > 100 ||
    rect.topPct + rect.heightPct > 100
  ) {
    throw new Error('Storyboard emphasis box must stay inside the rendered frame.')
  }
}

function validateScenes(scenes: StoryboardScene[]): void {
  const enabled = scenes.filter(scene => scene.enabled)
  if (enabled.length === 0) throw new Error('Storyboard must include at least one scene.')
  for (const scene of enabled) {
    if (!scene.narration.trim()) {
      throw new Error(`Scene ${scene.pageIndex + 1} needs narration before rendering.`)
    }
    for (const emphasis of scene.emphasis) {
      if (!emphasis.phrase.trim()) {
        throw new Error(`Scene ${scene.pageIndex + 1} has an emphasis without a phrase.`)
      }
      if (
        !scene.narration.toLocaleLowerCase().includes(emphasis.phrase.trim().toLocaleLowerCase())
      ) {
        throw new Error(
          `Scene ${scene.pageIndex + 1} has an annotation trigger that must match words in its narration.`,
        )
      }
      if (!STORYBOARD_ANNOTATION_STYLES.includes(emphasis.style)) {
        throw new Error(`Scene ${scene.pageIndex + 1} has an unsupported annotation type.`)
      }
      if (!Number.isFinite(emphasis.zoom) || emphasis.zoom < 1 || emphasis.zoom > 3) {
        throw new Error(`Scene ${scene.pageIndex + 1} has an invalid annotation zoom.`)
      }
      validateRect(emphasis.rect)
    }
  }
}

function validateTransition(transition: VideoStoryboard['transition']): void {
  if (!STORYBOARD_TRANSITIONS.includes(transition)) {
    throw new Error('Storyboard has an unsupported slideshow transition.')
  }
}

function normalizeScene(scene: NewStoryboardScene, index: number): StoryboardScene {
  const narration = scene.narration.trim()
  return {
    id: scene.id || `scene-${index + 1}`,
    pageIndex: scene.pageIndex,
    previewUrl: scene.previewUrl,
    enabled: scene.enabled ?? true,
    title: scene.title?.trim() || `Page ${scene.pageIndex + 1}`,
    screenText: (scene.screenText ?? []).map(text => text.trim()).filter(Boolean),
    narration,
    emphasis: scene.emphasis,
    estimatedDurationSec: narrationDurationSec(narration),
  }
}

export function createVideoStoryboard(scenes: NewStoryboardScene[]): VideoStoryboard {
  const normalized = scenes.map(normalizeScene)
  validateScenes(normalized)
  return {
    revision: 1,
    status: 'draft',
    transition: 'fade',
    titleCards: normalizeTitleCards(),
    scenes: normalized,
  }
}

export function updateVideoStoryboard(
  current: VideoStoryboard,
  update: {
    revision: number
    transition?: VideoStoryboard['transition']
    titleCards?: StoryboardTitleCards
    scenes: StoryboardScene[]
  },
): VideoStoryboard {
  if (update.revision !== current.revision) {
    throw new Error(
      `Storyboard revision conflict: expected ${current.revision}, received ${update.revision}.`,
    )
  }
  const scenes = update.scenes.map(normalizeScene)
  validateScenes(scenes)
  const transition = update.transition ?? current.transition ?? 'fade'
  validateTransition(transition)
  return {
    revision: current.revision + 1,
    status: 'draft',
    transition,
    titleCards: normalizeTitleCards(update.titleCards ?? current.titleCards),
    scenes,
  }
}

export function approveVideoStoryboard(
  storyboard: VideoStoryboard,
  revision: number,
): VideoStoryboard {
  if (revision !== storyboard.revision) {
    throw new Error(
      `Storyboard revision conflict: expected ${storyboard.revision}, received ${revision}.`,
    )
  }
  validateTransition(storyboard.transition)
  validateScenes(storyboard.scenes)
  return {
    ...storyboard,
    status: 'approved',
    approvedRevision: storyboard.revision,
    titleCards: normalizeTitleCards(storyboard.titleCards),
  }
}
