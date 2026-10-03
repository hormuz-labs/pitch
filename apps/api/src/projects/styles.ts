/**
 * "What kind?" — the one creative choice the agent asks the user for.
 *
 * Everything else about a project the agent decides: the look, the moves, the
 * colours, the music. But *kind* is not a look — a teaser and a product
 * walkthrough are different films from the same brief, and the agent guessing
 * wrong costs a whole build. So the agent asks with `ask_user` (bound to
 * `videoType`), offering the ids of the kinds that fit, and the pick arrives
 * here.
 *
 * Most users are not motion designers: "kinetic typography" or "cinematic"
 * tells them nothing about what they will get. So `label` and `hint` are what
 * the person sees, in words about the outcome, and the studio writes them onto
 * the question card itself (studio/session.ts parseAsk) rather than letting
 * the agent phrase them anew each time.
 *
 * `direction` is what the agent reads. It is written as an instruction, not a
 * label, because "style: teaser" in an options list changes nothing — the
 * sentence has to say what the film DOES differently.
 */

export interface StudioStyle {
  id: string
  /** The skill whose outcome it is a kind of. */
  skill: string
  /** The words on the button, about what the user gets. */
  label: string
  /** One plain line under the label: what this kind looks like. */
  hint: string
  /** One instruction, appended to the first turn's <studio-context>. */
  direction: string
}

export const STUDIO_STYLES: StudioStyle[] = [
  // Launch videos — the GSAP shot-list engine.
  {
    id: 'kinetic-type',
    skill: 'launch-video',
    label: 'Let the words do it',
    hint: 'Big animated words carry the message, with little product on screen',
    direction:
      'Language and typography carry the idea. Choose whole phrases, paced word reveals or layout transformations to suit the copy; keep essential words stable long enough to read. Product evidence appears where it makes the message concrete.',
  },
  {
    id: 'cinematic',
    skill: 'launch-video',
    label: 'Announce the launch',
    hint: 'A bold film built around one idea about your product',
    direction:
      'Build a cinematic idea through deliberate framing, light, atmosphere and contrast between movement and stillness. Use product imagery, objects or sourced/generated footage where the concept needs it. One lead movement at a time; preserve readable holds. Narration and music follow the brief, not this preset.',
  },
  {
    id: 'motion-3d',
    skill: 'launch-video',
    label: 'Show it in 3D',
    hint: 'For physical products, or anything with layers and parts',
    direction:
      'Use geometry, material, lighting and camera movement to explain or reveal the subject in space. Keep depth and object motion purposeful; design connected shots without requiring a rotating device or persistent object at every cut.',
  },
  {
    id: 'product-walkthrough',
    skill: 'launch-video',
    label: 'Show how it works',
    hint: 'Your real screens, step by step, ending on the result',
    direction:
      'The product itself is the subject: one real workflow from input to result. Lead the eye through it in order: the camera pushes to each control as it is used, every action lands on a beat with a visible result, and the result gets the biggest moment.',
  },
  {
    id: 'teaser',
    skill: 'launch-video',
    label: 'Build hype',
    hint: 'Short, holds back the reveal, ends on the name or date',
    direction:
      'Build anticipation around one product-specific reveal, with minimal copy and a clear ending. Keep it concise, letting the reveal and its payoff determine runtime within the user brief; avoid a feature list.',
  },

  // Product demos — the live recording pipeline.
  {
    id: 'full-walkthrough',
    skill: 'demo-video',
    label: 'Full walkthrough',
    hint: 'The whole flow, start to finish, nothing skipped',
    direction:
      'The core flow end to end, in order, nothing skipped. Narrate as someone showing a colleague the whole path from empty state to result.',
  },
  {
    id: 'feature-spotlight',
    skill: 'demo-video',
    label: 'Feature spotlight',
    hint: 'One feature: where it is, what you do, what you get',
    direction:
      'Demonstrate one feature and the result it enables. Establish enough context to orient the viewer, focus on the relevant action, then show the outcome. Zoom out when the view changes; avoid unrelated tours.',
  },
  {
    id: 'onboarding-tour',
    skill: 'demo-video',
    label: 'Onboarding tour',
    hint: "A new user's path from setup to a first real result",
    direction:
      "A brand-new user's path from setup or empty state to a first real result. Explain the purpose of consequential steps and show their outcome; avoid narrating every incidental click.",
  },
  {
    id: 'how-to',
    skill: 'demo-video',
    label: 'How-to tutorial',
    hint: 'One task taught step by step, slower, with a recap',
    direction:
      'One task, taught in numbered steps. Slower than a demo: say the step, do it, let the result settle before moving on, and recap at the end.',
  },
  {
    id: 'sales-demo',
    skill: 'demo-video',
    label: 'Sales demo',
    hint: 'What the viewer gets first, then only the clicks that prove it',
    direction:
      'Outcome first. Lead with what the viewer gets, show only the clicks that prove it, keep the language about their problem rather than the interface, and end on the next step.',
  },

  // Slide decks.
  {
    id: 'pitch-deck',
    skill: 'slide-deck',
    label: 'Pitch deck',
    hint: 'For investors: problem, product, traction, the ask',
    direction:
      'An investor narrative: problem, insight, product, traction, market, team, ask. One claim per slide, big type, numbers that carry the argument.',
  },
  {
    id: 'keynote',
    skill: 'slide-deck',
    label: 'Keynote',
    hint: 'Few words and huge type, made to talk over',
    direction:
      'Slides behind a speaker: a few words each, enormous type, one image or one number per slide. Nothing that has to be read while someone is talking.',
  },
  {
    id: 'report-deck',
    skill: 'slide-deck',
    label: 'Report',
    hint: 'Charts and findings, with sources named',
    direction:
      'Data first: every slide a chart or a table with the finding as its headline, sources named, and a summary slide that states the conclusions.',
  },
  {
    id: 'training-deck',
    skill: 'slide-deck',
    label: 'Training',
    hint: 'Reads on its own: sections, examples, recaps',
    direction:
      'Teaching material read without a presenter: sections, complete sentences, worked examples, and a recap slide at the end of each section.',
  },

  // Recording edits.
  {
    id: 'light-polish',
    skill: 'recording-edit',
    label: 'Light polish',
    hint: 'Kept as recorded: dead air out, captions in',
    direction:
      'Keep the recording as it was recorded. Steady the frame, cut the dead air, add captions, and zoom only where the speaker clearly points at something.',
  },
  {
    id: 'tightened-tutorial',
    skill: 'recording-edit',
    label: 'Tightened tutorial',
    hint: 'Mistakes and waiting cut, still easy to follow',
    direction:
      'Remove dead time, mistakes and redundant explanation while retaining the context and pauses needed to follow the task. Zoom only onto consequential controls or results; keep camera movement restrained.',
  },
  {
    id: 'short-clips',
    skill: 'recording-edit',
    label: 'Short clips',
    hint: 'Vertical clips with captions, each one standing alone',
    direction:
      'Pull the self-contained moments out as short vertical clips with captions, each one standing on its own from its first second.',
  },
  {
    id: 'highlight-recap',
    skill: 'recording-edit',
    label: 'Highlight recap',
    hint: 'Only the key moments, in the original order',
    direction:
      'One short recap of the key moments only, in the original order, with everything between them dropped.',
  },

  // Docs to video.
  {
    id: 'doc-walkthrough',
    skill: 'docs-to-video',
    label: 'Narrated walkthrough',
    hint: 'Page by page, narrated, showing each page',
    direction:
      'Follow the document in its own order, page by page, narrating what each page says and showing the page it came from.',
  },
  {
    id: 'doc-explainer',
    skill: 'docs-to-video',
    label: 'Explainer',
    hint: 'The idea rebuilt as motion, not a tour of the file',
    direction:
      "Rebuild the document's argument as designed motion — the pages are the source, not the picture. Explain the idea; do not tour the file.",
  },
  {
    id: 'doc-summary',
    skill: 'docs-to-video',
    label: 'Short summary',
    hint: 'Only the most important takeaways, kept short',
    direction:
      'A concise account of the document’s most important takeaways. Select only what supports the audience’s understanding, with sourced evidence and readable timing; use the requested runtime as a target unless explicitly capped.',
  },
  {
    id: 'doc-data-story',
    skill: 'docs-to-video',
    label: 'Data story',
    hint: "The document's numbers, animated to make the point",
    direction:
      "The document's numbers, animated in the order that makes the point, each one on screen long enough to read and labelled with where it came from.",
  },
]

const BY_ID = new Map(STUDIO_STYLES.map(s => [s.id, s]))

export const findStyle = (id: unknown): StudioStyle | undefined =>
  typeof id === 'string' ? BY_ID.get(id) : undefined

/** The line the agent reads on the first turn, or null when nothing was picked. */
export function styleDirection(id: unknown): string | null {
  const style = findStyle(id)
  return style
    ? `Selected kind: "${style.label}". Starting direction (the current brief overrides this preference): ${style.direction}`
    : null
}

/** The card's "you decide" option: no kind is stored, the agent takes its own pick. */
export const AUTO_KIND = {
  id: 'auto',
  label: 'Let Pitch choose',
  hint: 'Pitch picks what fits your product best',
} as const

/** The kinds the agent may offer, per outcome: ids plus the label the user will see. Short, since it rides every turn until a kind is picked. */
export function kindMenu(): string {
  const bySkill = new Map<string, string[]>()
  for (const s of STUDIO_STYLES)
    bySkill.set(s.skill, [...(bySkill.get(s.skill) ?? []), `${s.id} ("${s.label}")`])
  return [...bySkill].map(([skill, kinds]) => `${skill}: ${kinds.join('; ')}`).join('\n')
}
