import { computeZoomFraming } from './demo-core'
import type { Slide, SlideRegion } from './slideshow'
import type { ViewportRect } from './visual-grounding'

export interface PixelBounds {
  left: number
  top: number
  width: number
  height: number
}

export interface ViewportSize {
  width: number
  height: number
}

interface PdfAssetLike {
  kind: 'pdf'
  pages?: string[]
  pageData?: Array<{ image: string; regions?: SlideRegion[] }>
}

interface ImageAssetLike {
  kind: 'image'
  localPath?: string
  regions?: SlideRegion[]
}

export interface AssetManifestLike {
  jobId?: string
  baseDir?: string
  assets?: Array<PdfAssetLike | ImageAssetLike>
}

/**
 * Convert a rectangle measured as percentages of the source PDF/image page
 * into percentages of the recorded browser viewport. The slideshow contains
 * the page inside a padded stage, so page percentages cannot be used as
 * viewport percentages directly.
 */
export function pageRectToViewportRect(
  rect: ViewportRect,
  pageBounds: PixelBounds,
  viewport: ViewportSize,
): ViewportRect {
  if (viewport.width <= 0 || viewport.height <= 0) {
    throw new Error('Viewport dimensions must be positive')
  }
  return {
    leftPct: ((pageBounds.left + (rect.leftPct / 100) * pageBounds.width) / viewport.width) * 100,
    topPct: ((pageBounds.top + (rect.topPct / 100) * pageBounds.height) / viewport.height) * 100,
    widthPct: ((rect.widthPct / 100) * pageBounds.width * 100) / viewport.width,
    heightPct: ((rect.heightPct / 100) * pageBounds.height * 100) / viewport.height,
  }
}

/** Convert the worker manifest into ordered, targetable slideshow pages. */
export function resolveManifestSlides(manifest: AssetManifestLike): Slide[] {
  const slides: Slide[] = []
  for (const asset of manifest.assets ?? []) {
    if (asset.kind === 'pdf') {
      const pageData = asset.pageData ?? []
      for (const [index, image] of (asset.pages ?? []).entries()) {
        const data = pageData[index]
        slides.push({ image, regions: data?.regions ?? [] })
      }
    } else if (asset.localPath) {
      slides.push({ image: asset.localPath, regions: asset.regions ?? [] })
    }
  }
  return slides
}

export function zoomEventForViewportRect(
  rect: ViewportRect,
  videoTimeSec: number,
  explicitZoom?: number,
) {
  const box = {
    w: (rect.widthPct / 100) * 1920,
    h: (rect.heightPct / 100) * 1080,
    cx: ((rect.leftPct + rect.widthPct / 2) / 100) * 1920,
    cy: ((rect.topPct + rect.heightPct / 2) / 100) * 1080,
  }
  const framing = computeZoomFraming(box, explicitZoom)
  return {
    type: 'in' as const,
    videoTimeSec,
    x: framing.cx,
    y: framing.cy,
    zoom: framing.zoom,
  }
}
