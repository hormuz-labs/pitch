/**
 * "What kind?" — the one creative choice the composer asks for.
 *
 * Everything else about a project the agent decides: the look, the moves, the
 * colours, the music. But *kind* is not a look — a teaser and a product
 * walkthrough are different films from the same brief, and the agent guessing
 * wrong costs a whole build. So the new-project page offers the kinds its
 * skill can actually make, the user picks one chip, and it arrives here.
 *
 * `direction` is what the agent reads. It is written as an instruction, not a
 * label, because "style: teaser" in an options list changes nothing — the
 * sentence has to say what the film DOES differently.
 *
 * The ids and labels are mirrored in apps/web/src/lib/skillPresets.tsx, the
 * same way STUDIO_SKILLS mirrors the skill pills.
 */

export interface StudioStyle {
  id: string
  /** The skill whose chips offer it. */
  skill: string
  label: string
  /** One instruction, appended to the first turn's <studio-context>. */
  direction: string
}

export const STUDIO_STYLES: StudioStyle[] = [
  // Launch videos — the GSAP shot-list engine.
  {
    id: 'kinetic-type',
    skill: 'launch-video',
    label: 'Kinetic typography',
    direction:
      'Type carries the film: words arriving a word at a time, the accent word last, the stage a colour field rather than a screenshot. The product appears late and briefly.',
  },
  {
    id: 'cinematic',
    skill: 'launch-video',
    label: 'Cinematic',
    direction:
      'A film, not a promo: fewer and longer shots, slow pushes and long dissolves over hard cuts, generated or photographic footage under the type (generated-video), narration in a measured register, music that builds. Keep the density notes answered with movement inside the shot, not more cuts.',
  },
  {
    id: 'motion-3d',
    skill: 'launch-video',
    label: '3D animation',
    direction:
      'Dimensional motion: forms turning in space, the product on a device that rotates, depth and light rather than flat cards. Draw from the effects lab families `devices` and `morph` and the three.js ports (`motion_effects({ libs: ["three"] })`), and let the object that crosses every cut be a solid the camera moves around.',
  },
  {
    id: 'product-walkthrough',
    skill: 'launch-video',
    label: 'Product walkthrough',
    direction:
      'The product itself is the subject: real screens, one control at a time, a cursor that does something in every shot, pushes into the part the copy is about. Type is a caption on the work, never the whole frame.',
  },
  {
    id: 'teaser',
    skill: 'launch-video',
    label: 'Teaser',
    direction:
      'Short and withholding — aim under 20 seconds, a handful of words, one reveal, and end on the mark or a date. Say what it feels like, not what it does; no feature list.',
  },

  // Product demos — the live recording pipeline.
  {
    id: 'full-walkthrough',
    skill: 'demo-video',
    label: 'Full walkthrough',
    direction:
      'The core flow end to end, in order, nothing skipped. Narrate as someone showing a colleague the whole path from empty state to result.',
  },
  {
    id: 'feature-spotlight',
    skill: 'demo-video',
    label: 'Feature spotlight',
    direction:
      'One feature only. Open already inside the product, zoom close and stay close, and spend the whole runtime on that one thing rather than touring around it.',
  },
  {
    id: 'onboarding-tour',
    skill: 'demo-video',
    label: 'Onboarding tour',
    direction:
      "A brand-new user's first session: sign-up or empty state through to their first real result. Narrate in second person and name every click before you make it.",
  },
  {
    id: 'how-to',
    skill: 'demo-video',
    label: 'How-to tutorial',
    direction:
      'One task, taught in numbered steps. Slower than a demo: say the step, do it, let the result settle before moving on, and recap at the end.',
  },
  {
    id: 'sales-demo',
    skill: 'demo-video',
    label: 'Sales demo',
    direction:
      'Outcome first. Lead with what the viewer gets, show only the clicks that prove it, keep the language about their problem rather than the interface, and end on the next step.',
  },

  // Slide decks.
  {
    id: 'pitch-deck',
    skill: 'slide-deck',
    label: 'Pitch deck',
    direction:
      'An investor narrative: problem, insight, product, traction, market, team, ask. One claim per slide, big type, numbers that carry the argument.',
  },
  {
    id: 'keynote',
    skill: 'slide-deck',
    label: 'Keynote',
    direction:
      'Slides behind a speaker: a few words each, enormous type, one image or one number per slide. Nothing that has to be read while someone is talking.',
  },
  {
    id: 'report-deck',
    skill: 'slide-deck',
    label: 'Report',
    direction:
      'Data first: every slide a chart or a table with the finding as its headline, sources named, and a summary slide that states the conclusions.',
  },
  {
    id: 'training-deck',
    skill: 'slide-deck',
    label: 'Training',
    direction:
      'Teaching material read without a presenter: sections, complete sentences, worked examples, and a recap slide at the end of each section.',
  },

  // Recording edits.
  {
    id: 'light-polish',
    skill: 'recording-edit',
    label: 'Light polish',
    direction:
      'Keep the recording as it was recorded. Steady the frame, cut the dead air, add captions, and zoom only where the speaker clearly points at something.',
  },
  {
    id: 'tightened-tutorial',
    skill: 'recording-edit',
    label: 'Tightened tutorial',
    direction:
      'Cut hard: pauses, mistakes and self-corrections go, and every action gets a zoom onto the control it touches.',
  },
  {
    id: 'short-clips',
    skill: 'recording-edit',
    label: 'Short clips',
    direction:
      'Pull the self-contained moments out as short vertical clips with captions, each one standing on its own from its first second.',
  },
  {
    id: 'highlight-recap',
    skill: 'recording-edit',
    label: 'Highlight recap',
    direction:
      'One short recap of the key moments only, in the original order, with everything between them dropped.',
  },

  // Docs to video.
  {
    id: 'doc-walkthrough',
    skill: 'docs-to-video',
    label: 'Narrated walkthrough',
    direction:
      'Follow the document in its own order, page by page, narrating what each page says and showing the page it came from.',
  },
  {
    id: 'doc-explainer',
    skill: 'docs-to-video',
    label: 'Explainer',
    direction:
      "Rebuild the document's argument as designed motion — the pages are the source, not the picture. Explain the idea; do not tour the file.",
  },
  {
    id: 'doc-summary',
    skill: 'docs-to-video',
    label: 'Short summary',
    direction:
      'Under a minute: the three or four things a reader would take away, and nothing else.',
  },
  {
    id: 'doc-data-story',
    skill: 'docs-to-video',
    label: 'Data story',
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
  return style ? `The user chose the "${style.label}" kind: ${style.direction}` : null
}
