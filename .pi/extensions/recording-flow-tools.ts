/**
 * Recording-edit flow tools. The recording_* analysis tools (recording-tools.ts)
 * reconstruct recording/demo-state.json; this host tool asks the studio to
 * render that plan over the uploaded recording and publish the result.
 */
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type } from '@sinclair/typebox'
import { workspaceOf } from '../lib/paths.ts'
import { hostAction, text } from '../lib/studio-host.ts'

export default function recordingFlowTools(pi: ExtensionAPI) {
  pi.registerTool({
    name: 'edit_render',
    label: 'Render edit',
    description:
      'Render the edited video from recording/demo-state.json over the uploaded recording ' +
      '(zoom/pan camera → smart trim → intro/outro cards, source narration kept), publish it ' +
      'as the project output and return its URL. Call it once per turn, after the event list ' +
      'is complete. productName / productUrl override the project options for the cards; fps: 60 when the user wants 60fps.',
    parameters: Type.Object({
      productName: Type.Optional(
        Type.String({ description: 'Product name for the intro/outro cards.' }),
      ),
      productUrl: Type.Optional(
        Type.String({ description: 'Product URL shown on the outro card.' }),
      ),
      fps: Type.Optional(
        Type.Union([Type.Literal(30), Type.Literal(60)], {
          description:
            "Output frame rate. Default: the recording's own (screen recordings are usually 30). 60 makes the camera moves and the cards silky; the source frames are repeated.",
        }),
      ),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx: any) {
      return text(
        await hostAction(workspaceOf(ctx), 'edit_render', {
          productName: p.productName,
          productUrl: p.productUrl,
          fps: p.fps,
        }),
      )
    },
  })
}
