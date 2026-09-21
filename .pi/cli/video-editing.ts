import { Type } from '@sinclair/typebox'
import { workspaceOf } from '../lib/paths.ts'
import { hostAction, text } from '../lib/studio-host.ts'
import type { CommandSpec } from './registry.ts'

const source = Type.String({ description: 'Workspace-relative source media path' })
const plan = Type.String({
  description: 'Workspace-relative version-1 edit plan JSON; read video-editing/references/plan.md',
})
const optionalNumber = (description: string) => Type.Optional(Type.Number({ description }))

export default function videoEditingCommands(): CommandSpec[] {
  const specs = [
    {
      verb: 'capabilities',
      description:
        'Check host video-editing dependencies and FFmpeg filters. Read the video-editing skill before editing existing footage.',
      parameters: Type.Object({}),
    },
    {
      verb: 'probe',
      description:
        'Inspect video/audio metadata, displayed dimensions, rotation, frame rate, HDR status and audio tracks before editing.',
      parameters: Type.Object({ source }),
    },
    {
      verb: 'frames',
      description:
        'Extract 1–12 source-time PNG frames, optionally as timestamped 4×2 contact sheets. Open returned workspace-relative images[].path using read before making visual decisions.',
      parameters: Type.Object({
        source,
        times: Type.Optional(
          Type.Array(Type.Number(), {
            description: 'JSON array of source seconds, e.g. [0,2,4]; default [0]',
          }),
        ),
        max_width: optionalNumber('Individual frame width, default 1280; 160–3840'),
        grid: Type.Optional(Type.Boolean({ description: 'Overlay a 10×10 coordinate grid' })),
        contact_sheet: Type.Optional(
          Type.Boolean({ description: 'Pack up to eight labeled frames per sheet' }),
        ),
        tile_width: optionalNumber('Sheet tile width, default 480; 160–960'),
      }),
    },
    {
      verb: 'focus',
      description:
        'Calculate a source-space viewport and write context/crop previews for an observed target. Open BOTH images; copy the returned viewport into the camera plan. Geometry is not semantic target verification.',
      parameters: Type.Object({
        source,
        time: Type.Number({ description: 'Observed source timestamp in seconds' }),
        target: Type.Object(
          { x: Type.Number(), y: Type.Number(), width: Type.Number(), height: Type.Number() },
          { description: 'Normalized box in the full displayed source; top-left origin' },
        ),
        width: optionalNumber('Final output width, default 1920'),
        height: optionalNumber('Final output height, default 1080'),
        margin: optionalNumber('Target margin per side, default 0.15; 0–2'),
      }),
    },
    {
      verb: 'analyze',
      description:
        'Find candidate silence, black and scene-change intervals in source seconds. Heuristics are not instructions to remove footage; uses the first audio track.',
      parameters: Type.Object({
        source,
        start: optionalNumber('Start source second, default 0'),
        end: optionalNumber('End source second, default duration'),
        silence_db: optionalNumber('Silence threshold, default -35 dB'),
        silence_duration: optionalNumber('Minimum silence, default 0.6 seconds'),
      }),
    },
    {
      verb: 'validate',
      description:
        'Validate edit-plan fields, assets, timing, geometry and output collisions. Returns the frame-quantized timeline for mapping captions, overlays and camera timing.',
      parameters: Type.Object({ plan }),
    },
    {
      verb: 'render',
      description:
        'Render a reproducible edit plan to H.264/AAC MP4 plus a plan snapshot. Preview renders the full timeline at reduced resolution under .video-work/. Final output.path should be a NEW file under renders/. Verify and inspect before pitch media publish.',
      parameters: Type.Object({
        plan,
        preview: Type.Optional(
          Type.Boolean({ description: 'Reduced-resolution draft, default false' }),
        ),
      }),
    },
    {
      verb: 'verify',
      description:
        'Fully decode edited video and check metadata, audio sample peak and optional expected duration. Read passed and checks; technical success does not prove visual quality, sync or intelligibility.',
      parameters: Type.Object({
        source,
        expected_duration: optionalNumber('Expected seconds from validate'),
      }),
    },
  ]
  return specs.map(spec => ({
    ...spec,
    async execute(_id, params, _signal, _onUpdate, ctx) {
      return text(await hostAction(workspaceOf(ctx), `video_edit_${spec.verb}`, params))
    },
  }))
}
