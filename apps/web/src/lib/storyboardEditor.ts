import type {
  StoryboardOverlay,
  StoryboardRect,
  StoryboardScene,
  StoryboardTitleCard,
  VideoStoryboard,
} from '../types'

interface Point {
  x: number
  y: number
}

interface Bounds {
  left: number
  top: number
  width: number
  height: number
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value))

const roundPct = (value: number) => Math.round(value * 100) / 100

export type StoryboardRectTransformMode =
  | 'move'
  | 'northWest'
  | 'northEast'
  | 'southWest'
  | 'southEast'

export function defaultCalloutNoteRect(target: StoryboardRect): StoryboardRect {
  const widthPct = 28
  const heightPct = 14
  const gapPct = 5
  const targetCenterX = target.leftPct + target.widthPct / 2
  const preferredLeft =
    targetCenterX > 50
      ? target.leftPct - widthPct - gapPct
      : target.leftPct + target.widthPct + gapPct
  return {
    leftPct: roundPct(clamp(preferredLeft, 0, 100 - widthPct)),
    topPct: roundPct(
      clamp(target.topPct + target.heightPct / 2 - heightPct / 2, 0, 100 - heightPct),
    ),
    widthPct,
    heightPct,
  }
}

export function rectFromDrag(start: Point, end: Point, bounds: Bounds) {
  if (bounds.width <= 0 || bounds.height <= 0) return null
  const startX = clamp(start.x - bounds.left, 0, bounds.width)
  const startY = clamp(start.y - bounds.top, 0, bounds.height)
  const endX = clamp(end.x - bounds.left, 0, bounds.width)
  const endY = clamp(end.y - bounds.top, 0, bounds.height)
  const widthPct = (Math.abs(endX - startX) / bounds.width) * 100
  const heightPct = (Math.abs(endY - startY) / bounds.height) * 100
  if (widthPct < 0.75 || heightPct < 0.75) return null
  return {
    leftPct: roundPct((Math.min(startX, endX) / bounds.width) * 100),
    topPct: roundPct((Math.min(startY, endY) / bounds.height) * 100),
    widthPct: roundPct(widthPct),
    heightPct: roundPct(heightPct),
  }
}

export function transformStoryboardRect(
  rect: StoryboardRect,
  mode: StoryboardRectTransformMode,
  start: Point,
  current: Point,
  bounds: Bounds,
): StoryboardRect {
  if (bounds.width <= 0 || bounds.height <= 0) return rect
  const deltaXPct = ((current.x - start.x) / bounds.width) * 100
  const deltaYPct = ((current.y - start.y) / bounds.height) * 100
  if (mode === 'move') {
    return {
      ...rect,
      leftPct: roundPct(clamp(rect.leftPct + deltaXPct, 0, 100 - rect.widthPct)),
      topPct: roundPct(clamp(rect.topPct + deltaYPct, 0, 100 - rect.heightPct)),
    }
  }

  const minimumSizePct = 1
  let left = rect.leftPct
  let right = rect.leftPct + rect.widthPct
  let top = rect.topPct
  let bottom = rect.topPct + rect.heightPct
  if (mode === 'northWest' || mode === 'southWest') {
    left = clamp(left + deltaXPct, 0, right - minimumSizePct)
  } else {
    right = clamp(right + deltaXPct, left + minimumSizePct, 100)
  }
  if (mode === 'northWest' || mode === 'northEast') {
    top = clamp(top + deltaYPct, 0, bottom - minimumSizePct)
  } else {
    bottom = clamp(bottom + deltaYPct, top + minimumSizePct, 100)
  }
  return {
    leftPct: roundPct(left),
    topPct: roundPct(top),
    widthPct: roundPct(right - left),
    heightPct: roundPct(bottom - top),
  }
}

const durationForNarration = (narration: string): number => {
  const words = narration.trim().split(/\s+/).filter(Boolean).length
  return Math.max(2, Math.round((words / 2.5) * 10) / 10)
}

export function updateStoryboardScene(
  storyboard: VideoStoryboard,
  sceneId: string,
  update: Partial<StoryboardScene>,
): VideoStoryboard {
  return {
    ...storyboard,
    status: 'draft',
    approvedRevision: undefined,
    scenes: storyboard.scenes.map(scene => {
      if (scene.id !== sceneId) return scene
      const next = { ...scene, ...update }
      return {
        ...next,
        estimatedDurationSec: durationForNarration(next.narration),
      }
    }),
  }
}

export function removeStoryboardScene(
  storyboard: VideoStoryboard,
  sceneId: string,
): VideoStoryboard {
  if (!storyboard.scenes.some(scene => scene.id === sceneId)) return storyboard
  if (storyboard.scenes.length <= 1) {
    throw new Error('A video must keep at least one scene.')
  }
  return {
    ...storyboard,
    status: 'draft',
    approvedRevision: undefined,
    scenes: storyboard.scenes.filter(scene => scene.id !== sceneId),
  }
}

export type StoryboardOverlayUpdate = Partial<{
  rect: StoryboardRect
  noteRect: StoryboardRect
  strength: number
  url: string
  alt: string
  source: 'upload' | 'giphy'
  giphyId: string
  text: string
  shape: 'box' | 'circle'
  color: 'pink' | 'blue' | 'yellow' | 'green'
  layer: number
}>

export function updateStoryboardOverlay(
  storyboard: VideoStoryboard,
  sceneId: string,
  overlayIndex: number,
  update: StoryboardOverlayUpdate,
): VideoStoryboard {
  const scene = storyboard.scenes.find(item => item.id === sceneId)
  if (!scene) return storyboard
  return updateStoryboardScene(storyboard, sceneId, {
    overlays: scene.overlays.map((overlay, index) =>
      index === overlayIndex ? ({ ...overlay, ...update } as StoryboardOverlay) : overlay,
    ),
  })
}

export type StoryboardLayerRef = {
  kind: 'overlay' | 'emphasis'
  index: number
}

export function storyboardLayerEntries(scene: StoryboardScene) {
  const overlayCount = scene.overlays.length
  return [
    ...scene.overlays.map((item, index) => ({
      ref: { kind: 'overlay' as const, index },
      layer: item.layer ?? index,
    })),
    ...scene.emphasis.map((item, index) => ({
      ref: { kind: 'emphasis' as const, index },
      layer: item.layer ?? overlayCount + index,
    })),
  ]
}

export function nextStoryboardLayer(scene: StoryboardScene): number {
  return (
    storyboardLayerEntries(scene).reduce((maximum, item) => Math.max(maximum, item.layer), -1) + 1
  )
}

export function moveStoryboardLayer(
  storyboard: VideoStoryboard,
  sceneId: string,
  target: StoryboardLayerRef,
  direction: 'front' | 'back',
): VideoStoryboard {
  const scene = storyboard.scenes.find(item => item.id === sceneId)
  if (!scene) return storyboard
  const ordered = storyboardLayerEntries(scene).sort((a, b) => a.layer - b.layer)
  const targetIndex = ordered.findIndex(
    item => item.ref.kind === target.kind && item.ref.index === target.index,
  )
  if (targetIndex < 0) return storyboard
  const [entry] = ordered.splice(targetIndex, 1)
  if (!entry) return storyboard
  if (direction === 'front') ordered.push(entry)
  else ordered.unshift(entry)

  const layerByRef = new Map(
    ordered.map((item, layer) => [`${item.ref.kind}:${item.ref.index}`, layer] as const),
  )
  return updateStoryboardScene(storyboard, sceneId, {
    overlays: scene.overlays.map((overlay, index) => ({
      ...overlay,
      layer: layerByRef.get(`overlay:${index}`),
    })),
    emphasis: scene.emphasis.map((emphasis, index) => ({
      ...emphasis,
      layer: layerByRef.get(`emphasis:${index}`),
    })),
  })
}

export function updateStoryboardTitleCard(
  storyboard: VideoStoryboard,
  card: 'intro' | 'outro',
  update: Partial<StoryboardTitleCard>,
): VideoStoryboard {
  return {
    ...storyboard,
    status: 'draft',
    approvedRevision: undefined,
    titleCards: {
      ...storyboard.titleCards,
      [card]: { ...storyboard.titleCards[card], ...update },
    },
  }
}

export const storyboardDurationSec = (storyboard: VideoStoryboard): number =>
  storyboard.scenes
    .filter(scene => scene.enabled)
    .reduce((total, scene) => total + scene.estimatedDurationSec, 0) +
  (storyboard.titleCards?.intro.enabled ? 2.5 : 0) +
  (storyboard.titleCards?.outro.enabled ? 2.5 : 0)
