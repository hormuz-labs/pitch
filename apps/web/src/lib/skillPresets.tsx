/**
 * The studio's skills, as offered on the new-project page.
 *
 * A skill is a hint, not a mode: picking one primes the composer with a
 * tagline, shows the templates that skill can start from, and rides along to
 * the agent as a `skill` creation option. Nothing is locked — the agent still
 * reads the request and picks the pipeline, and the user can clear the chip
 * and type whatever they want.
 */
import {
  Clapperboard,
  FilePlay,
  type LucideIcon,
  MonitorPlay,
  Presentation,
  Rocket,
} from 'lucide-react'
import { DECK_TEMPLATES } from './deckTemplates'

export type SkillId =
  | 'launch-video'
  | 'demo-video'
  | 'slide-deck'
  | 'recording-edit'
  | 'docs-to-video'

export interface SkillTemplate {
  id: string
  name: string
  blurb: string
  /** Two-stop gradient behind the card thumb. */
  swatch: [string, string]
  /** Fills the composer; `select` is the substring left highlighted. */
  prompt?: string
  select?: string
  /** A real deck design — opens the deck gallery at that preset instead. */
  deckTemplateId?: string
}

export interface SkillPreset {
  id: SkillId
  label: string
  icon: LucideIcon
  /** Composer placeholder while the skill is selected. */
  tagline: string
  templates: SkillTemplate[]
}

export const SKILLS: SkillPreset[] = [
  {
    id: 'launch-video',
    label: 'Launch videos',
    icon: Rocket,
    tagline: 'A launch video for your product — paste a URL or describe it.',
    templates: [
      {
        id: 'product-launch',
        name: 'Product launch',
        blurb: 'A punchy launch video built from your product page.',
        swatch: ['#dde6f7', '#b7c8ec'],
        prompt: 'A launch video for https://yourproduct.com.',
        select: 'https://yourproduct.com',
      },
      {
        id: 'brand-documentary',
        name: 'Brand documentary',
        blurb: 'A cinematic film about your origin, customers and point of view.',
        swatch: ['#f0e7da', '#ddc9ac'],
        prompt: 'A cinematic brand documentary about our origin, customers and point of view.',
        select: 'brand documentary',
      },
      {
        id: 'deep-dive-explainer',
        name: 'Deep-dive explainer',
        blurb: 'Makes a complex topic feel obvious.',
        swatch: ['#e2eee4', '#bcd6c2'],
        prompt: 'A clear deep-dive explainer that makes this complex topic feel obvious.',
        select: 'complex topic',
      },
      {
        id: 'match-reference',
        name: 'Match a reference',
        blurb: 'Borrows the pacing and visual language of a video you love.',
        swatch: ['#eee4f0', '#d5bfdd'],
        prompt: 'Match the pacing and visual language of this YouTube video: https://youtube.com/.',
        select: 'https://youtube.com/',
      },
    ],
  },
  {
    id: 'demo-video',
    label: 'Product demos',
    icon: MonitorPlay,
    tagline: 'A product demo that walks through what it does.',
    templates: [
      {
        id: 'product-walkthrough',
        name: 'Product walkthrough',
        blurb: 'The core flow, end to end, recorded from the real product.',
        swatch: ['#ddeef4', '#b4d6e4'],
        prompt: 'A product walkthrough of https://yourproduct.com — show the core flow end to end.',
        select: 'https://yourproduct.com',
      },
      {
        id: 'feature-highlight',
        name: 'Feature highlight',
        blurb: 'Thirty seconds on the one feature worth shouting about.',
        swatch: ['#f4e4de', '#e6c3b6'],
        prompt: 'A 30-second feature highlight of our newest feature.',
        select: 'newest feature',
      },
      {
        id: 'onboarding-tour',
        name: 'Onboarding tour',
        blurb: 'From sign-up to the first win, for brand-new users.',
        swatch: ['#e6e4f4', '#c6c2e8'],
        prompt: 'An onboarding tour that takes new users from sign-up to their first win.',
        select: 'first win',
      },
      {
        id: 'changelog-recap',
        name: 'Changelog recap',
        blurb: 'Release notes turned into a punchy demo.',
        swatch: ['#e9f0db', '#cbdca6'],
        prompt: 'Turn these release notes into a punchy changelog demo: paste notes here.',
        select: 'paste notes here',
      },
    ],
  },
  {
    id: 'slide-deck',
    label: 'Slides',
    icon: Presentation,
    tagline: 'Turn your ideas into stunning slides in minutes.',
    templates: DECK_TEMPLATES.map(template => ({
      id: template.id,
      name: template.name,
      blurb: template.blurb,
      swatch: [template.swatch[0], template.swatch[2]] as [string, string],
      deckTemplateId: template.id,
    })),
  },
  {
    id: 'recording-edit',
    label: 'Recording edits',
    icon: Clapperboard,
    tagline: 'Edit a recording — attach it, or drop it anywhere on this page.',
    templates: [
      {
        id: 'talking-head',
        name: 'Talking head polish',
        blurb: 'Captions, clean cuts and a steady frame.',
        swatch: ['#f2e3e6', '#e2bcc4'],
        prompt:
          'Turn this recording into a polished talking-head video with captions and clean cuts.',
        select: 'this recording',
      },
      {
        id: 'podcast-clips',
        name: 'Podcast → clips',
        blurb: 'Short vertical clips with captions, pulled from an episode.',
        swatch: ['#e3ecf2', '#b8cfdc'],
        prompt: 'Cut this podcast episode into short vertical clips with captions.',
        select: 'this podcast episode',
      },
      {
        id: 'tutorial-edit',
        name: 'Tutorial edit',
        blurb: 'Pauses and mistakes removed, zooms on the important parts.',
        swatch: ['#e8e9ef', '#c3c6d6'],
        prompt:
          'Tighten this tutorial recording: remove pauses and mistakes, add zooms on the important parts.',
        select: 'this tutorial recording',
      },
      {
        id: 'webinar-recap',
        name: 'Webinar recap',
        blurb: 'An hour of webinar in sixty seconds of key moments.',
        swatch: ['#f0ecdf', '#ddd2b2'],
        prompt: 'Turn this webinar recording into a 60-second recap with the key moments.',
        select: 'this webinar recording',
      },
    ],
  },
  {
    id: 'docs-to-video',
    label: 'Docs to video',
    icon: FilePlay,
    tagline: 'Turn a PDF, doc or article into a narrated video — attach it or paste a link.',
    templates: [
      {
        id: 'pdf-walkthrough',
        name: 'PDF walkthrough',
        blurb: 'Your PDF as a narrated video, page by page.',
        swatch: ['#e5e5ea', '#c2c2cf'],
        prompt: 'Turn this PDF into a narrated video walkthrough of the key pages.',
        select: 'this PDF',
      },
      {
        id: 'article-to-video',
        name: 'Article → video',
        blurb: 'A concise visual story out of a link.',
        swatch: ['#dfe9ec', '#aec8d1'],
        prompt: 'Turn this article into a concise visual story: https://example.com/article.',
        select: 'https://example.com/article',
      },
      {
        id: 'report-explainer',
        name: 'Report explainer',
        blurb: 'The key numbers from a report, told simply.',
        swatch: ['#e9e2f2', '#c9b8e0'],
        prompt: 'Turn this report into a short explainer video with the key numbers.',
        select: 'this report',
      },
      {
        id: 'slides-to-video',
        name: 'Slides → video',
        blurb: 'A deck becomes a video presentation with voiceover.',
        swatch: ['#f4e8dc', '#e8cbae'],
        prompt: 'Turn these slides into a video presentation with voiceover.',
        select: 'these slides',
      },
    ],
  },
]

/** Legacy `?flow=` links land on the matching skill. */
export const FLOW_TO_SKILL: Record<string, SkillId> = {
  'launch-video': 'launch-video',
  'demo-video': 'demo-video',
  deck: 'slide-deck',
  'recording-edit': 'recording-edit',
}
