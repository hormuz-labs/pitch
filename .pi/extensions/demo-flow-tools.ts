/**
 * Demo-video flow tools — pi extension.
 *
 * The orchestration the old worker did around the demo-generator agent
 * (prepare assets → open the user's browser and start recording → let the
 * agent drive → stop → ffmpeg render → publish) is now a set of host actions
 * the agent calls itself, in order, from the chat. Each tool forwards to the
 * studio (apps/api/src/flows/demo-video/index.ts) with the session's
 * workspace as authority; the browser-driving tools live in demo-tools.ts.
 */
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type } from '@sinclair/typebox'
import { workspaceOf } from '../lib/paths.ts'
import { hostAction, text } from '../lib/studio-host.ts'

export default function demoFlowTools(pi: ExtensionAPI) {
  pi.registerTool({
    name: 'demo_prepare_assets',
    label: 'Prepare uploaded assets',
    description:
      "Turn the project's uploaded PDFs/images into the slideshow manifest (page images, text, OCR " +
      'regions) under recording/assets/. Call once, before demo_record_start, whenever the project ' +
      'has uploads. Returns the manifest summary; demo_list_assets reads the same manifest later.',
    parameters: Type.Object({}),
    async execute(_id, _p: any, _signal, _onUpdate, ctx: any) {
      return text(await hostAction(workspaceOf(ctx), 'demo_prepare_assets', {}))
    },
  })

  pi.registerTool({
    name: 'demo_record_start',
    label: 'Start recording',
    description:
      "Open the user's browser profile, attach playwright-cli and start the screen recording. " +
      'Optionally navigates to `url` first. Returns the session name, the start time and, when a ' +
      'storyboard exists, the approved render contract. After this, drive the page with demo_bash / ' +
      'demo_narrate / demo_zoom_in / demo_fill_field. Never call `playwright-cli open` yourself.',
    parameters: Type.Object({
      url: Type.Optional(Type.String({ description: 'Page to open once recording has started' })),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx: any) {
      return text(await hostAction(workspaceOf(ctx), 'demo_record_start', { url: p.url }))
    },
  })

  pi.registerTool({
    name: 'demo_record_stop',
    label: 'Stop recording',
    description:
      'Stop the screen recording and close the browser. Call as soon as the walkthrough (and the ' +
      'logo capture) is done — before demo_render, and always before you finish a turn.',
    parameters: Type.Object({}),
    async execute(_id, _p: any, _signal, _onUpdate, ctx: any) {
      return text(await hostAction(workspaceOf(ctx), 'demo_record_stop', {}))
    },
  })

  pi.registerTool({
    name: 'demo_render',
    label: 'Render demo video',
    description:
      'Render the recording with the narration/zoom/click events (cursor, zoom, mix, smart trim, ' +
      'title cards, background, browser header) into renders/ and publish it. Returns the video URL. ' +
      'Options override the ones the user chose at creation; omit to keep them. Re-renders reuse ' +
      'the last recording, so a look change (background, header, cards) needs no re-record.',
    parameters: Type.Object({
      background: Type.Optional(
        Type.String({ description: 'Background asset id (e.g. "gradient-1") or "none"' }),
      ),
      shape: Type.Optional(
        Type.String({ description: 'Corner shape of the inset video: rounded | square | pill' }),
      ),
      inset: Type.Optional(
        Type.Number({
          description: 'Fraction of the frame the video occupies on a background (0.5–1)',
        }),
      ),
      browserHeader: Type.Optional(
        Type.Union([Type.Literal('light'), Type.Literal('dark'), Type.Literal('none')], {
          description: 'Safari-style browser chrome over the recording',
        }),
      ),
      productName: Type.Optional(
        Type.String({ description: 'Name on the intro/outro cards (defaults to the host)' }),
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
        await hostAction(workspaceOf(ctx), 'demo_render', {
          background: p.background,
          shape: p.shape,
          inset: p.inset,
          browserHeader: p.browserHeader,
          productName: p.productName,
          fps: p.fps,
        }),
      )
    },
  })

  pi.registerTool({
    name: 'storyboard_plan',
    label: 'Plan storyboard',
    description:
      'Build a storyboard draft (storyboard.json) from the prepared PDF/image pages: Gemini reads ' +
      'every page and proposes narration + emphasis rectangles; a voiceover script, when given, is ' +
      'split across the pages instead. Only when the user wants to review a storyboard before ' +
      'recording. Requires demo_prepare_assets first. Returns a per-scene summary.',
    parameters: Type.Object({}),
    async execute(_id, _p: any, _signal, _onUpdate, ctx: any) {
      return text(await hostAction(workspaceOf(ctx), 'storyboard_plan', {}))
    },
  })

  pi.registerTool({
    name: 'storyboard_save',
    label: 'Save storyboard',
    description:
      'Write (optional `json`) and validate storyboard.json, saving it as the next revision. Reports the exact ' +
      "problem when a phrase is not in its scene's narration, a rect is out of bounds, or a scene has " +
      'no narration — fix the JSON and save again. The next demo_record_start records this storyboard.',
    parameters: Type.Object({
      json: Type.Optional(
        Type.String({
          description:
            'The complete storyboard JSON to write to storyboard.json before validating (you have no ' +
            'file tools — pass the whole edited document here). Omit to validate the file as it is.',
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
}
