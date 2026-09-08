/**
 * Slide-deck flow tools. The deck is `deck.html` in the workspace: one
 * document, one `.slide` element per 1280×720 page. The agent edits it with
 * the sandboxed file tools (or regenerates it with pitch pdf build); these host
 * tools render pages for inspection and publish the result — HTML plus a
 * freshly rendered PDF — as the project's outputs.
 */

import { Type } from '@sinclair/typebox'
import { workspaceOf } from '../lib/paths.ts'
import { hostAction, text } from '../lib/studio-host.ts'
import type { CommandSpec } from './registry.ts'

export default function deckCommands(): CommandSpec[] {
  const commands: CommandSpec[] = []
  commands.push({
    verb: 'render',
    description:
      'Render deck.html to JPEGs (one per .slide, 1280×720) under renders/slide-NN.jpg in your workspace so ' +
      'you can LOOK at the result with the read tool before publishing; each line also flags elements ' +
      'that overflow their page. Pass `slides` to render a subset (1-based).',
    parameters: Type.Object({
      slides: Type.Optional(
        Type.Array(Type.Integer({ minimum: 1 }), {
          description: '1-based slide numbers (default all)',
        }),
      ),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx: any) {
      return text(await hostAction(workspaceOf(ctx), 'deck_render', { slides: p.slides }))
    },
  })

  commands.push({
    verb: 'publish',
    description:
      "Publish deck.html as the project's deck: renders a fresh PDF (one 1280×720 page per .slide), uploads the HTML and the PDF and records them as the project's outputs. Once per turn, after the QA renders are clean; never with placeholder text or broken images.",
    parameters: Type.Object({
      summary: Type.String({ description: 'One line describing what changed (shown to the user)' }),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx: any) {
      return text(await hostAction(workspaceOf(ctx), 'deck_publish', { summary: p.summary }))
    },
  })
  return commands
}
