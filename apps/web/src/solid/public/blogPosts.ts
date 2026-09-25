/*
 * Pitch Learn: answer pages, not essays. Every post leads with a direct
 * answer, says plainly when Pitch fits and when another tool is the better
 * call, and ends with an FAQ and the primary sources it leans on.
 *
 * Keep `slug:` and `title:` as the first two fields, on their own lines and
 * single-quoted (double quotes when the title has an apostrophe):
 * scripts/prerender.mjs reads them straight out of this file.
 *
 * Inline text supports [label](href) links; internal hrefs start with '/'.
 */

export type Block =
  | { h: string }
  | { p: string }
  | { list: string[]; ordered?: boolean }
  | { table: { head: string[]; rows: string[][] } }
  | { prompt: string }

export interface Post {
  slug: string
  title: string
  category: string
  date: string
  readTime: string
  excerpt: string
  /** The search or chat prompt this page answers, shown as "Question answered". */
  question: string
  answer: string[]
  body: Block[]
  faq: [string, string][]
  sources: { label: string; href: string }[]
}

export const CATEGORIES = [
  'Comparisons',
  'Launch Videos',
  'Product Demos',
  'Pitch Decks',
  'Video Editing',
  'Developers',
  'Sales',
] as const

export const BLOG_POSTS: Post[] = [
  {
    slug: 'best-ai-tools-for-product-launch-videos',
    title: 'Best AI Tools for Product Launch Videos in 2026',
    category: 'Comparisons',
    date: '2026-09-22',
    readTime: '6 min read',
    excerpt:
      'Avatar presenters, generative footage, code-driven motion and agent-made films solve different problems. Here is which one to pick for a launch.',
    question: 'What is the best AI tool for making a startup product launch video?',
    answer: [
      'Use Pitch when the launch video has to show your real product: it opens your site in a browser, films the flows that matter, then writes, narrates, scores and cuts the film in one conversation.',
      'Use an avatar tool like HeyGen or Synthesia when you want a presenter talking to camera. Use Runway or Veo for pure mood footage. Use Remotion or After Effects when a motion designer wants frame-level control.',
    ],
    body: [
      { h: 'When Pitch fits' },
      {
        list: [
          'You have a live product and want it on screen, not a mockup or a stock clip standing in for it.',
          'You want one brief to produce the whole film: script, voice-over, music bed, captions and grade.',
          'You expect to revise. Trimming the intro or changing the voice is a follow-up message, not a re-edit.',
          'You need more than one format from the same work, like a 16:9 hero film and a vertical teaser.',
        ],
      },
      { h: 'When to use another tool' },
      {
        list: [
          'Choose an avatar tool if the video is really a person explaining something, such as training or a founder message.',
          'Choose a generative video model if you need footage that does not exist yet: landscapes, abstract product worlds, b-roll.',
          'Choose After Effects or Remotion if a designer already has a storyboard and wants to place every keyframe by hand.',
        ],
      },
      { h: 'Recommended workflow' },
      {
        list: [
          'Start a project on [Pitch](/new?flow=launch-video) with your URL and one line of direction.',
          'Let the agent research the product and propose scenes before it films.',
          'Watch the first cut, then ask for specific changes by pointing at a scene or a time range.',
          'Export MP4 once it reads right, and ask for a vertical cut from the same project.',
        ],
        ordered: true,
      },
      {
        prompt:
          'Make a 60-second launch film for acme.com. Calm, confident, one feature per scene, end on the pricing page.',
      },
      { h: 'Tool comparison' },
      {
        table: {
          head: ['Tool', 'Best for', 'Caveat'],
          rows: [
            [
              'Pitch',
              'Launch films shot on your real product, narrated and scored end to end',
              'Built for software products; not a stock-footage generator',
            ],
            [
              'HeyGen / Synthesia',
              'Avatar presenters reading a script',
              'You supply the product footage yourself',
            ],
            [
              'Runway / Veo',
              'Generated cinematic footage from a prompt',
              'Cannot show your actual interface accurately',
            ],
            [
              'Remotion',
              'Programmatic video in React',
              'Every scene is code you write and maintain',
            ],
            [
              'After Effects',
              'Full manual motion design',
              'Hours of skilled work per minute of film',
            ],
          ],
        },
      },
    ],
    faq: [
      [
        'What AI tool should a startup use for a launch video?',
        'If the product is software people can sign into, pick a tool that films it. Pitch does that from a URL and handles the edit, voice and music in the same project.',
      ],
      [
        'Can I combine Pitch with generated footage?',
        'Yes. Pitch can generate supporting clips and cut them in alongside the recorded product scenes, or you can upload footage from another tool.',
      ],
      [
        'How long does a launch film take?',
        'The first cut usually arrives within the same session. Most of the time goes into your review notes, not into rendering.',
      ],
    ],
    sources: [
      { label: 'Pitch launch videos', href: '/product/launch-videos' },
      { label: 'HeyGen', href: 'https://www.heygen.com' },
      { label: 'Synthesia', href: 'https://www.synthesia.io' },
      { label: 'Runway', href: 'https://runwayml.com' },
      { label: 'Remotion', href: 'https://www.remotion.dev' },
    ],
  },
  {
    slug: 'best-ai-product-demo-video-tools',
    title: 'Best AI Product Demo Video Tools for SaaS Teams',
    category: 'Comparisons',
    date: '2026-09-19',
    readTime: '6 min read',
    excerpt:
      'Screen recorders, interactive demo builders and AI agents all produce "demos". They are not the same deliverable. A side-by-side for SaaS teams.',
    question: 'What is the best AI tool for making a SaaS product demo video?',
    answer: [
      'Use Pitch when you want a narrated demo video without recording it yourself: the agent signs in, walks the flow, and narrates each step.',
      'Use Arcade or Supademo when you want a clickable, embeddable walkthrough. Use Loom or Screen Studio when a person recording a quick take is the point.',
    ],
    body: [
      { h: 'When Pitch fits' },
      {
        list: [
          'The demo should look finished: steady cursor, no dead air, narration that explains why each step matters.',
          'The flow changes often and you are tired of re-recording the whole thing for one new button.',
          'You want the same demo in several lengths, like a 90-second overview and a 20-second feature clip.',
        ],
      },
      { h: 'When to use another tool' },
      {
        list: [
          'Pick an interactive demo builder if prospects should click through the product themselves on your site.',
          'Pick Loom if the value is your face and voice, such as a personal reply to one prospect.',
          'Pick Screen Studio if you enjoy recording and just want it to look polished on a Mac.',
        ],
      },
      { h: 'Recommended workflow' },
      {
        list: [
          'Tell Pitch which flow to show and who is watching, for example "onboarding, for a first-time admin".',
          'Share a test account if the flow sits behind a login.',
          'Review the storyboard, then the cut. Ask for a re-shoot of one scene when something changes.',
        ],
        ordered: true,
      },
      {
        prompt:
          'Record a narrated demo of creating a first invoice in app.acme.com. Audience: small-business owners. Under 90 seconds.',
      },
      { h: 'Tool comparison' },
      {
        table: {
          head: ['Tool', 'Best for', 'Caveat'],
          rows: [
            [
              'Pitch',
              'Agent-recorded, narrated demo videos of real flows',
              'Output is a video, not a click-through embed',
            ],
            [
              'Arcade / Supademo',
              'Interactive, clickable product tours',
              'You capture the clicks yourself',
            ],
            [
              'Loom',
              'Fast personal recordings with your camera',
              'Every retake is a manual re-record',
            ],
            [
              'Screen Studio',
              'Polished manual screen recordings',
              'macOS only; you still drive the take',
            ],
          ],
        },
      },
    ],
    faq: [
      [
        'Is an AI-recorded demo as good as one I record myself?',
        'For most product walkthroughs it is cleaner, because the agent does not hesitate or misclick. Keep a personal recording for moments where you want to be on camera.',
      ],
      [
        'Can Pitch demo a product behind a login?',
        'Yes. Give it a test account in the prompt and it signs in like a user would.',
      ],
      [
        'What happens when my UI changes?',
        'Ask for the affected scene to be re-shot. The rest of the demo stays as it was.',
      ],
    ],
    sources: [
      { label: 'Pitch product demos', href: '/product/product-demos' },
      { label: 'Arcade', href: 'https://www.arcade.software' },
      { label: 'Supademo', href: 'https://supademo.com' },
      { label: 'Loom', href: 'https://www.loom.com' },
      { label: 'Screen Studio', href: 'https://screen.studio' },
    ],
  },
  {
    slug: 'best-ai-pitch-deck-generators',
    title: 'Best AI Pitch Deck Generators for Founders',
    category: 'Comparisons',
    date: '2026-09-16',
    readTime: '5 min read',
    excerpt:
      'Most AI deck tools start from a prompt. The better question is what they start from when you already have a website, a memo or an old deck.',
    question: 'What is the best AI pitch deck generator for founders raising a round?',
    answer: [
      'Use Pitch when the deck should be built from material you already have, such as a URL, a PDF or a previous deck, and stay editable slide by slide before you export a PDF.',
      'Use Gamma for fast prompt-first drafts in its card format. Use Canva or Google Slides when a designer wants to lay out every slide by hand.',
    ],
    body: [
      { h: 'When Pitch fits' },
      {
        list: [
          'You have source material and want it researched and restructured, not replaced with generic filler.',
          'You want an investor-shaped story: problem, solution, market, product, model, traction, ask.',
          'You want to edit text and layout in place, then export a PDF that matches the editor exactly.',
          'The same project may also need a demo video or launch film later.',
        ],
      },
      { h: 'When to use another tool' },
      {
        list: [
          'Pick Gamma if you want a quick web-style presentation from a single prompt and do not need a fixed PDF.',
          'Pick Canva if your brand team already maintains slide templates there.',
          'Pick Keynote or Slides if the deck is mostly live-presented and you want full manual control.',
        ],
      },
      { h: 'Recommended workflow' },
      {
        list: [
          'Drop your memo, old deck or website into a new [deck project](/new?flow=deck).',
          'Say who the deck is for and what you are asking for.',
          'Edit slides directly in the preview, then export the PDF.',
        ],
        ordered: true,
      },
      {
        prompt:
          'Turn this memo into a 10-slide seed deck for B2B SaaS investors. Lead with the problem, keep charts simple.',
      },
      { h: 'Tool comparison' },
      {
        table: {
          head: ['Tool', 'Best for', 'Caveat'],
          rows: [
            [
              'Pitch',
              'Researched decks from your own sources, editable before PDF export',
              'Focused on pitch, sales and board decks',
            ],
            [
              'Gamma',
              'Fast prompt-to-presentation drafts',
              'Card-based format; less control over a fixed page layout',
            ],
            [
              'Canva',
              'Template-driven design with brand kits',
              'Layout and copy are mostly manual',
            ],
            [
              'Google Slides / Keynote',
              'Hand-built decks and live presenting',
              'No research or drafting help built in',
            ],
          ],
        },
      },
    ],
    faq: [
      [
        'Will investors notice an AI-made deck?',
        'They notice generic decks. A deck built from your real numbers and story reads like yours, which is the point of starting from your own sources.',
      ],
      [
        'Can I edit the deck after it is generated?',
        'Yes. Every slide stays open in the editor, and the PDF export always matches the latest edit.',
      ],
    ],
    sources: [
      { label: 'Pitch decks', href: '/product/pitch-decks' },
      { label: 'Gamma', href: 'https://gamma.app' },
      { label: 'Canva presentations', href: 'https://www.canva.com/presentations/' },
    ],
  },
  {
    slug: 'best-ai-video-editors-for-screen-recordings',
    title: 'Best AI Video Editors for Screen Recordings',
    category: 'Comparisons',
    date: '2026-09-12',
    readTime: '5 min read',
    excerpt:
      'You already have the recording. Now it needs cuts, captions and quieter music. Which editors do that from a sentence, and which still need a timeline.',
    question: 'Which AI video editor can edit a screen recording from plain-language instructions?',
    answer: [
      'Use Pitch when you want to describe the edit in plain words, like "cut the first ten seconds and lower the music", and get a new render without touching a timeline.',
      'Use Descript when you like editing a recording by editing its transcript yourself. Use CapCut or Premiere Pro when you want a full manual timeline.',
    ],
    body: [
      { h: 'When Pitch fits' },
      {
        list: [
          'You uploaded a video and have a list of changes, not an editing session.',
          'You want captions, trims, music level and silence removal handled in one request.',
          'You might point at a moment in the preview and say "change this".',
        ],
      },
      { h: 'When to use another tool' },
      {
        list: [
          'Pick Descript for podcast-style editing where you want to delete words in a transcript yourself.',
          'Pick CapCut for social edits with trending templates and effects.',
          'Pick Premiere Pro or DaVinci Resolve for long-form work with a dedicated editor.',
        ],
      },
      { h: 'Recommended workflow' },
      {
        list: [
          'Drop the file onto Pitch. The editor opens without running anything yet.',
          'Select a time range in the preview if a change is about one moment.',
          'Write the edit as you would to a human editor, then review the new render.',
        ],
        ordered: true,
      },
      {
        prompt:
          'Remove the long pauses, add burned-in captions, and make the music quieter under the voice.',
      },
      { h: 'Tool comparison' },
      {
        table: {
          head: ['Tool', 'Best for', 'Caveat'],
          rows: [
            [
              'Pitch',
              'Edits described in plain language, applied and rendered for you',
              'Not a frame-by-frame manual timeline',
            ],
            [
              'Descript',
              'Editing video by editing its transcript',
              'You still make each cut yourself',
            ],
            [
              'CapCut',
              'Short social edits with templates',
              'Manual timeline work for anything custom',
            ],
            [
              'Premiere Pro',
              'Professional long-form editing',
              'Steep learning curve and a subscription',
            ],
          ],
        },
      },
    ],
    faq: [
      [
        'Can Pitch edit a video it did not create?',
        'Yes. Upload any recording and ask for changes. It transcribes it, plans the edit and renders a new file.',
      ],
      [
        'Do I lose the original?',
        'No. Uploads stay in the project, and every render is saved as its own file on the asset shelf.',
      ],
    ],
    sources: [
      { label: 'Descript', href: 'https://www.descript.com' },
      { label: 'CapCut', href: 'https://www.capcut.com' },
      { label: 'Adobe Premiere Pro', href: 'https://www.adobe.com/products/premiere.html' },
    ],
  },
  {
    slug: 'how-to-make-a-product-launch-video-with-ai',
    title: 'How to Make a Product Launch Video with AI from a URL',
    category: 'Launch Videos',
    date: '2026-09-09',
    readTime: '5 min read',
    excerpt:
      'A launch film used to mean a storyboard, a recording day and an editor. Here is the version that starts from one URL and one sentence.',
    question: 'How do I make a product launch video with AI from my website URL?',
    answer: [
      'Give Pitch your product URL and one line of direction. It researches the product, plans scenes, films them in a real browser, then adds voice-over, music and captions. You revise by replying.',
    ],
    body: [
      { h: 'What to prepare' },
      {
        list: [
          'The URL people will land on, plus a test login if the good parts are behind one.',
          'One sentence on the feeling: calm and premium, fast and playful, or technical and precise.',
          'The one thing viewers should remember. A launch film that says three things says none.',
        ],
      },
      { h: 'Step by step' },
      {
        list: [
          'Open [a new launch video](/new?flow=launch-video) and paste the URL with your direction.',
          'Read the scene plan. Cut anything that does not serve the one idea.',
          'Watch the first cut all the way through before giving notes.',
          'Give notes by pointing: select the scene or time range and say what should change.',
          'Export the MP4, then ask for a vertical version for social.',
        ],
        ordered: true,
      },
      {
        prompt:
          'Launch film for acme.com, 45 seconds, Apple-keynote calm. Open on the problem, show three features, close on the logo.',
      },
      { h: 'What makes launch videos work' },
      {
        table: {
          head: ['Choice', 'Do', 'Avoid'],
          rows: [
            ['Length', '30 to 70 seconds', 'Explaining every feature'],
            ['Opening', 'The problem, in the first three seconds', 'A slow logo reveal'],
            ['Footage', 'Your real interface doing real work', 'Mockups nobody can sign into'],
            ['Sound', 'Captions on, music under the voice', 'Relying on audio for autoplay feeds'],
          ],
        },
      },
      { h: 'When to use another approach' },
      {
        p: 'If the launch is a hardware product or a brand film with no interface to show, start with generated footage or a live shoot. Pitch can still assemble and narrate that material once you have it.',
      },
    ],
    faq: [
      [
        'Do I need to write the script?',
        'No. The agent writes it from what it learns about the product. You can paste your own lines if you have them.',
      ],
      [
        'Which languages can the voice-over use?',
        'Voice-over is available in more than 40 languages, and you can switch the voice after the first cut.',
      ],
    ],
    sources: [
      { label: 'Pitch launch videos', href: '/product/launch-videos' },
      { label: 'Pitch pricing', href: '/pricing' },
    ],
  },
  {
    slug: 'zero-shot-demo-video-from-url',
    title: 'How to Make a Narrated Product Demo Without Screen Recording',
    category: 'Product Demos',
    date: '2026-09-05',
    readTime: '4 min read',
    excerpt:
      'Skip the recording session. Point an agent at a flow, let it click through the product, and review a narrated demo instead of making one.',
    question: 'How can I make a narrated product demo video without recording my screen?',
    answer: [
      'Tell Pitch which flow to show and who the demo is for. The agent signs in, completes the flow in a real browser, and narrates each step. You review and ask for changes instead of recording retakes.',
    ],
    body: [
      { h: 'Pick one flow' },
      {
        p: 'The best demos show one job from start to finish: creating a first project, inviting a teammate, running a report. Name the start and the finish in your prompt.',
      },
      { h: 'Step by step' },
      {
        list: [
          'Start [a product demo](/new?flow=demo-video) and describe the flow and the audience.',
          'Add a test account if the flow needs a login.',
          'Check the storyboard: each scene should be one action and one sentence of narration.',
          'Review the cut. Re-shoot a single scene if a step looks wrong.',
        ],
        ordered: true,
      },
      {
        prompt:
          'Demo inviting a teammate in app.acme.com, for a team lead evaluating the product. Start on the dashboard, end on the accepted invite.',
      },
      { h: 'Recording yourself vs. letting an agent record' },
      {
        table: {
          head: ['', 'Record it yourself', 'Pitch'],
          rows: [
            ['Setup', 'Clean browser, test data, quiet room', 'A prompt and a test login'],
            ['Retakes', 'Re-record the whole flow', 'Re-shoot one scene'],
            ['Narration', 'Record and re-record your voice', 'Written and voiced per scene'],
            ['Updates', 'Start over', 'Ask for the changed step'],
          ],
        },
      },
      { h: 'When to record it yourself' },
      {
        p: 'Record yourself when the viewer should see you, like a personal follow-up to one prospect. For anything that gets reused, an agent-recorded demo is easier to keep current.',
      },
    ],
    faq: [
      [
        'Does the agent see my real data?',
        'It sees whatever the account you give it can see. Use a test or demo account with sample data.',
      ],
      [
        'Can I change the voice or the pace?',
        'Yes. Ask for a different voice, slower narration or a shorter cut, and only the affected parts are redone.',
      ],
    ],
    sources: [
      { label: 'Pitch product demos', href: '/product/product-demos' },
      { label: 'Pitch docs', href: '/docs' },
    ],
  },
  {
    slug: 'turn-a-pdf-or-website-into-an-investor-deck',
    title: 'How to Turn a PDF or Website into an Investor Deck',
    category: 'Pitch Decks',
    date: '2026-09-02',
    readTime: '4 min read',
    excerpt:
      'You already wrote the story somewhere: a memo, a site, an old deck. Here is how to turn that into a structured, editable investor deck.',
    question: 'How do I turn a PDF, memo or website into an investor pitch deck?',
    answer: [
      'Drop the PDF, deck or URL into a Pitch deck project and say who it is for. Pitch reads the source, researches what is missing, and drafts an investor-shaped deck you edit in place before exporting a PDF.',
    ],
    body: [
      { h: 'Step by step' },
      {
        list: [
          'Open [a new deck](/new?flow=deck) and attach your source, or paste the URL.',
          'Name the audience and the ask: "seed investors, raising $2M".',
          'Read the outline before the design pass. Fix the story first.',
          'Edit text and layout directly in the preview.',
          'Export the PDF when it reads right.',
        ],
        ordered: true,
      },
      {
        prompt:
          'Build a 12-slide seed deck from this PDF. Audience: fintech investors. Put traction on slide 3.',
      },
      { h: 'A structure that works' },
      {
        table: {
          head: ['Slide', 'Job'],
          rows: [
            ['Problem', 'Who hurts, and how much'],
            ['Solution', 'What you do, in one sentence'],
            ['Product', 'Real screens, not concepts'],
            ['Market', 'Bottom-up sizing you can defend'],
            ['Traction', 'The best number you have'],
            ['Model', 'How money comes in'],
            ['Team', 'Why you, specifically'],
            ['Ask', 'Amount and what it buys'],
          ],
        },
      },
      { h: 'When to use another tool' },
      {
        p: 'If your brand team keeps templates in Canva or Keynote and wants to lay out every slide, draft the story in Pitch and move it across. If you only need a quick outline, a chat assistant is enough.',
      },
    ],
    faq: [
      [
        'Can it use my brand colors and fonts?',
        'Yes. Name them in the prompt, or attach a brand guide or an existing deck to work from.',
      ],
      [
        'Does the PDF match what I see in the editor?',
        'Yes. Export saves any pending edits first and renders from the same document.',
      ],
    ],
    sources: [
      { label: 'Pitch decks', href: '/product/pitch-decks' },
      { label: 'Pitch pricing', href: '/pricing' },
    ],
  },
  {
    slug: 'edit-a-video-by-chatting',
    title: 'How to Edit an Existing Video by Describing the Changes',
    category: 'Video Editing',
    date: '2026-08-29',
    readTime: '4 min read',
    excerpt:
      'Quieter music, shorter intro, captions, no ums. Upload the file and write the edit the way you would brief a human editor.',
    question: 'Can I edit an existing video just by describing the changes I want?',
    answer: [
      'Upload the video to Pitch and describe the edit. It transcribes the audio, plans the cuts, and renders a new version. Point at a time range in the preview when a change is about one moment.',
    ],
    body: [
      { h: 'Edits that work well from a sentence' },
      {
        list: [
          'Trimming the start or end, or cutting a section by describing it.',
          'Removing silences and filler words.',
          'Adding captions in the style you describe.',
          'Changing music level, or replacing the music bed.',
          'Making a shorter or vertical cut from a longer video.',
        ],
      },
      { h: 'Step by step' },
      {
        list: [
          'Drag the file onto Pitch. The editor opens without spending anything yet.',
          'Select a range on the video if the note is about a specific moment.',
          'Write the edit, then review the render on the asset shelf.',
        ],
        ordered: true,
      },
      {
        prompt:
          'Cut this to 60 seconds for LinkedIn. Keep the product shots, drop the intro, captions on, music lower.',
      },
      { h: 'Chat editing vs. a timeline editor' },
      {
        table: {
          head: ['', 'Timeline editor', 'Pitch'],
          rows: [
            ['Skill needed', 'Editing software fluency', 'Knowing what you want'],
            ['Small change', 'Open project, find clip, re-export', 'One message'],
            ['Precision', 'Frame-exact', 'Scene and phrase level'],
          ],
        },
      },
      { h: 'When to use another tool' },
      {
        p: 'For frame-exact work like music videos or long documentaries, a timeline editor is still the right tool. Pitch is for the far more common case: a clear list of changes to a recording.',
      },
    ],
    faq: [
      ['Which formats can I upload?', 'Common video formats such as MP4 and MOV work.'],
      [
        'Can I undo an edit?',
        'Every render is its own file, so the previous version is always there.',
      ],
    ],
    sources: [{ label: 'Pitch docs', href: '/docs' }],
  },
  {
    slug: 'generate-videos-from-claude-or-cursor-with-mcp',
    title: 'How to Generate Videos from Claude, ChatGPT or Cursor with MCP',
    category: 'Developers',
    date: '2026-08-26',
    readTime: '5 min read',
    excerpt:
      'Your coding agent just shipped the feature. Let it make the launch clip too, through Pitch over MCP or the REST API.',
    question: 'How can Claude, ChatGPT or Cursor create videos through MCP or an API?',
    answer: [
      'Create an API key in Pitch, add the Pitch MCP server to your agent, and ask it for a video. The same projects are available over the /v1 REST API if you would rather call them from a script or CI.',
    ],
    body: [
      { h: 'When this fits' },
      {
        list: [
          'You want a changelog clip or demo every time a feature ships.',
          'Your team already works inside Claude, ChatGPT or Cursor and does not want another tab.',
          'You want the result as a normal Pitch project you can open and revise by hand later.',
        ],
      },
      { h: 'Setup' },
      {
        list: [
          'Create a key on the [API keys](/api-keys) page.',
          'Add the Pitch MCP server using the snippet for your client in the [API docs](/docs/api).',
          'Ask the agent for a video in plain words, including the URL to film.',
        ],
        ordered: true,
      },
      {
        prompt:
          'Use Pitch to make a 30-second demo of the new export button on staging.acme.com, then send me the link.',
      },
      { h: 'MCP vs. REST' },
      {
        table: {
          head: ['', 'MCP', 'REST /v1'],
          rows: [
            ['Best for', 'Asking from a chat or coding agent', 'Scripts, CI and your own backend'],
            ['Auth', 'API key', 'The same API key'],
            ['Result', 'A Pitch project and its outputs', 'A Pitch project and its outputs'],
          ],
        },
      },
      { h: 'When to use another tool' },
      {
        p: 'If you want to render templated videos from data, such as thousands of personalised clips, a code framework like Remotion gives you tighter control. Pitch suits one-off films and demos that need judgement.',
      },
    ],
    faq: [
      [
        'Is the API billed differently?',
        'No. API and MCP projects draw from the same credits as projects you start in the app.',
      ],
      [
        'Can I open an API-made project in the studio?',
        'Yes. It is a normal project, so you can keep refining it by chat.',
      ],
    ],
    sources: [
      { label: 'Pitch API reference', href: '/docs/api' },
      { label: 'Model Context Protocol', href: 'https://modelcontextprotocol.io' },
    ],
  },
  {
    slug: 'vertical-product-teaser-videos',
    title: 'How to Make Vertical Product Teasers for Social with AI',
    category: 'Launch Videos',
    date: '2026-08-21',
    readTime: '4 min read',
    excerpt:
      'Feeds autoplay muted, in portrait, for about three seconds before people scroll. Here is how to make a teaser that survives that.',
    question: 'How do I make a vertical product teaser video for social media with AI?',
    answer: [
      'Ask Pitch for a 9:16 teaser of 15 to 30 seconds, captions on, with the hook in the first frame. If you already have a launch film, ask for a vertical cut from the same project.',
    ],
    body: [
      { h: 'Rules for the feed' },
      {
        table: {
          head: ['Rule', 'Why'],
          rows: [
            ['Hook in the first second', 'Most viewers decide before the second scene'],
            ['Captions always', 'Most feeds autoplay muted'],
            ['One feature', 'There is no time for two'],
            ['Big interface crops', 'Full-screen desktop UI is unreadable on a phone'],
          ],
        },
      },
      { h: 'Step by step' },
      {
        list: [
          'Start from your launch project, or a new one with the URL.',
          'Ask for vertical, the length, and the single feature to show.',
          'Check the crops on a phone before exporting.',
        ],
        ordered: true,
      },
      {
        prompt:
          'Make a 20-second vertical teaser from this launch film. Open on the AI search result, bold captions, end on the URL.',
      },
      { h: 'When to use another tool' },
      {
        p: 'For trend-driven edits with stickers, sounds and templates, CapCut is faster. For product-first teasers built from your real interface, start in Pitch.',
      },
    ],
    faq: [
      [
        'Can one project produce both wide and vertical versions?',
        'Yes. Ask for each format in the same conversation and both land on the asset shelf.',
      ],
    ],
    sources: [{ label: 'Pitch explainers', href: '/product/explainers' }],
  },
  {
    slug: 'product-hunt-launch-video-guide',
    title: 'Product Hunt Launch Video: What to Show and How to Make It',
    category: 'Launch Videos',
    date: '2026-08-15',
    readTime: '5 min read',
    excerpt:
      'Visitors decide in seconds whether your launch is worth an upvote. A practical guide to the gallery video that earns a second look.',
    question: 'What should a Product Hunt launch video show, and how do I make one?',
    answer: [
      'Keep it under a minute, show the product working in the first five seconds, caption everything, and end on one clear line. Pitch can film and cut it from your URL, then give you a shorter clip for social on launch day.',
    ],
    body: [
      { h: 'What to show' },
      {
        list: [
          'The moment of value, not the sign-up screen.',
          'One or two flows, each finishing with a visible result.',
          'Your name and URL on the last frame.',
        ],
      },
      { h: 'Timeline for launch week' },
      {
        table: {
          head: ['When', 'What'],
          rows: [
            ['A week before', 'First cut from Pitch, shared with a few users for honest notes'],
            ['Three days before', 'Final cut, captions checked, thumbnail picked'],
            ['Launch day', 'Vertical teaser for X and LinkedIn from the same project'],
          ],
        },
      },
      {
        prompt:
          'Make a 50-second Product Hunt video for acme.com. Show the magic moment first, then two flows, end on "Try it free".',
      },
      { h: 'Common mistakes' },
      {
        list: [
          'Opening with a long logo animation.',
          'Narration that repeats the tagline instead of showing it.',
          'Tiny desktop UI that nobody can read in the gallery player.',
        ],
      },
    ],
    faq: [
      [
        'Should the video have a voice-over?',
        'A light one helps, but captions matter more because many visitors watch without sound.',
      ],
      [
        'How long should it be?',
        'Aim for 30 to 60 seconds. Anything longer belongs on your site as a full demo.',
      ],
    ],
    sources: [
      { label: 'Product Hunt launch guide', href: 'https://www.producthunt.com/launch' },
      { label: 'Pitch launch videos', href: '/product/launch-videos' },
    ],
  },
  {
    slug: 'async-demo-vs-live-demo-saas-sales',
    title: 'Async Demo vs. Live Demo: Which to Send a SaaS Prospect',
    category: 'Sales',
    date: '2026-08-08',
    readTime: '4 min read',
    excerpt:
      'Live demos sell complex deals. Async demos qualify everyone else. How to use both, and how to make the async one without recording it.',
    question: 'Should I send a SaaS prospect an async demo video or book a live demo?',
    answer: [
      'Send an async demo first so prospects can see the product on their schedule, and save live demos for buyers who are already qualified. Pitch makes the async demo from your real product, so you are not re-recording it for every segment.',
    ],
    body: [
      { h: 'When each wins' },
      {
        table: {
          head: ['', 'Async demo', 'Live demo'],
          rows: [
            ['Best for', 'Early interest, many prospects', 'Late stage, complex requirements'],
            ['Cost per prospect', 'Close to zero once made', 'An hour of a seller'],
            ['Personalisation', 'By segment', 'By person'],
            ['Shareable internally', 'Yes, forwardable', 'Only if recorded'],
          ],
        },
      },
      { h: 'How to make an async demo that sells' },
      {
        list: [
          'One flow per role: the admin sees setup, the user sees the daily loop.',
          'Two minutes or less.',
          'End with one next step, such as a trial link or booking link.',
        ],
      },
      {
        prompt:
          'Make a 2-minute demo of app.acme.com for finance leads. Show approvals and reporting. End on "Book a call".',
      },
      { h: 'Where Pitch fits' },
      {
        p: 'Pitch keeps a demo per segment easy to maintain: when the product changes, ask for the affected scene to be re-shot instead of recording every version again.',
      },
    ],
    faq: [
      [
        'Will async demos replace sales calls?',
        'No. They filter and warm up prospects so calls go to buyers who have already seen the product.',
      ],
    ],
    sources: [{ label: 'Pitch product demos', href: '/product/product-demos' }],
  },
]
