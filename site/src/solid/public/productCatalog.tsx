import {
  Clapperboard,
  FileImage,
  Lightbulb,
  MonitorPlay,
  Presentation,
  Scissors,
  Sparkles,
} from 'lucide-solid'

export type ProductSlug =
  | 'launch-videos'
  | 'product-demos'
  | 'explainers'
  | 'pitch-decks'
  | 'video-editing'
  | 'asset-demos'
  | 'ai-footage'
export type ProductIcon =
  | 'clapperboard'
  | 'monitor-play'
  | 'lightbulb'
  | 'presentation'
  | 'scissors'
  | 'file-image'
  | 'sparkles'
export interface ProductEntry {
  slug: ProductSlug
  name: string
  nav: string
  badge?: string
  icon: ProductIcon
  href: string
  ctaLabel: string
  eyebrow: string
  title: string
  lede: string
  points: { h: string; p: string }[]
  sampleSrc?: string
  sampleCaption: string
  seoTitle: string
  /** Short Q&A shown on the page and marked up as FAQPage. */
  faq: [string, string][]
  /** The blog guide that goes deeper on this product. */
  guide: string
  /** What the closing line promises ("Your {endcap} is one sentence away"); defaults from the name. */
  endcap?: string
  seoDescription: string
}
export const carouselAsset = (name: string) =>
  `${(import.meta.env.VITE_CAROUSEL_ASSET_URL || 'https://s3.trypitch.co/carousel/carousel').replace(/\/$/, '')}/${name}`
const video = carouselAsset
const ICONS = {
  clapperboard: Clapperboard,
  'monitor-play': MonitorPlay,
  lightbulb: Lightbulb,
  presentation: Presentation,
  scissors: Scissors,
  'file-image': FileImage,
  sparkles: Sparkles,
}
export const ProductGlyph = (props: { icon: ProductIcon; size?: number }) => {
  const Icon = ICONS[props.icon]
  return <Icon size={props.size ?? 16} strokeWidth={1.75} aria-hidden />
}
export const PRODUCTS: ProductEntry[] = [
  {
    slug: 'launch-videos',
    name: 'Launch videos',
    nav: 'Cinematic 60-second launch films from one line.',
    badge: 'Hot',
    icon: 'clapperboard',
    href: '/new?flow=launch-video',
    ctaLabel: 'Make a launch video',
    eyebrow: 'Product · Launch videos',
    title: 'Launch films, from one sentence.',
    lede: 'Drop a URL and a line of direction. The agent visits your product, picks the moments worth showing, then narrates, scores and grades a cinematic 1080p launch video, ready for launch day.',
    points: [
      {
        h: 'Shot on the real product',
        p: 'No mockups or stock. The agent drives your live app in a browser and films what actually happens.',
      },
      {
        h: 'Narrated, scored, graded',
        p: 'A written VO in 40+ languages, a music bed and a colour grade. One pass, one place.',
      },
      {
        h: 'Every layer stays editable',
        p: 'Swap the voice, trim a scene or restyle a caption without a full re-render.',
      },
    ],
    sampleSrc: video('graphify.mp4'),
    sampleCaption: 'Graphify: “Make a 70-second launch video on graphify.com”',
    guide: 'best-ai-tools-for-product-launch-videos',
    faq: [
      [
        'How long is a launch video?',
        'Usually 30 to 70 seconds. Say the length you want in your brief and the agent plans the scenes to fit.',
      ],
      [
        'Do I need to write a script?',
        'No. The agent writes it from what it learns about your product. Paste your own lines if you already have them.',
      ],
      [
        'Can I change it after the first cut?',
        'Yes. Point at a scene or a time range and describe the change; only that part is redone.',
      ],
    ],
    seoTitle: 'Launch videos | AI launch video maker from a URL | Pitch',
    seoDescription:
      'Give Pitch a URL and one line of direction. An AI agent films your real product and cuts a narrated, scored 1080p launch video in minutes.',
  },
  {
    slug: 'product-demos',
    name: 'Product demos',
    nav: 'Narrated walkthroughs of your real user flows.',
    badge: 'Popular',
    icon: 'monitor-play',
    href: '/new?flow=demo-video',
    ctaLabel: 'Make a product demo',
    eyebrow: 'Product · Product demos',
    title: 'Demos that walk the real flow.',
    lede: 'Point Pitch at a flow such as onboarding, the core loop, or a single feature. It signs in, clicks through it end to end, and narrates each step as a clean demo video.',
    points: [
      {
        h: 'It actually uses the product',
        p: 'The agent completes the flow like a user would, so the demo shows the product working, not a slideshow.',
      },
      {
        h: 'Scene-by-scene narration',
        p: 'Each step gets a spoken beat explaining what is happening and why it matters.',
      },
      {
        h: 'Re-shoot on a prompt',
        p: 'Flow changed? Ask for a re-cut of the affected scene. The rest of the demo stays put.',
      },
    ],
    sampleSrc: video('demo.mp4'),
    sampleCaption: 'shadcn/ui: a narrated walkthrough of the component workflow',
    guide: 'zero-shot-demo-video-from-url',
    faq: [
      [
        'Can it demo a product behind a login?',
        'Yes. Give it a test account in your prompt and it signs in like a user would.',
      ],
      [
        'What happens when my UI changes?',
        'Ask for the affected scene to be re-shot. The rest of the demo stays as it was.',
      ],
      [
        'Can I choose the voice and language?',
        'Yes. Voice-over is available in more than 40 languages, and you can swap the voice after the first cut.',
      ],
    ],
    seoTitle: 'Product demos | AI product demo video generator | Pitch',
    seoDescription:
      'Pitch signs into your product, walks the real flow end to end and narrates it as a clean demo video. Point it at onboarding or one feature.',
  },
  {
    slug: 'explainers',
    name: 'Explainers',
    nav: 'Make the complex obvious in about 30 seconds.',
    icon: 'lightbulb',
    href: '/new?flow=demo-video',
    ctaLabel: 'Make an explainer',
    eyebrow: 'Product · Explainers',
    title: 'Make the complex obvious.',
    lede: 'For the concept that always needs a whiteboard. Pitch builds a tight explainer that frames the problem, shows the product solving it, and lands the point. It is short enough to drop in a thread.',
    points: [
      {
        h: 'Problem, product, payoff',
        p: 'A three-beat structure the agent fills with your real screens and a plain-language script.',
      },
      {
        h: 'Built for the timeline',
        p: 'Vertical or wide, 20–45 seconds, captioned by default for muted autoplay.',
      },
      {
        h: 'On-message every time',
        p: 'The agent reads your site and docs first, so the wording matches how you already describe it.',
      },
    ],
    sampleSrc: video('gtmcofounder.mp4'),
    sampleCaption: 'GTM Cofounder: a 40-second “what it does and why” explainer',
    guide: 'vertical-product-teaser-videos',
    faq: [
      [
        'How long is an explainer?',
        'Between 20 and 45 seconds, short enough to post in a thread or a feed.',
      ],
      [
        'Can I get a vertical version?',
        'Yes. Ask for wide, vertical or both; captions are on by default for muted autoplay.',
      ],
      [
        'Where does the wording come from?',
        'The agent reads your site and docs first, so the explainer uses the language you already use.',
      ],
    ],
    seoTitle: 'Explainers | AI explainer video maker | Pitch',
    seoDescription:
      'Turn the idea that needs a whiteboard into a 30-second explainer: problem, product, payoff. Built from your real screens, captioned for feeds.',
  },
  {
    slug: 'pitch-decks',
    name: 'Pitch decks',
    nav: 'Investor and sales decks from a brief, URL, or file.',
    icon: 'presentation',
    href: '/new?flow=deck',
    ctaLabel: 'Make a deck',
    eyebrow: 'Product · Pitch decks',
    title: 'Decks, built from what you have.',
    lede: 'Start with a brief, URL, PDF, or existing presentation. Pitch researches the subject, then writes and designs an investor pitch, sales one-pager, or board update as an editable deck.',
    points: [
      {
        h: 'Researched, not templated',
        p: 'It works from your source material and can research your positioning, pricing, and traction before it writes a single slide.',
      },
      {
        h: 'Structured like a real pitch',
        p: 'Problem, solution, market, product, model, and ask, with charts and tables where the numbers go.',
      },
      {
        h: 'Editable slide by slide',
        p: 'Every slide stays open in the editor. Restyle, reorder or rewrite before you export.',
      },
    ],
    sampleCaption: 'A 10-slide seed deck created from product research and a concise brief',
    guide: 'turn-a-pdf-or-website-into-an-investor-deck',
    faq: [
      [
        'What can I start a deck from?',
        'A brief, a URL, a PDF or an existing presentation. Attach it or paste the link.',
      ],
      [
        'Can I edit the slides myself?',
        'Yes. Every slide stays open in the editor for text and layout changes before you export.',
      ],
      [
        'Does the PDF match the editor?',
        'Yes. Export saves any pending edits first and renders from the same document.',
      ],
    ],
    seoTitle: 'Pitch decks | AI pitch deck generator | Pitch',
    seoDescription:
      'Pitch researches your product and market, then writes and designs an editable investor, sales or board deck you export as a PDF.',
  },
  {
    slug: 'video-editing',
    name: 'Video editing',
    nav: 'Upload any video and describe the edit.',
    badge: 'New',
    icon: 'scissors',
    href: '/new?flow=recording-edit',
    ctaLabel: 'Edit a video',
    eyebrow: 'Product · Video editing',
    title: 'Edit a video by describing it.',
    lede: 'Drop in a screen recording, an interview, a talk or camera footage and say what it needs. Pitch transcribes it, plans the cuts and renders a new version, so you review an edit instead of making one.',
    points: [
      {
        h: 'Write the edit, skip the timeline',
        p: 'Trim the intro, remove pauses and filler, add captions, lower the music or cut a shorter version, all in plain words.',
      },
      {
        h: 'Point at the moment',
        p: 'Select a time range in the preview and say what should change there. The rest of the video stays as it was.',
      },
      {
        h: 'Every render is kept',
        p: 'Your upload stays in the project and each new cut lands beside it, so an earlier version is always one click away.',
      },
    ],
    sampleCaption: '',
    endcap: 'next edit',
    guide: 'edit-a-video-by-chatting',
    faq: [
      [
        'What kind of video can I upload?',
        'Screen recordings, interviews, talks and camera footage in MP4, MOV, WEBM, MKV or AVI, up to 500 MB.',
      ],
      [
        'Which edits work from a sentence?',
        'Trims, cutting pauses and filler, captions, music level, and shorter or vertical cuts of a longer video.',
      ],
      [
        'Do I lose the original?',
        'No. Your upload stays in the project and every new render is saved beside it.',
      ],
    ],
    seoTitle: 'Video editing | AI video editor you direct in words | Pitch',
    seoDescription:
      'Upload a recording, interview or any video and describe the edit. Pitch cuts pauses, adds captions, fixes audio and renders a new version.',
  },
  {
    slug: 'asset-demos',
    name: 'Asset demos',
    nav: 'Narrated demos from PDFs and screenshots.',
    icon: 'file-image',
    href: '/new?flow=demo-video',
    ctaLabel: 'Make an asset demo',
    eyebrow: 'Product · Asset demos',
    title: 'Your screenshots, explained on camera.',
    lede: 'No live product to film yet? Upload PDFs, mockups or screenshots. Pitch builds a storyboard from what the pages actually show, moves the camera across them and narrates the story.',
    points: [
      {
        h: 'Grounded in your pages',
        p: 'Every claim comes from the files you upload. Nothing is invented to fill a gap.',
      },
      {
        h: 'A storyboard you can review',
        p: 'See the planned shots and narration before anything renders, and reorder or cut scenes first.',
      },
      {
        h: 'Camera moves with intent',
        p: 'Pans and zooms land on the part of the page each line of narration is about.',
      },
    ],
    sampleCaption: '',
    guide: 'best-ai-product-demo-video-tools',
    faq: [
      ['Which files can I use?', 'PDFs and images such as PNG, JPG and WEBP, up to 50 MB each.'],
      [
        'Will it make things up?',
        'No. The narration and visuals are grounded in the pages you upload, not invented to fill gaps.',
      ],
      [
        'Can I review before it renders?',
        'Yes. You see the storyboard, shots and narration first, and can reorder or cut scenes.',
      ],
    ],
    seoTitle: 'Asset demos | Demo videos from PDFs and screenshots | Pitch',
    seoDescription:
      'Turn PDFs, mockups and screenshots into a narrated demo video. Pitch storyboards from your pages and moves the camera to the right detail.',
  },
  {
    slug: 'ai-footage',
    name: 'AI footage',
    nav: 'Generated shots for the moments nobody filmed.',
    icon: 'sparkles',
    href: '/new?flow=launch-video',
    ctaLabel: 'Start a film',
    eyebrow: 'Product · AI footage',
    title: 'The shot you could not film.',
    lede: 'Establishing shots, textures behind a title, a visual metaphor for a line of narration. Pitch generates short clips with their own sound and cuts them in beside the footage of your real product.',
    points: [
      {
        h: 'Made to sit beside your product',
        p: 'Generated clips fill the gaps around real screens. Your interface is always filmed, never imagined.',
      },
      {
        h: 'Wide or vertical, up to 4K',
        p: 'Clips of around ten seconds in 16:9 or 9:16, from quick drafts to 4K finals.',
      },
      {
        h: 'Sound included',
        p: 'Each clip arrives with its own audio, ready to sit under the voice-over and music.',
      },
    ],
    sampleCaption: '',
    endcap: 'missing shot',
    guide: 'best-ai-tools-for-product-launch-videos',
    faq: [
      [
        'Can it generate my product interface?',
        'No. Your interface is always filmed from the real product; generated clips cover shots with no source, like establishing shots and B-roll.',
      ],
      [
        'How long are the clips?',
        'Around ten seconds each, in 16:9 or 9:16, from quick drafts up to 4K.',
      ],
      [
        'Is a clip billed if I do not use it?',
        'Yes. Generation is billed when it runs, so the agent plans the shot before generating it.',
      ],
    ],
    seoTitle: 'AI footage | Generated B-roll and establishing shots | Pitch',
    seoDescription:
      'Generate establishing shots and B-roll nobody filmed, with sound, in 16:9 or 9:16 up to 4K, and cut them in beside your real product.',
  },
]
export const productBySlug = (slug: string) => PRODUCTS.find(product => product.slug === slug)
