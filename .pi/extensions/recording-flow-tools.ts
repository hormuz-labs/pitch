/**
 * Recording-edit flow tools. The recording_* analysis tools (recording-tools.ts)
 * reconstruct recording/demo-state.json; this host tool asks the studio to
 * render that plan over the uploaded recording and publish the result.
 */
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type } from '@sinclair/typebox'
import { hostAction, text } from '../lib/studio-host.ts'

export default function recordingFlowTools(pi: ExtensionAPI) {
  pi.registerTool({
    name: 'edit_render',
    label: 'Render edit',
    description:
      'Render the edited video from recording/demo-state.json over the uploaded recording ' +
      '(zoom/pan camera → smart trim → intro/outro cards, source narration kept), publish it ' +
      'as the project output and return its URL. Call it once per turn, after the event list ' +
      'is complete. productName / productUrl override the project options for the cards.',
    parameters: Type.Object({
      productName: Type.Optional(
        Type.String({ description: 'Product name for the intro/outro cards.' }),
      ),
      productUrl: Type.Optional(
        Type.String({ description: 'Product URL shown on the outro card.' }),
      ),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx: any) {
      return text(
        await hostAction(ctx.cwd, 'edit_render', {
          productName: p.productName,
          productUrl: p.productUrl,
        }),
      )
    },
  })
}
