/**
 * General media tools.
 *
 * The named pipelines (record a demo, render a launch film, build a deck)
 * cover the outcomes people ask for by name. This covers everything else:
 * "lower the background music", "cut the first eight seconds", "swap the
 * audio", "make it a square crop", "pull a still at 0:12". Those are one
 * ffmpeg command each, and without them the studio can only make artifacts,
 * not edit them.
 *
 * Everything is scoped to the project workspace on the host, where ffmpeg and
 * the media files live. `media_probe` first, always: it is how you learn what
 * streams a file actually has before you touch it.
 */
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type } from '@sinclair/typebox'
import { hostAction, text } from '../lib/studio-host.ts'

export default function mediaTools(pi: ExtensionAPI) {
  pi.registerTool({
    name: 'media_probe',
    label: 'Probe media',
    description:
      'Inspect a media file in the workspace with ffprobe: duration, container, and every video/audio ' +
      'stream with its codec, resolution, channels and volume level. Call this BEFORE editing a file — ' +
      'it tells you which stream index the narration is on versus the music bed, and whether the edit ' +
      'you are about to make is even possible.',
    parameters: Type.Object({
      file: Type.String({
        description: 'Workspace-relative path, e.g. "renders/demo-1.mp4" or "recording/upload.mp4"',
      }),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx: any) {
      return text(await hostAction(ctx.cwd, 'media_probe', { file: p.file }))
    },
  })

  pi.registerTool({
    name: 'media_ffmpeg',
    label: 'Edit media',
    description:
      'Run one ffmpeg command over workspace files to make an edit the named pipelines do not cover — ' +
      'change the level of a track, trim, crop, concatenate, replace or mix audio, change speed, extract ' +
      'a frame or a clip. Give `args` as the arguments AFTER "ffmpeg -y", with every path workspace-' +
      'relative; the output path must be inside the workspace too. Write to a NEW file rather than over ' +
      'the input, then tell the user what changed. Probe first, and prefer stream copy (-c copy) when ' +
      'only the container changes, so quality survives.',
    parameters: Type.Object({
      args: Type.Array(Type.String(), {
        description:
          'ffmpeg arguments after "-y", e.g. ["-i","renders/demo-1.mp4","-filter_complex",' +
          '"[0:a]volume=0.3[a]","-map","0:v","-map","[a]","renders/demo-2.mp4"]',
      }),
      out: Type.String({
        description: 'Workspace-relative path the command writes, so the studio can preview it',
      }),
      why: Type.String({ description: 'One line describing the edit, shown to the user' }),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx: any) {
      return text(
        await hostAction(ctx.cwd, 'media_ffmpeg', { args: p.args, out: p.out, why: p.why }),
      )
    },
  })

  pi.registerTool({
    name: 'media_publish',
    label: 'Publish result',
    description:
      "Record a finished file in the workspace as one of the project's outputs, so it appears under the " +
      "user's Download button and becomes the preview. Use it after an edit the named pipelines did not " +
      'produce (they publish their own results). The file must already exist in the workspace.',
    parameters: Type.Object({
      file: Type.String({ description: 'Workspace-relative path to publish' }),
      label: Type.String({ description: 'Short name for the download, e.g. "Quieter music"' }),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx: any) {
      return text(await hostAction(ctx.cwd, 'media_publish', { file: p.file, label: p.label }))
    },
  })
}
