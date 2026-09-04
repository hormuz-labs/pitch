/**
 * Slide-deck flow tools. The deck is `deck.html` in the workspace: one
 * document, one `.slide` element per 1280×720 page. The agent edits it with
 * the sandboxed file tools (or regenerates it with pdf_build); these host
 * tools render pages for inspection and publish the result — HTML plus a
 * freshly rendered PDF — as the project's outputs.
 */
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type } from '@sinclair/typebox'
import { hostAction, text } from '../lib/studio-host.ts'

export default function deckTools(pi: ExtensionAPI) {
  pi.registerTool({
    name: 'deck_render',
    label: 'Render slides',
    description:
      'Render deck.html to PNGs (one per .slide, 1280×720) under renders/slide-NN.png in your workspace so ' +
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
      return text(await hostAction(ctx.cwd, 'deck_render', { slides: p.slides }))
    },
  })

  pi.registerTool({
    name: 'deck_publish',
    label: 'Publish deck',
    description:
      "Publish deck.html as the project's slide deck: renders a fresh PDF from it (build/output.pdf, one " +
      "1280×720 page per .slide), uploads both the HTML and the PDF, and records them as the project's " +
      "outputs (the user's Download buttons). Call it once per turn, after the QA renders confirmed every " +
      'slide is clean. Never publish a deck with template placeholder text or broken image paths.',
    parameters: Type.Object({
      summary: Type.String({ description: 'One line describing what changed (shown to the user)' }),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx: any) {
      return text(await hostAction(ctx.cwd, 'deck_publish', { summary: p.summary }))
    },
  })
}
