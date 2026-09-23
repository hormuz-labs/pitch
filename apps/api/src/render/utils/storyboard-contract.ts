import type { VideoStoryboard } from '@saas/shared'

/**
 * What pitch demo record-start tells the agent about an approved storyboard:
 * the scenes to record, verbatim, and what the editor inherits afterwards.
 */
export function storyboardContract(storyboard: VideoStoryboard): string {
  const revision = storyboard.approvedRevision ?? storyboard.revision
  const scenes = storyboard.scenes
    .filter(scene => scene.enabled)
    .map(scene => ({
      page: scene.pageIndex + 1,
      narration: scene.narration,
      // Camera zoom is the editor's decision, made on the actual footage.
      emphasis: scene.emphasis.map(({ zoom: _zoom, ...emphasis }) => emphasis),
      overlays: scene.overlays ?? [],
    }))
  const contract = { slideshowTransition: storyboard.transition, scenes }
  return `APPROVED STORYBOARD REVISION ${revision} (recording and editing contract):\n${JSON.stringify(contract)}\n\nDisplay only the pages listed here, in this scene order; deleted pages must not be displayed, analyzed, or narrated. Do not rewrite, rephrase, omit, or add narration. On each page, call pitch demo analyze-slide only to satisfy rendered-page validation, then narrate the approved text exactly and use the approved emphasis rectangles, coordinate spaces, and styles. Carry the approved camera intentions into the shared video-editing skill after recording; its editor must inspect and frame the actual source. Persistent overlays are already applied by the slideshow and must remain visible for their complete scene.`
}
