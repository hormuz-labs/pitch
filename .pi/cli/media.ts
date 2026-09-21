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
 * the media files live. `pitch media probe` first, always: it is how you learn what
 * streams a file actually has before you touch it.
 */

import { Type } from '@sinclair/typebox'
import { workspaceOf } from '../lib/paths.ts'
import { hostAction, text } from '../lib/studio-host.ts'
import type { CommandSpec } from './registry.ts'

export default function mediaCommands(): CommandSpec[] {
  const commands: CommandSpec[] = []
  commands.push({
    verb: 'transcribe',
    description:
      'Transcribe speech in any workspace media using host whisper.cpp. Writes source-time segments and words to JSON; read it and check names against the footage. Does not reset recording state.',
    parameters: Type.Object({
      file: Type.String({ description: 'Workspace-relative audio/video file' }),
      out: Type.String({
        description: 'Workspace-relative transcript JSON path, e.g. edits/transcript.json',
      }),
      lang: Type.Optional(
        Type.String({ description: 'Language code; omit for automatic detection' }),
      ),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx: any) {
      return text(await hostAction(workspaceOf(ctx), 'media_transcribe', p))
    },
  })
  commands.push({
    verb: 'probe',
    description:
      "Inspect a workspace media file with ffprobe: duration, container, and every stream's codec, resolution, channels and volume. Inspect stream labels and source stems before treating narration and music separately; a mixed track cannot distinguish them.",
    parameters: Type.Object({
      file: Type.String({
        description: 'Workspace-relative path, e.g. "renders/demo-1.mp4" or "recording/upload.mp4"',
      }),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx: any) {
      return text(await hostAction(workspaceOf(ctx), 'media_probe', { file: p.file }))
    },
  })

  commands.push({
    verb: 'review',
    description:
      'Perceptual review of actual workspace audio/video with Gemini. purpose=music: assess a candidate against the audio direction; purpose=film: critique the combined picture and sound for clarity, reading time, motion, transitions and ending. Returns timestamped evidence, suggestions and limitations, not a quality score or technical pass. Reuses a report only for identical bytes, brief, purpose and model. Input up to 14 MiB; prepare a compressed review copy or a segment with ffmpeg if larger. For fast transitions, also inspect targeted frames. Reports live under review/media/.',
    parameters: Type.Object({
      file: Type.String({
        description:
          'Workspace-relative audio/video file; film review needs the mixed soundtrack in the video',
      }),
      purpose: Type.Union([Type.Literal('music'), Type.Literal('film')]),
      brief: Type.String({
        minLength: 1,
        maxLength: 8000,
        description:
          'Audience, takeaway, treatment/audio direction, required content, and approximate runtime or explicit delivery constraint',
      }),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx: any) {
      return text(await hostAction(workspaceOf(ctx), 'media_review', p))
    },
  })

  commands.push({
    verb: 'ffmpeg',
    description:
      'Run one ffmpeg command over workspace files for an edit the pipelines do not cover — levels, trim, crop, concat, replace or mix audio, speed, a frame or a clip. `args` are the arguments after `ffmpeg -y`, every path workspace-relative, the output inside the workspace and a NEW file. Probe first; prefer -c copy when only the container changes.',
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
        await hostAction(workspaceOf(ctx), 'media_ffmpeg', {
          args: p.args,
          out: p.out,
          why: p.why,
        }),
      )
    },
  })

  commands.push({
    verb: 'publish',
    description:
      "Record a finished file in the workspace as one of the project's outputs, so it appears under the " +
      "user's Download button and becomes the preview. Use it after an edit the named pipelines did not " +
      'produce (they publish their own results). The file must already exist in the workspace.',
    parameters: Type.Object({
      file: Type.String({ description: 'Workspace-relative path to publish' }),
      label: Type.String({ description: 'Short name for the download, e.g. "Quieter music"' }),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx: any) {
      return text(
        await hostAction(workspaceOf(ctx), 'media_publish', { file: p.file, label: p.label }),
      )
    },
  })
  return commands
}
