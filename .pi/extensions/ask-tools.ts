/**
 * Asking the user, with buttons.
 *
 * "Make me a launch video" is not one brief — it is a cinematic film, a
 * product walkthrough, a 3D render, a teaser, and each is a different film.
 * The agent used to guess, and a guess that lands wrong costs a whole build.
 *
 * So it asks. But a question typed into the chat is a question the user has
 * to answer by typing, and the answers that matter here are a short closed
 * list. This tool renders the question as CLICKABLE OPTIONS in the studio
 * thread: the studio recognises the call by name (apps/api/src/studio/
 * session.ts) and draws the chips, and the click comes back as an ordinary
 * user message.
 *
 * It does not block. The tool returns as soon as the question is on screen;
 * the agent then ENDS ITS TURN and the answer arrives as the next prompt.
 * Nothing waits inside the sandbox, so there is no host action here — the
 * arguments themselves are the whole payload.
 */
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type } from '@sinclair/typebox'
import { text } from '../lib/studio-host.ts'

const Option = Type.Object({
  label: Type.String({
    description: 'The words on the button — a few, in the user\'s language, e.g. "Cinematic"',
  }),
  hint: Type.Optional(
    Type.String({
      description: 'One short line under the label saying what it means for the film',
    }),
  ),
})

const Question = Type.Object({
  id: Type.String({ description: 'Short key for this question, e.g. "style" or "focus"' }),
  question: Type.String({ description: 'The question itself, one line' }),
  options: Type.Array(Option, {
    description:
      '2–6 options. Put the one you would pick yourself first — it is shown as the default.',
  }),
  multi: Type.Optional(
    Type.Boolean({
      description: 'True when several answers can be picked at once (default false)',
    }),
  ),
})

export default function askTools(pi: ExtensionAPI) {
  pi.registerTool({
    name: 'ask_user',
    label: 'Ask the user',
    description:
      'Ask the user up to three questions as CLICKABLE OPTIONS in the chat. Use it when the request names an outcome but not which kind of it — "a launch video" is a cinematic film, a product walkthrough, a 3D render or a teaser, and they are different films — or, once you know the product, which part of it the piece is about. Ask ALL of it in ONE call, give every question a first option you would pick yourself, then END YOUR TURN and wait: the answer arrives as their next message. Never ask about the look, the moves, the colours, the fonts or the music, and never ask twice.',
    parameters: Type.Object({
      intro: Type.Optional(
        Type.String({
          description:
            'One line before the questions, e.g. what you already know about the product',
        }),
      ),
      questions: Type.Array(Question, {
        description: 'One to three questions. More than three is an interrogation, not a brief.',
      }),
    }),
    async execute(_id, p: any) {
      const questions = Array.isArray(p?.questions) ? p.questions.slice(0, 3) : []
      if (!questions.length) return text('No questions given — nothing was shown to the user.')
      return text(
        `Asked: ${questions.map((q: any) => q.id).join(', ')}. The options are on screen now. ` +
          'End your turn without doing any more work — their answer will arrive as the next message. ' +
          'If they answer "you decide", take your own first option for each and say so.',
      )
    },
  })
}
