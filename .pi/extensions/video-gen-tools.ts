/**
 * Generated video — one tool.
 *
 * Everything else in the studio renders footage of something that exists: the
 * product's own pages, a deck, an uploaded recording. This makes footage of
 * something that does not — an establishing shot, a texture, an abstract
 * transition, B-roll no one filmed.
 *
 * It runs on the host, because generation is a network call and the VM has no
 * network. Read `.pi/skills/generated-video/SKILL.md` before using it: the
 * prompt is the whole craft, and a bad one costs the user real money.
 */
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type } from '@sinclair/typebox'
import { hostAction, text } from '../lib/studio-host.ts'

export default function videoGenTools(pi: ExtensionAPI) {
  pi.registerTool({
    name: 'video_generate',
    label: 'Generate video',
    description:
      'Generate a NEW video clip from a text description (optionally animating an image from the ' +
      'workspace) with Gemini Omni, and write it into the workspace. Clips are about 10 seconds and ' +
      'come WITH their own audio. Use it for footage nobody has — establishing shots, textures, ' +
      'metaphors, abstract transitions, B-roll around the real product. Do NOT use it to show the ' +
      "product itself: it invents plausible-looking UI, so a launch film's product shots must come " +
      'from motion_* or a real recording. Generation is slow and billed, so write the prompt properly ' +
      '(read the generated-video skill) and preview a 360p draft before committing to 1080p.',
    parameters: Type.Object({
      prompt: Type.String({
        description:
          'The shot, described like a director: subject, action, camera move, lens, lighting, mood. ' +
          'Say what you do NOT want here too — there is no negative-prompt field.',
      }),
      out: Type.String({
        description: 'Workspace-relative .mp4 to write, e.g. "renders/gen-establishing.mp4"',
      }),
      resolution: Type.Optional(
        Type.Union([
          Type.Literal('360p'),
          Type.Literal('720p'),
          Type.Literal('1080p'),
          Type.Literal('4k'),
        ]),
        { description: 'Default 720p. Draft at 360p first; it is much faster and much cheaper.' },
      ),
      aspect: Type.Optional(Type.Union([Type.Literal('16:9'), Type.Literal('9:16')]), {
        description: 'Default 16:9. Use 9:16 only for a vertical cut.',
      }),
      image: Type.Optional(
        Type.String({
          description:
            'Workspace-relative png/jpg/webp to animate instead of generating from text alone — ' +
            'a harvested screenshot, a logo plate, a still you already have.',
        }),
      ),
      continues: Type.Optional(
        Type.String({
          description:
            'Refine or extend an earlier generated clip instead of starting over: pass the clip ' +
            'path you generated before (e.g. "renders/gen-establishing.mp4"). The prompt is then ' +
            'the CHANGE you want, not the whole shot again.',
        }),
      ),
      task: Type.Optional(
        Type.Union([
          Type.Literal('text_to_video'),
          Type.Literal('image_to_video'),
          Type.Literal('reference_to_video'),
          Type.Literal('edit'),
          Type.Literal('extend'),
        ]),
        {
          description:
            'Usually omit — the model infers it. Set "extend" to append time to the end of the ' +
            'clip named by `continues`, or "edit" to change it in place.',
        },
      ),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx: any) {
      return text(
        await hostAction(ctx.cwd, 'video_generate', {
          prompt: p.prompt,
          out: p.out,
          resolution: p.resolution,
          aspect: p.aspect,
          image: p.image,
          continues: p.continues,
          task: p.task,
        }),
      )
    },
  })
}
