import type { StoryboardRect, StoryboardScene, VideoStoryboard } from '../types'

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

export function rectFromDrag(start: Point, end: Point, bounds: Bounds): StoryboardRect | null {
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
  const deltaX = ((current.x - start.x) / bounds.width) * 100
  const deltaY = ((current.y - start.y) / bounds.height) * 100
  if (mode === 'move') {
    return {
      ...rect,
      leftPct: roundPct(clamp(rect.leftPct + deltaX, 0, 100 - rect.widthPct)),
      topPct: roundPct(clamp(rect.topPct + deltaY, 0, 100 - rect.heightPct)),
    }
  }
  const minimum = 1
  let left = rect.leftPct
  let right = rect.leftPct + rect.widthPct
  let top = rect.topPct
  let bottom = rect.topPct + rect.heightPct
  if (mode === 'northWest' || mode === 'southWest') left = clamp(left + deltaX, 0, right - minimum)
  else right = clamp(right + deltaX, left + minimum, 100)
  if (mode === 'northWest' || mode === 'northEast') top = clamp(top + deltaY, 0, bottom - minimum)
  else bottom = clamp(bottom + deltaY, top + minimum, 100)
  return {
    leftPct: roundPct(left),
    topPct: roundPct(top),
    widthPct: roundPct(right - left),
    heightPct: roundPct(bottom - top),
  }
}

const durationForNarration = (narration: string) => {
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
      return { ...next, estimatedDurationSec: durationForNarration(next.narration) }
    }),
  }
}

export const storyboardDurationSec = (storyboard: VideoStoryboard) =>
  storyboard.scenes
    .filter(scene => scene.enabled)
    .reduce((total, scene) => total + scene.estimatedDurationSec, 0)
