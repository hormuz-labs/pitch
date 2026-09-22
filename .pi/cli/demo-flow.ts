/**
 * Demo-video flow — `pitch demo` commands.
 *
 * The orchestration the old worker did around the demo-generator agent
 * (prepare assets → open the user's browser and start recording → let the
 * agent drive → stop → ffmpeg render → publish) is now a set of host actions
 * the agent calls itself, in order, from the chat. Each tool forwards to the
 * studio (apps/api/src/flows/demo-video/index.ts) with the session's
 * workspace as authority; the browser-driving commands live in demo.ts.
 */

import { Type } from '@sinclair/typebox'
import { workspaceOf } from '../lib/paths.ts'
import { hostAction, text } from '../lib/studio-host.ts'
import type { CommandSpec } from './registry.ts'

export default function demoFlowCommands(): CommandSpec[] {
  const commands: CommandSpec[] = []
  commands.push({
    verb: 'browser-open',
    description:
      'Prepare the real browser WITHOUT recording. Inspect navigation and verify the workflow with demo bash, return to the starting view, then record-start once in this same browser. Never use short recordings as inspection sessions.',
    parameters: Type.Object({ url: Type.Optional(Type.String()) }),
    async execute(_id, p, _signal, _onUpdate, ctx) {
      return text(await hostAction(workspaceOf(ctx), 'demo_browser_open', { url: p.url }))
    },
  })
  commands.push({
    verb: 'browser-close',
    description:
      'Close a preparation-only browser when ending a turn without recording. Preserves existing takes. For an active take use record-stop only at the end.',
    parameters: Type.Object({}),
    async execute(_id, _p, _signal, _onUpdate, ctx) {
      return text(await hostAction(workspaceOf(ctx), 'demo_browser_close', {}))
    },
  })
  commands.push({
    verb: 'prepare-assets',
    description:
      "Turn the project's uploaded PDFs/images into the slideshow manifest (page images, text, OCR " +
      'regions) under recording/assets/. Call once, before pitch demo record-start, whenever the project ' +
      'has uploads. Returns the manifest summary; pitch demo list-assets reads the same manifest later.',
    parameters: Type.Object({}),
    async execute(_id, _p: any, _signal, _onUpdate, ctx: any) {
      return text(await hostAction(workspaceOf(ctx), 'demo_prepare_assets', {}))
    },
  })

  commands.push({
    verb: 'record-start',
    description:
      'Start ONE continuous take in the prepared browser (or open it if needed). ' +
      'Optionally navigates to `url` first. Returns the session name, the start time and, when a ' +
      'storyboard exists, the approved recording contract. Keep recording through navigation, inspection and recoverable errors; narrate --action drives while speaking. Use demo bash / narrate / fill-field. Never call `playwright-cli open` yourself.',
    parameters: Type.Object({
      url: Type.Optional(
        Type.String({
          description:
            'Starting page to open before recording begins; omit to keep the prepared view',
        }),
      ),
      retakeReason: Type.Optional(
        Type.String({
          description:
            'For a replacement take only: the specific missing action or capture failure. Inspect the saved source and correct the route first; use browser-open for exploration.',
        }),
      ),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx: any) {
      return text(
        await hostAction(workspaceOf(ctx), 'demo_record_start', {
          url: p.url,
          retakeReason: p.retakeReason,
        }),
      )
    },
  })

  commands.push({
    verb: 'record-stop',
    description:
      'End the continuous take after the final demonstrated result. Waits for the final narration to finish, then closes the browser. Do not use between steps or for debugging. Always stop before finishing a turn. Then read video-editing and prepare demo source.',
    parameters: Type.Object({}),
    async execute(_id, _p: any, _signal, _onUpdate, ctx: any) {
      return text(await hostAction(workspaceOf(ctx), 'demo_record_stop', {}))
    },
  })

  commands.push({
    verb: 'source',
    description:
      'Prepare a stopped recording for the video-editing skill: mux the original capture with synchronized narration/SFX into a new recording/source-*.mp4 and narration timeline. Preserves the capture timing and composition; no automatic cuts, zooms, cards, music or publication. Returns the source path for pitch video probe/frames and an edit plan.',
    parameters: Type.Object({}),
    async execute(_id, _p, _signal, _onUpdate, ctx) {
      return text(await hostAction(workspaceOf(ctx), 'demo_source', {}))
    },
  })

  commands.push({
    verb: 'storyboard-plan',
    description:
      'Build a storyboard draft (storyboard.json) from the prepared PDF/image pages: Gemini reads ' +
      'every page and proposes narration + emphasis rectangles; a voiceover script, when given, is ' +
      'split across the pages instead. Only when the user wants to review a storyboard before ' +
      'recording. Requires pitch demo prepare-assets first. Returns a per-scene summary.',
    parameters: Type.Object({}),
    async execute(_id, _p: any, _signal, _onUpdate, ctx: any) {
      return text(await hostAction(workspaceOf(ctx), 'storyboard_plan', {}))
    },
  })

  commands.push({
    verb: 'storyboard-save',
    description:
      'Write (optional `json`) and validate storyboard.json, saving it as the next revision. Reports the exact ' +
      "problem when a phrase is not in its scene's narration, a rect is out of bounds, or a scene has " +
      'no narration — fix the JSON and save again. The next pitch demo record-start records this storyboard.',
    parameters: Type.Object({
      json: Type.Optional(
        Type.String({
          description:
            'Complete storyboard JSON to write before validating. Omit to validate the document already saved in the workspace.',
        }),
      ),
      summary: Type.Optional(Type.String({ description: 'One line describing what changed' })),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx: any) {
      return text(
        await hostAction(workspaceOf(ctx), 'storyboard_save', { json: p.json, summary: p.summary }),
      )
    },
  })
  return commands
}
