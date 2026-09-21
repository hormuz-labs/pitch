import type { VideoStoryboard } from '@saas/shared'

export interface DemoJobInputOptions {
  hasPreparedAssets: boolean
  assetCount: number
  url?: string
  instructions?: string
  script?: string
  storyboard?: VideoStoryboard
}

export interface DemoJobInput {
  agent: 'demo-generator'
  prompt: string
}

/** Build the small per-job message; behavioral detail belongs in the selected agent. */
export function buildDemoJobInput(options: DemoJobInputOptions): DemoJobInput {
  const sections = ['Record a cinematic explanatory video.']
  if (options.hasPreparedAssets) {
    const pageSelectionInstruction =
      options.storyboard?.status === 'approved'
        ? 'Display only the pages listed in the approved storyboard, in its scene order. Deleted pages must not be displayed, analyzed, or narrated.'
        : 'Display every prepared page in manifest order at least once. Never skip pages. Never jump over pages. Shorten narration instead of skipping a page when the requested video is brief.'
    const analysisScope =
      options.storyboard?.status === 'approved' ? 'every displayed page' : 'every page'
    sections.push(
      `This job has ${options.assetCount} prepared asset(s). Start with pitch demo list-assets and build the asset slideshow before using any optional URL. ${pageSelectionInstruction} Call pitch demo analyze-slide on ${analysisScope} before narrating it so Gemini understands the rendered slide pixels even when extracted text and OCR are empty. Use its narration points and viewport boxes first; PDF text and OCR rectangles are supplementary fallback inputs. Use pitch demo ground-region only to retry a box or locate another target.`,
    )
  }
  const url = options.url?.trim()
  if (url) sections.push(`Optional target URL: ${url}`)
  const instructions = options.instructions?.trim()
  if (instructions) sections.push(`User instructions: ${instructions}`)
  const script = options.script?.trim()
  if (script) {
    sections.push(`VOICEOVER SCRIPT (source of truth for narration):\n"""\n${script}\n"""`)
  }
  if (options.storyboard?.status === 'approved') {
    const revision = options.storyboard.approvedRevision ?? options.storyboard.revision
    const scenes = options.storyboard.scenes
      .filter(scene => scene.enabled)
      .map(scene => ({
        page: scene.pageIndex + 1,
        narration: scene.narration,
        emphasis: scene.emphasis.map(({ zoom: _zoom, ...emphasis }) => emphasis),
        overlays: scene.overlays ?? [],
      }))
    const renderContract = { slideshowTransition: options.storyboard.transition, scenes }
    sections.push(
      `APPROVED STORYBOARD REVISION ${revision} (recording and editing contract):\n${JSON.stringify(renderContract)}\n\nDo not rewrite, rephrase, omit, or add narration. On each page, call pitch demo analyze-slide only to satisfy rendered-page validation, then narrate the approved text exactly and use the approved emphasis rectangles, coordinate spaces, and styles. Carry the approved camera intentions into the shared video-editing skill after recording; its editor must inspect and frame the actual source. Persistent overlays are already applied by the slideshow and must remain visible for their complete scene.`,
    )
  }
  return {
    agent: 'demo-generator',
    prompt: sections.join('\n\n'),
  }
}
