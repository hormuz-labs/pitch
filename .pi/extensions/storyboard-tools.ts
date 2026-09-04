/**
 * Demo-video storyboard tools. The storyboard is `storyboard.json` in the
 * workspace (scenes with narration, emphasis rectangles and overlays; page
 * previews under scenes/). The agent edits the JSON with the sandboxed file
 * tools; these host tools validate + save it to the job, and queue the render.
 */
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type } from '@sinclair/typebox'
import { hostAction, text } from '../lib/studio-host.ts'

export default function storyboardTools(pi: ExtensionAPI) {
  pi.registerTool({
    name: 'storyboard_save',
    label: 'Save storyboard',
    description:
      "Validate storyboard.json and save it as a new revision of the job's storyboard (the editor updates " +
      "immediately). Fails with the exact validation problem when a phrase is not in its scene's narration, " +
      'a rect is out of bounds, or a scene has no narration — fix the JSON and save again.',
    parameters: Type.Object({
      summary: Type.String({ description: 'One line describing what changed (shown to the user)' }),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx: any) {
      return text(await hostAction(ctx.cwd, 'storyboard_save', { summary: p.summary }))
    },
  })

  pi.registerTool({
    name: 'storyboard_render',
    label: 'Approve and render',
    description:
      'Approve the saved storyboard and queue the final voiceover + video render. ONLY when the user ' +
      'explicitly asks to render / finalize; saving is enough for edits.',
    parameters: Type.Object({}),
    async execute(_id, _p: any, _signal, _onUpdate, ctx: any) {
      return text(await hostAction(ctx.cwd, 'storyboard_render', {}))
    },
  })
}
