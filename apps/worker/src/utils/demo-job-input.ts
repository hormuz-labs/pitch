export interface DemoJobInputOptions {
  hasPreparedAssets: boolean
  assetCount: number
  url?: string
  instructions?: string
  script?: string
}

export interface DemoJobInput {
  agent: 'demo-generator'
  prompt: string
}

/** Build the small per-job message; behavioral detail belongs in the selected agent. */
export function buildDemoJobInput(options: DemoJobInputOptions): DemoJobInput {
  const sections = ['Record a cinematic explanatory video.']
  if (options.hasPreparedAssets) {
    sections.push(
      `This job has ${options.assetCount} prepared asset(s). Start with demo_list_assets and build the asset slideshow before using any optional URL. Display every prepared page in manifest order at least once. Never skip pages. Never jump over pages. Shorten narration instead of skipping a page when the requested video is brief. Call demo_analyze_slide on every page before narrating it so Gemini understands the rendered slide pixels even when extracted text and OCR are empty. Use its narration points and viewport boxes first; PDF text and OCR rectangles are supplementary fallback inputs. Use demo_ground_region only to retry a box or locate another target.`,
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
  return {
    agent: 'demo-generator',
    prompt: sections.join('\n\n'),
  }
}
