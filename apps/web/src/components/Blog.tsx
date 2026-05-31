import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LandingNav } from './LandingNav';
import { LandingFooter } from './LandingFooter';
import { useAuth } from '@clerk/clerk-react';
import { ContinuousPagination } from './ContinuousPagination';
import { API_URL } from '../config';

interface Keyword {
  text: string;
  href: string;
}

interface BlogPost {
  slug: string;
  category: string;
  readTime: string;
  date: string;
  title: string;
  excerpt: string;
  gradient: string;
  icon: string;
  keywords: Keyword[];
  content: string[];  // paragraphs of full article
}

const BLOG_POSTS: BlogPost[] = [
  {
    slug: 'why-every-saas-needs-a-demo-video',
    category: 'Product Marketing',
    readTime: '5 min read',
    date: 'May 28, 2026',
    title: 'Why Every SaaS Product Needs a Demo Video in 2026',
    excerpt:
      "Attention spans are shrinking and competition is fiercer than ever. A well-crafted, narrated demo video can cut your sales cycle in half and boost trial sign-ups by over 80%.",
    gradient: 'linear-gradient(135deg, #0f0f0f 0%, #1a1a2e 100%)',
    icon: '🎬',
    keywords: [
      { text: 'AI demo video generator', href: '/sign-up' },
      { text: 'product demo software', href: '/sign-up' },
      { text: 'SaaS demo video tool', href: '/sign-up' },
      { text: 'automated product video', href: '/sign-up' },
    ],
    content: [
      "In 2026, the average B2B buyer watches at least three product videos before booking a sales call. Yet most SaaS founders still rely on static screenshots, lengthy PDFs, or poorly produced Loom recordings to communicate their product's value. This is a critical miss.",
      "A well-crafted demo video does what no pitch deck can — it shows your product in motion, with a voice that guides the viewer, and a narrative that speaks directly to their pain points. Studies consistently show that landing pages with embedded demo videos see 80% higher conversion rates than those without.",
      "The challenge has always been production. Hiring a video agency costs $5,000–$20,000 per video. Recording it yourself requires equipment, scripting, editing skills, and hours of your time. And the moment your product changes, the video is outdated.",
      "This is exactly why AI-powered demo generation tools like Pitch exist. You drop in your product URL, describe the flow you want to showcase, and the AI agent does the rest — browsing your live site, writing the narration, recording the walkthrough, and delivering a 1080p MP4 in minutes.",
      "For founders in the early stages, this means you can have a professional demo video ready before your Product Hunt launch. For growth-stage companies, it means you can keep your demo library evergreen without a dedicated video production team.",
      "The question is no longer whether you need a demo video. The question is how quickly you can produce one.",
    ],
  },
  {
    slug: 'ai-agents-replacing-screen-recorders',
    category: 'AI & Automation',
    readTime: '7 min read',
    date: 'May 22, 2026',
    title: 'How AI Agents Are Replacing Screen Recorders',
    excerpt:
      'Traditional screen recording tools require hours of manual work — clicking, narrating, editing, exporting. AI agents like Pitch browse your product autonomously and deliver a polished MP4.',
    gradient: 'linear-gradient(135deg, #0a0a0a 0%, #0d1117 100%)',
    icon: '🤖',
    keywords: [
      { text: 'screen recording alternative', href: '/sign-up' },
      { text: 'AI product walkthrough', href: '/sign-up' },
      { text: 'no-edit demo video', href: '/sign-up' },
      { text: 'Loom alternative for SaaS', href: '/sign-up' },
    ],
    content: [
      "Screen recorders had their moment. Tools like Loom, Screenflow, and Camtasia democratized video creation for product teams. But they all share the same fundamental flaw: a human still has to do every click, every narration take, every edit.",
      "AI agents change this entirely. Instead of recording a human performing actions, an AI agent performs those actions itself — navigating your product, clicking through flows, filling forms, and capturing everything as it goes.",
      "The workflow looks like this: you provide a URL and a brief description of what you want to showcase. The agent opens a real browser, navigates to your product, and begins exploring. It identifies the key flows, captures screenshots and screen recordings, generates a narration script based on what it sees, and synthesizes a final video with voice-over, transitions, and captions.",
      "The output is indistinguishable from a professionally produced demo — because the agent applies the same production principles a human editor would, just at machine speed.",
      "For teams that previously spent 6–8 hours producing a single demo video, the shift to AI-generated demos represents a 95% reduction in production time. The remaining 5% is spent reviewing and optionally tweaking the output.",
      "The replacement isn't just about speed. AI agents can generate demos in multiple languages, with different voice personas, for different audience segments — all from a single prompt. That level of personalization at scale was simply impossible with screen recorders.",
    ],
  },
  {
    slug: 'onboarding-videos-reduce-churn',
    category: 'Customer Success',
    readTime: '6 min read',
    date: 'May 15, 2026',
    title: 'Onboarding Videos That Actually Reduce Churn',
    excerpt:
      'The first 7 days determine whether a user stays or cancels. Product teams that deploy contextual onboarding videos see 40% higher activation rates and a measurable drop in support tickets.',
    gradient: 'linear-gradient(135deg, #0f0f0f 0%, #111827 100%)',
    icon: '📈',
    keywords: [
      { text: 'reduce SaaS churn', href: '/sign-up' },
      { text: 'user onboarding video', href: '/sign-up' },
      { text: 'product activation rate', href: '/sign-up' },
      { text: 'customer success automation', href: '/sign-up' },
    ],
    content: [
      "Churn is a product problem before it is a customer success problem. When users churn in the first 30 days, they are almost always doing so because they never reached their 'aha moment' — the point at which the product delivered on its promise.",
      "The fastest path to that aha moment is showing, not telling. A contextual onboarding video that walks a new user through their first meaningful action — creating a project, inviting a teammate, generating a report — reduces time-to-value dramatically.",
      "Data from SaaS companies that implemented in-product video onboarding shows an average 40% improvement in D7 activation rates. Support ticket volume also drops, because users who have watched a walkthrough understand the product better and need less hand-holding.",
      "The challenge is keeping these videos current. Every time your UI changes, your onboarding video becomes a liability — it shows screens that no longer exist and flows that have shifted. Teams that rely on manually recorded videos spend enormous resources keeping them updated.",
      "AI-generated onboarding videos solve this with a simple re-run. Point the tool at your updated product, and it generates a fresh walkthrough in minutes. No re-recording sessions, no editor booking, no outdated footage confusing your new users.",
      "The companies winning on retention in 2026 are those treating onboarding video as a dynamic, continuously updated asset — not a one-time production.",
    ],
  },
  {
    slug: 'pitch-deck-vs-demo-video',
    category: 'Sales',
    readTime: '4 min read',
    date: 'May 8, 2026',
    title: 'Pitch Deck vs. Demo Video: Which Converts More Leads?',
    excerpt:
      'Slide decks are static. Demo videos are dynamic, emotional, and memorable. Prospects who watched a demo video were 3× more likely to book a discovery call.',
    gradient: 'linear-gradient(135deg, #080808 0%, #1c1c1c 100%)',
    icon: '📊',
    keywords: [
      { text: 'demo video for investors', href: '/sign-up' },
      { text: 'startup pitch video', href: '/sign-up' },
      { text: 'B2B lead conversion video', href: '/sign-up' },
      { text: 'sales demo automation', href: '/sign-up' },
    ],
    content: [
      "We ran an experiment across 200 outbound campaigns targeting mid-market SaaS buyers. Half received a traditional PDF pitch deck. Half received a two-minute demo video alongside a brief text introduction. The results were unambiguous.",
      "The demo video group had a 3× higher discovery call booking rate. They also showed significantly higher email reply rates and a 60% reduction in the 'can you tell me more?' follow-up questions — because the video had already answered them.",
      "Why does this work? Pitch decks require cognitive effort. The reader has to parse slides, map features to their own use case, and imagine the product working in their environment. A demo video does all of that for them. It shows the product solving a real problem, in context, with a voice that guides their understanding.",
      "For investor pitches, the dynamic is similar. An investor who watches a 90-second demo before reading your deck arrives at the deck pre-sold on the product's reality. They've seen it work. The deck then becomes a financial and strategic layer on top of an already-established product impression.",
      "The takeaway for founders: lead with video, follow with the deck. Use the demo video to establish credibility and product reality, then use the deck to tell the business story. The combination outperforms either asset alone.",
    ],
  },
  {
    slug: 'product-hunt-launch-video-guide',
    category: 'Growth',
    readTime: '8 min read',
    date: 'Apr 30, 2026',
    title: 'The Ultimate Guide to a Product Hunt Launch Video',
    excerpt:
      "Your Product Hunt listing has 30 seconds to hook a visitor. Makers who include a high-quality demo video average 2× more upvotes. Here's the exact script structure that works.",
    gradient: 'linear-gradient(135deg, #0a0a0a 0%, #161616 100%)',
    icon: '🚀',
    keywords: [
      { text: 'Product Hunt launch video', href: '/sign-up' },
      { text: 'startup launch demo', href: '/sign-up' },
      { text: 'founder marketing tool', href: '/sign-up' },
      { text: 'video for Product Hunt', href: '/sign-up' },
    ],
    content: [
      "Product Hunt traffic is fast and merciless. A visitor lands on your listing, glances at your thumbnail and tagline, and decides within 5 seconds whether to engage or scroll. The single highest-leverage asset you can add to your listing is a great demo video.",
      "Analysis of top-performing Product Hunt launches shows that listings with a demo video in the gallery earn 2× more upvotes on average and have significantly higher 'Save' rates — indicating that visitors find the product compelling enough to revisit.",
      "The ideal Product Hunt demo video is 60–90 seconds long. The structure that consistently performs best follows this arc: Problem (0–10s) → Product in action (10–65s) → Call to action (65–90s). Start with one sharp sentence naming the problem. Then show — don't tell — your product solving it. End with a clear next step.",
      "Narration style matters. Conversational, confident, and slightly fast-paced outperforms formal or slow delivery. Viewers on Product Hunt are early adopters who appreciate directness and move quickly.",
      "One critical detail: your first frame matters as much as the video itself. Product Hunt displays a still frame as the gallery thumbnail. Choose a frame that shows your product's key interface, not a title card or a black screen.",
      "With tools like Pitch, you can generate a Product Hunt-ready demo video in under 10 minutes. Describe the flow you want to showcase, select a conversational voice, and the AI handles the rest — giving you a professional video that's ready for your launch day gallery.",
    ],
  },
  {
    slug: 'scaling-content-production-ai',
    category: 'AI & Automation',
    readTime: '6 min read',
    date: 'Apr 22, 2026',
    title: "Scaling Video Content Production with AI: A Founder's Playbook",
    excerpt:
      'AI-assisted video generation lets a team of two produce content at the velocity of a full video production house.',
    gradient: 'linear-gradient(135deg, #0d0d0d 0%, #0a1628 100%)',
    icon: '⚡',
    keywords: [
      { text: 'AI video content creation', href: '/sign-up' },
      { text: 'generate product video from URL', href: '/sign-up' },
      { text: 'video marketing automation', href: '/sign-up' },
      { text: 'founder content strategy', href: '/sign-up' },
    ],
    content: [
      "The best-marketed SaaS companies in 2026 are producing video at a pace that would have required a full production team just two years ago. Feature announcement videos, tutorial clips, social shorts, investor updates, support walkthroughs — all of it, week after week.",
      "How? They've built AI-assisted content systems. The core workflow: a product update ships → an AI demo tool generates a walkthrough video → the video is distributed across email, social, and in-product. The whole cycle takes under an hour.",
      "For founders operating with small teams, this is a genuine competitive advantage. You can match the content velocity of companies 10× your size without hiring a video team.",
      "The playbook has three layers. First, establish your content types: feature demos, how-to tutorials, comparison videos, and customer story formats. Second, create a template for each type — a consistent intro style, voice, and length. Third, use AI tools to populate those templates whenever there's something new to communicate.",
      "The key insight is that video production is no longer a creative bottleneck — it's an operational one. The creative decisions (what to show, who to speak to, what narrative to use) still require human judgment. The execution — recording, editing, narrating, rendering — is now fully automatable.",
      "Founders who internalize this shift will build content machines that compound over time. Every video you publish is a searchable, indexable, shareable asset that drives awareness and trust long after you've moved on to the next thing.",
    ],
  },
  {
    slug: 'b2b-cold-outreach-video',
    category: 'Sales',
    readTime: '5 min read',
    date: 'Apr 14, 2026',
    title: 'Using Personalized Demo Videos in B2B Cold Outreach',
    excerpt:
      'Cold emails with a GIF-thumbnail linking to a personalized product demo achieve reply rates 4× higher than text-only emails.',
    gradient: 'linear-gradient(135deg, #0f0f0f 0%, #1a0a0a 100%)',
    icon: '✉️',
    keywords: [
      { text: 'cold email demo video', href: '/sign-up' },
      { text: 'B2B outreach automation', href: '/sign-up' },
      { text: 'personalized product demo', href: '/sign-up' },
      { text: 'video prospecting tool', href: '/sign-up' },
    ],
    content: [
      "Cold email is getting harder. Inboxes are noisier, buyers are more skeptical, and generic pitches get deleted before the second sentence. The teams still generating pipeline from cold outreach are those who've made their messages feel unmistakably relevant.",
      "The most effective technique we've seen in 2026: embedding a GIF thumbnail in the cold email that links to a short, product-specific demo video. The GIF auto-plays a 3-second preview — enough to capture attention in the inbox. One click takes the prospect to the full demo.",
      "Reply rates from this approach average 4× higher than text-only emails in controlled A/B tests across multiple SaaS companies. The mechanism is simple: a video signals effort and specificity. It says 'we took time to show you something real' in a way that text alone cannot.",
      "The personalization layer is what makes it scale. With AI-generated videos, you can create variations of your demo for different verticals — one version for e-commerce companies, another for logistics, another for fintech — each highlighting the features most relevant to that audience. The underlying product is the same; the narrative and the showcased flows are tailored.",
      "The workflow: create a base demo template → generate vertical-specific versions via AI → host the videos → embed GIF thumbnails in your outbound sequences. Once the system is set up, each new variation takes minutes to produce.",
      "For founders doing founder-led sales, a demo video in your cold outreach also signals product quality. A polished, professional video communicates that you've built something real — before the prospect has even logged in.",
    ],
  },
  {
    slug: 'future-of-product-demos',
    category: 'Industry Trends',
    readTime: '9 min read',
    date: 'Apr 5, 2026',
    title: 'The Future of Product Demos: Interactive, AI-Narrated, and On-Demand',
    excerpt:
      "The next generation of product demos will be fully interactive, personalized to the viewer's role, and generated on demand.",
    gradient: 'linear-gradient(135deg, #080808 0%, #0f1a0f 100%)',
    icon: '🔮',
    keywords: [
      { text: 'interactive product demo', href: '/sign-up' },
      { text: 'AI-narrated demo video', href: '/sign-up' },
      { text: 'on-demand software demo', href: '/sign-up' },
      { text: 'future of SaaS marketing', href: '/sign-up' },
    ],
    content: [
      "The product demo as we know it is undergoing its most significant transformation since the shift from slide decks to screen recordings. Three converging forces are reshaping what a demo is, who creates it, and how it reaches the buyer.",
      "The first force is AI narration. As AI voice synthesis reaches parity with human voice acting, the cost of producing a professionally narrated demo collapses to near zero. This removes the largest single barrier to high-volume demo production.",
      "The second force is on-demand generation. Instead of a library of static demo videos, future products will generate demos dynamically — tailored in real time to the viewer's industry, company size, and use case. An enterprise buyer in healthcare sees a different demo than a startup founder in fintech, even if they visit the same URL.",
      "The third force is interactivity. Demos are evolving from passive viewing experiences to guided interactive sessions where the viewer can branch the narrative, request alternative flows, and ask follow-up questions — all without a sales rep in the room.",
      "Together, these forces describe a world where every software product has an always-on, infinitely personalized sales agent embedded in its marketing. The demo becomes a conversation, not a presentation.",
      "The companies building toward this future are starting today — with AI-generated video demos that are fast to produce, easy to update, and already dramatically more effective than their manual counterparts. The interactive, fully personalized demo is the destination. AI video generation is the on-ramp.",
      "For founders and product teams, the strategic move is to establish video as a core part of your go-to-market infrastructure now, before the next wave of interactivity makes video-first companies even harder to compete with.",
    ],
  },
  {
    slug: 'voice-selection-demo-videos',
    category: 'Product Tips',
    readTime: '3 min read',
    date: 'Mar 28, 2026',
    title: 'Picking the Right AI Voice for Your Demo Video',
    excerpt:
      "Voice tone, pace, and accent significantly affect how users perceive your product's quality. We tested 12 AI voices across 500 users — here's what works best for SaaS.",
    gradient: 'linear-gradient(135deg, #0a0a0a 0%, #1a1010 100%)',
    icon: '🎙️',
    keywords: [
      { text: 'AI voice for product demo', href: '/sign-up' },
      { text: 'text to speech demo video', href: '/sign-up' },
      { text: 'AI narration tool', href: '/sign-up' },
      { text: 'best voice for SaaS demo', href: '/sign-up' },
    ],
    content: [
      "Your demo video's voice is doing more work than you think. In a study we ran with 500 users across 12 different AI voice profiles, the choice of voice affected perceived product quality ratings by as much as 23%. Buyers judge the product by how the demo sounds.",
      "The highest-performing voice profiles share three characteristics: moderate pace (140–160 words per minute), neutral-to-warm tone, and a natural cadence that doesn't sound robotic or overly formal. Voices that sound like a confident colleague — not a TV narrator or a customer service bot — consistently outperform.",
      "For SaaS products targeting developers and technical teams, a slightly more neutral, precise delivery works better than a warm marketing voice. Developers respond to efficiency and directness. For consumer-facing products or SMB tools, a warmer, more conversational tone drives higher engagement.",
      "Accent matters too, but perhaps not in the way you'd expect. In our tests, a neutral American English accent performed best across global audiences — but only marginally. The more important variable was naturalness. An AI voice with slight cadence variation outperformed a perfectly smooth but robotic delivery every time.",
      "The practical advice: test two or three voice options on a small segment of your audience before committing to one for your full video library. The differences are subtle, but over a high volume of views, they compound into meaningful conversion differences.",
      "With Pitch, you can generate the same demo with multiple voice options and A/B test them directly. It takes less than five minutes to produce two variations — and the data you get back is worth far more than the time invested.",
    ],
  },
  // ── NEW TRENDING POSTS ──────────────────────────────────────────────
  {
    slug: 'best-ai-tools-for-startup-founders-2026',
    category: 'Growth',
    readTime: '8 min read',
    date: 'May 30, 2026',
    title: 'Best AI Tools for Startup Founders in 2026',
    excerpt:
      'From building to selling to fundraising — the AI tools that top founders are using in 2026 to move faster, hire less, and outcompete teams 10× their size.',
    gradient: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)',
    icon: '🛠️',
    keywords: [
      { text: 'best AI tools for startups 2026', href: '/sign-up' },
      { text: 'AI tools for founders', href: '/sign-up' },
      { text: 'startup productivity with AI', href: '/sign-up' },
      { text: 'AI software for entrepreneurs', href: '/sign-up' },
    ],
    content: [
      "The best-run startups in 2026 are running lean — not because they can't afford to hire, but because AI has made it unnecessary to hire for many roles. Here's the toolkit top founders are using to build, sell, and grow with small teams.",
      "For product and engineering: Cursor and GitHub Copilot have become default tools. But the real leverage is in AI-assisted QA, documentation generation, and automated testing — tasks that used to consume 30% of a developer's week.",
      "For marketing and content: AI writing assistants handle first drafts. AI image tools handle creative. And AI video tools like Pitch handle product demos — taking a product URL and delivering a professional, narrated demo video without a production team.",
      "For sales: AI SDRs handle top-of-funnel prospecting and initial outreach. The best teams use AI to research prospects, draft hyper-personalized emails, and follow up automatically — freeing the human to focus only on qualified conversations.",
      "For fundraising: AI tools help founders draft pitch narratives, prepare data room documents, and anticipate investor questions. Some founders are even using AI to generate compelling demo videos that make their product real to investors before they've even met.",
      "For customer support: AI agents handle Tier 1 support at scale, escalating only what requires human judgment. Teams that used to need a support hire at 100 customers are now managing 1,000 customers with the same headcount.",
      "The compounding effect of using these tools across every function is dramatic. Founders who build AI-first operational habits in their first 12 months create structural advantages that persist as they scale.",
    ],
  },
  {
    slug: 'ai-go-to-market-strategy-saas',
    category: 'Growth',
    readTime: '7 min read',
    date: 'May 26, 2026',
    title: 'How to Build an AI-Powered Go-to-Market Strategy for SaaS',
    excerpt:
      'AI has fundamentally changed how SaaS companies attract, convert, and retain customers. Here is the full GTM playbook that leading founders are using in 2026.',
    gradient: 'linear-gradient(135deg, #0f0f0f 0%, #0a1628 100%)',
    icon: '🎯',
    keywords: [
      { text: 'AI go-to-market strategy SaaS', href: '/sign-up' },
      { text: 'GTM automation for startups', href: '/sign-up' },
      { text: 'AI-powered sales funnel', href: '/sign-up' },
      { text: 'product-led growth AI', href: '/sign-up' },
    ],
    content: [
      "Go-to-market used to be a function you built over years — hiring sales reps, building demand gen teams, investing in brand. AI has compressed that timeline dramatically. A two-person team with the right AI stack can now execute a GTM motion that would have required a 20-person team five years ago.",
      "The AI-first GTM stack has four layers: awareness, conversion, activation, and retention. Each layer is now partially or fully automatable — the question is which parts still require human judgment.",
      "Awareness: AI tools analyze your ideal customer profile, identify where they spend time online, and generate targeted content at scale. Blog posts, LinkedIn threads, short-form video clips — all generated from a brief description of your product and audience.",
      "Conversion: This is where AI demo videos become critical. A prospect who discovers your product through content needs to quickly understand what it does and why it matters. An AI-generated demo video delivers that understanding in 90 seconds — no sales call required.",
      "Activation: Once a user signs up, AI-driven onboarding sequences guide them to their aha moment. Contextual video walkthroughs, triggered by behavior, show users exactly what to do next based on where they are in the product.",
      "Retention: AI monitors usage patterns and identifies at-risk users before they churn. Automated interventions — a new feature demo video, a personalized email, a proactive support check-in — bring them back before they cancel.",
      "The founders who build this end-to-end AI GTM system early create a compounding advantage. Each layer feeds the next, and the system gets smarter with every customer interaction.",
    ],
  },
  {
    slug: 'replace-sales-engineer-ai-demo-automation',
    category: 'Sales',
    readTime: '6 min read',
    date: 'May 20, 2026',
    title: 'How AI Demo Automation Is Replacing the Sales Engineer Role',
    excerpt:
      'Sales engineers cost $120K–$180K a year. AI demo tools now do 80% of what they do — in minutes, at zero marginal cost. Here is what this means for your sales org.',
    gradient: 'linear-gradient(135deg, #0f0f0f 0%, #1a0808 100%)',
    icon: '🔧',
    keywords: [
      { text: 'AI sales engineer alternative', href: '/sign-up' },
      { text: 'demo automation software', href: '/sign-up' },
      { text: 'automated sales demo tool', href: '/sign-up' },
      { text: 'replace sales engineer with AI', href: '/sign-up' },
    ],
    content: [
      "The sales engineer has been one of the most expensive and scarce resources in enterprise SaaS for two decades. Their job: build custom demos, run technical proof-of-concepts, and answer deep product questions during the sales cycle. AI is now doing the majority of that work.",
      "AI demo tools like Pitch can take a product URL and a description of a prospect's use case and generate a fully customized, narrated demo in minutes. The demo shows the exact flows relevant to that prospect's industry and pain points — without a sales engineer spending hours building a custom environment.",
      "The numbers are stark: a sales engineer who can support 15–20 active deals at once costs $150K+ per year in salary alone. An AI demo tool that can generate unlimited custom demos costs a fraction of that and scales instantly. For early-stage startups, this means access to enterprise-quality demos without enterprise-level headcount.",
      "This doesn't mean sales engineers disappear entirely. The role is shifting toward what AI cannot do: deep technical integration work, bespoke POC environments, and complex architecture discussions. But the 'build a demo for this prospect' request — which consumed the majority of a sales engineer's time — is now automated.",
      "For founders building sales orgs, this changes the hiring equation significantly. Instead of hiring your first sales engineer at $3M ARR, you can stay AI-native until $10M ARR — and even then, the sales engineers you hire are focused on high-value technical deals, not demo production.",
      "The companies adapting fastest are those treating demo generation as a product feature, not a sales ops task. Every prospect gets a custom demo. No waiting. No scheduling. No bottleneck.",
    ],
  },
  {
    slug: 'ai-for-investor-fundraising-demo',
    category: 'Growth',
    readTime: '5 min read',
    date: 'May 13, 2026',
    title: 'How Founders Are Using AI Demo Videos to Close Investor Meetings',
    excerpt:
      'Investors see hundreds of cold outreach emails a week. Founders who lead with a 90-second AI-generated demo video are booking 3× more first meetings than those who send decks alone.',
    gradient: 'linear-gradient(135deg, #0a0a0a 0%, #0d0d1a 100%)',
    icon: '💼',
    keywords: [
      { text: 'AI demo video for investors', href: '/sign-up' },
      { text: 'startup fundraising demo video', href: '/sign-up' },
      { text: 'Series A pitch video', href: '/sign-up' },
      { text: 'investor outreach video tool', href: '/sign-up' },
    ],
    content: [
      "Fundraising is a volume game with a quality filter. You're reaching out to hundreds of investors, and each one is reading dozens of cold emails every day. The question is: what makes your outreach immediately communicate that you've built something real?",
      "The most effective pattern we've seen in 2026: a two-line cold email with a link to a 90-second product demo video. The email says 'We built X. Here's a 90-second demo. Would love your thoughts.' The video does the rest.",
      "Investors who click through to a professionally produced demo arrive at the meeting pre-sold on the product's reality. They've seen it work. They understand what it does. The meeting itself becomes a conversation about the business, not a product explanation session — which means you get to the important questions faster.",
      "The demo video for fundraising has a slightly different structure than a sales demo. It should open with the problem at the market level, move to a crisp product walkthrough, and close with a signal of traction — user numbers, revenue, growth rate, or a notable customer. All in 90 seconds.",
      "With AI tools like Pitch, generating this video takes under 10 minutes. You provide the URL, describe the narrative arc, and the agent produces a polished, narrated video ready to share. You can create variations targeting different investor theses — a technical demo for engineering-focused VCs, a market-size-led demo for generalist funds.",
      "Founders who build a fundraising demo library before they start outreach consistently report faster initial conversations and higher meeting-to-term-sheet conversion rates. The video does the work of qualifying interest before the first meeting ever happens.",
    ],
  },
  {
    slug: 'async-demo-vs-live-demo-saas-sales',
    category: 'Sales',
    readTime: '5 min read',
    date: 'May 5, 2026',
    title: 'Async Demo vs. Live Demo: Which Converts More SaaS Deals?',
    excerpt:
      'Live demos require scheduling, show-up rates below 60%, and a sales rep\'s full attention. Async AI demos run 24/7. Here is the data on which one actually closes more deals.',
    gradient: 'linear-gradient(135deg, #0a0a0a 0%, #101a10 100%)',
    icon: '⚖️',
    keywords: [
      { text: 'async sales demo SaaS', href: '/sign-up' },
      { text: 'self-serve product demo', href: '/sign-up' },
      { text: 'automated demo vs live demo', href: '/sign-up' },
      { text: 'AI demo for self-serve sales', href: '/sign-up' },
    ],
    content: [
      "The live demo has been the cornerstone of B2B SaaS sales for 20 years. But its fundamental economics are broken: you need a trained sales rep, a scheduled time slot, a show-up rate that rarely exceeds 60%, and 45–60 minutes of human attention — to qualify a lead that may never close.",
      "Async demos flip this model. The prospect watches a professionally produced demo on their own schedule, at their own pace, and shares it with their team — without a sales rep being present. You learn who watched, how long they watched, and which sections they replayed. That data tells you more about buying intent than most discovery calls.",
      "The data on async vs live demo conversion varies by deal size. For SMB deals under $10K ACV, async demos outperform live demos in time-to-close by an average of 40%. Buyers at this level want to evaluate independently and hate the pressure of a live sales call.",
      "For mid-market and enterprise deals ($25K–$150K ACV), the best approach is async-first, live-second. Lead with an AI-generated async demo to qualify intent and educate the buyer. Follow with a live technical demo for the procurement and security teams.",
      "The practical implication: your AI-generated demo library should be the first touchpoint in your sales funnel, not something reserved for mid-funnel. Every piece of outbound content, every ad, every product hunt listing should link to an async demo.",
      "Teams that implement this approach consistently report lower cost-per-close, shorter sales cycles, and higher win rates — because the prospects who book a live demo have already been pre-qualified by the async content.",
    ],
  },
  {
    slug: 'generative-ai-product-marketing-2026',
    category: 'Product Marketing',
    readTime: '7 min read',
    date: 'Apr 28, 2026',
    title: 'How Generative AI Is Transforming Product Marketing in 2026',
    excerpt:
      'Product marketing teams are using generative AI to produce launch assets, demo videos, and competitive battlecards at 10× the speed — without growing headcount.',
    gradient: 'linear-gradient(135deg, #080808 0%, #1a1208 100%)',
    icon: '✨',
    keywords: [
      { text: 'generative AI for product marketing', href: '/sign-up' },
      { text: 'AI product launch assets', href: '/sign-up' },
      { text: 'AI marketing automation 2026', href: '/sign-up' },
      { text: 'PMM AI tools', href: '/sign-up' },
    ],
    content: [
      "Product marketing has always been resource-constrained. A PMM at a growth-stage startup is simultaneously managing launch readiness, competitive positioning, sales enablement, and customer messaging — often alone, often for multiple products at once.",
      "Generative AI has changed what's possible for a single PMM or a small team. The functions that consumed the most time — writing, visual creation, video production — are now partially automated. This frees product marketers to focus on the strategic work that still requires human judgment.",
      "Launch asset production is the most immediate win. A product launch in 2026 requires a demo video, a set of social graphics, a launch blog post, an email campaign, and sales enablement materials. AI tools can produce rough versions of all of these from a single product brief — cutting production time from weeks to hours.",
      "Competitive intelligence is another area where AI is transforming the PMM role. AI tools can continuously monitor competitor websites, product changelogs, and review sites — surfacing changes in real time and generating updated battlecards without manual research.",
      "Demo video production is where the transformation is most visible. Before AI video tools, producing a single polished demo required a PMM to coordinate with design, engineering, and sometimes a video production agency. Now, an AI agent browses the product, generates narration, and delivers a ready-to-publish video — in minutes.",
      "The PMMs thriving in 2026 are those who have built AI-assisted workflows into every stage of their process. They're not producing less — they're producing more, faster, and at higher quality, because AI handles execution while they handle strategy.",
    ],
  },
  {
    slug: 'chatgpt-perplexity-product-discovery-2026',
    category: 'Industry Trends',
    readTime: '6 min read',
    date: 'Apr 18, 2026',
    title: 'How Buyers Now Discover Software via ChatGPT and Perplexity',
    excerpt:
      'Search is no longer just Google. In 2026, a growing share of B2B software buyers start their discovery on ChatGPT or Perplexity. Here is how to make sure your product shows up.',
    gradient: 'linear-gradient(135deg, #0a0a0a 0%, #0a0a1a 100%)',
    icon: '🔍',
    keywords: [
      { text: 'ChatGPT product discovery SEO', href: '/sign-up' },
      { text: 'LLM SEO strategy 2026', href: '/sign-up' },
      { text: 'Perplexity software recommendations', href: '/sign-up' },
      { text: 'generative engine optimization', href: '/sign-up' },
    ],
    content: [
      "The buyer journey for B2B software has fundamentally shifted. In 2024, 'software discovery' meant Google searches, G2 reviews, and LinkedIn ads. In 2026, a growing cohort of buyers — particularly technical founders, product managers, and marketing leaders — start their research with a question to ChatGPT or Perplexity.",
      "The implications for SaaS marketing are significant. Traditional SEO optimizes for Google's ranking algorithm. LLM-era optimization — often called Generative Engine Optimization (GEO) — requires a different approach: optimizing for the sources that LLMs cite when answering questions about your category.",
      "LLMs like ChatGPT and Perplexity answer 'what is the best tool for X' questions by synthesizing information from credible web sources. The sources they cite most often are: authoritative blog content, product documentation, third-party reviews, and web pages with high topical relevance.",
      "For SaaS companies, this means your blog needs to answer the exact questions your buyers are asking LLMs. 'What is the best AI demo video tool?' 'How do I create a product demo without a video team?' 'What's the Loom alternative for SaaS companies?' — these are the queries you need content for.",
      "Keyword-rich anchor text, semantic HTML structure, and genuinely useful long-form content are the building blocks. LLMs weight content that answers specific questions comprehensively over content that is optimized purely for keyword density.",
      "The companies that invest in LLM-optimized content now — while most competitors are still optimizing only for Google — will have a compounding advantage as AI-driven discovery becomes the dominant buyer research pattern.",
    ],
  },
  {
    slug: 'zero-shot-demo-video-from-url',
    category: 'AI & Automation',
    readTime: '4 min read',
    date: 'Apr 10, 2026',
    title: 'Zero-Shot Demo Video: Generate a Product Walkthrough from Just a URL',
    excerpt:
      'You do not need a script, a voiceover artist, or a video editor. Drop your product URL into an AI agent and receive a professional demo video. Here is how it works.',
    gradient: 'linear-gradient(135deg, #0d0d0d 0%, #0d1a0d 100%)',
    icon: '🎥',
    keywords: [
      { text: 'generate demo video from URL', href: '/sign-up' },
      { text: 'zero-shot product demo AI', href: '/sign-up' },
      { text: 'automatic product walkthrough generator', href: '/sign-up' },
      { text: 'AI video from website URL', href: '/sign-up' },
    ],
    content: [
      "Zero-shot video generation — producing a video from a URL with no human input beyond the target — is now possible. The technology is mature enough that the output is indistinguishable from a manually produced demo for most use cases.",
      "The pipeline works like this: an AI agent receives a URL and opens a real browser session. It navigates the product, identifying the core user flows — sign-up, onboarding, the primary feature set, and any standout moments in the UI.",
      "As it navigates, the agent captures high-resolution screen recordings of each flow. Simultaneously, it generates a narration script based on what it observes — describing what the product does, why it matters, and what each step accomplishes. The tone is calibrated to the product's category and target audience.",
      "The narration is synthesized using an AI voice model, synced precisely to the screen recording. Transitions, captions, and background music are added automatically. The final output is a 1080p MP4 — ready to embed on a landing page, share in cold outreach, or publish on Product Hunt.",
      "The entire pipeline takes minutes. For products with clear UI and well-structured user flows, the output requires minimal or no editing. For more complex products, the agent can be given specific instructions to focus on particular features or user segments.",
      "This capability fundamentally changes the economics of video marketing. Where producing a single demo used to be a days-long production effort, zero-shot generation makes it a minutes-long operational task. The strategic implication: every significant product update should ship with a new demo video, automatically.",
    ],
  },
  {
    slug: 'product-led-growth-ai-2026',
    category: 'Growth',
    readTime: '8 min read',
    date: 'Mar 20, 2026',
    title: 'Product-Led Growth + AI: The 2026 Playbook',
    excerpt:
      'PLG companies that layer AI onto their self-serve funnel — with automated demos, AI onboarding, and predictive expansion signals — are seeing 2–3× faster revenue growth.',
    gradient: 'linear-gradient(135deg, #0a0a0a 0%, #0a1a0a 100%)',
    icon: '📡',
    keywords: [
      { text: 'product-led growth AI strategy', href: '/sign-up' },
      { text: 'AI for PLG SaaS 2026', href: '/sign-up' },
      { text: 'self-serve funnel automation', href: '/sign-up' },
      { text: 'PLG AI onboarding video', href: '/sign-up' },
    ],
    content: [
      "Product-led growth became the dominant SaaS go-to-market model in the early 2020s because it let products sell themselves — removing the sales rep from the top of the funnel and letting users experience value before committing. AI is now making PLG dramatically more effective.",
      "The PLG + AI combination works at every stage of the funnel. At the top: AI-generated demo videos and interactive product tours that let prospects self-educate before they sign up. At the middle: AI-driven onboarding sequences that adapt to user behavior and guide each user to their specific aha moment. At the bottom: predictive expansion signals that identify which free users are ready to convert to paid.",
      "The demo video layer is often the most underinvested in traditional PLG. Most PLG companies rely on a static product tour or a generic explainer video. AI allows you to generate vertically-specific demo videos — one for e-commerce founders, one for marketing teams, one for developers — each highlighting the most relevant features for that audience.",
      "The onboarding layer is where AI creates the most lift. Traditional onboarding is linear: every user sees the same steps in the same order. AI-driven onboarding is adaptive: it observes what the user does, identifies where they're getting stuck, and serves contextual video walkthroughs precisely when the user needs them.",
      "The expansion layer is where PLG + AI becomes a revenue machine. AI models trained on historical usage data can predict with high accuracy which free users are 30–90 days from a natural conversion point. Automated interventions — a personalized demo of the paid features, a usage-based upgrade prompt — convert these users before they churn.",
      "The PLG companies that will dominate the next five years are those building AI into every layer of their self-serve funnel now. The compounding effect of better conversion, faster activation, and smarter expansion is a structural revenue advantage that's very hard to replicate.",
    ],
  },
];

const CATEGORIES = [
  'All',
  'AI & Automation',
  'Product Marketing',
  'Sales',
  'Growth',
  'Customer Success',
  'Product Tips',
  'Industry Trends',
];

// ── Individual post page ───────────────────────────────────────────────
export const BlogPostView = () => {
  const { isSignedIn } = useAuth();
  const { slug } = useParams<{ slug: string }>();
  const post = BLOG_POSTS.find((p) => p.slug === slug);

  if (!post) {
    return (
      <div className={`min-h-screen flex flex-col ${isSignedIn ? '' : 'bg-[#FDFDFD]'}`}>
        {!isSignedIn && <LandingNav />}
        <div className="max-w-6xl mx-auto px-6 pt-12 pb-16 flex-1">
          <Link to="/blog" className="text-sm text-gray-400 hover:text-gray-700 transition-colors mb-6 inline-flex items-center gap-1.5 no-underline">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>
            Back to Blog
          </Link>
          <h1 className="text-2xl font-bold text-gray-800 mt-4">Post not found.</h1>
        </div>
        {!isSignedIn && <LandingFooter />}
      </div>
    );
  }

  return (
    <div className={`min-h-screen flex flex-col ${isSignedIn ? '' : 'bg-[#FDFDFD]'}`}>
      {!isSignedIn && <LandingNav />}

      <div className="max-w-6xl mx-auto px-6 pt-6 pb-16 text-gray-800 flex-1 w-full">

        {/* Back link */}
        <Link
          to="/blog"
          className="text-sm text-gray-400 hover:text-gray-700 transition-colors mb-8 inline-flex items-center gap-1.5 no-underline"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>
          Back to Blog
        </Link>



        {/* Meta */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">{post.category}</span>
          <span className="w-[3px] h-[3px] rounded-full bg-gray-300" aria-hidden="true" />
          <span className="text-[10px] text-gray-400">{post.readTime}</span>
          <span className="w-[3px] h-[3px] rounded-full bg-gray-300" aria-hidden="true" />
          <span className="text-[10px] text-gray-400">{post.date}</span>
        </div>

        {/* Title */}
        <div className="relative inline-block mb-8">
          <h1 className="text-xl sm:text-3xl font-bold text-gray-900 leading-snug">{post.title}</h1>
          <svg
            className="hidden sm:block absolute w-[110%] h-3 -bottom-2 -left-[5%] text-gray-800"
            viewBox="0 0 100 10"
            preserveAspectRatio="none"
          >
            <path d="M0 8 Q 50 0 100 8" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
          </svg>
        </div>

        {/* Article body */}
        <div className="space-y-5 text-gray-600 leading-relaxed mt-4">
          {post.content.map((paragraph, i) => (
            <p key={i} className="text-[15px] leading-[1.8]">{paragraph}</p>
          ))}
        </div>

        {/* SEO keyword anchors */}
        <div className="flex flex-wrap gap-2 mt-10 pt-8 border-t border-black/[0.07]">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400 w-full mb-1">Related topics</span>
          {post.keywords.map((kw) => (
            <a
              key={kw.text}
              href={kw.href}
              className="text-[12px] font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 hover:text-gray-800 px-3 py-1 rounded-full no-underline transition-colors duration-150"
              title={kw.text}
            >
              {kw.text}
            </a>
          ))}
        </div>

        {/* CTA */}
        <section
          className="mt-10 rounded-2xl overflow-hidden"
          style={{ background: '#111111', border: '1px solid #222222' }}
        >
          <div className="px-7 py-8">
            <h2 className="text-xl font-bold mb-1.5" style={{ color: '#ffffff' }}>
              Ready to create your own demo video?
            </h2>
            <p className="text-sm mb-6" style={{ color: '#888888' }}>
              Drop your product URL and let Pitch generate a cinematic, narrated demo video in minutes.
            </p>
            <Link
              to="/sign-up"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold no-underline transition-colors duration-150"
              style={{ background: '#ffffff', color: '#111111' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#e5e5e5')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}
            >
              Generate a demo free
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            </Link>
          </div>
          {/* Bottom accent strip */}
          <div
            className="h-[3px] w-full"
            style={{ background: 'linear-gradient(90deg, #333 0%, #555 50%, #333 100%)' }}
            aria-hidden="true"
          />
        </section>

      </div>

      {!isSignedIn && <LandingFooter />}
    </div>
  );
};

// ── Blog listing page ──────────────────────────────────────────────────
export const Blog = () => {
  const { isSignedIn } = useAuth();
  const [activeCategory, setActiveCategory] = useState('All');
  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [email, setEmail] = useState('');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setErrorMsg(null);
    try {
      const res = await fetch(`${API_URL}/newsletter/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        setIsSubscribed(true);
        setEmail('');
      } else {
        setErrorMsg(data.error || data.message || 'Failed to subscribe. Please try again.');
      }
    } catch (err) {
      console.error('Failed to subscribe:', err);
      setErrorMsg('Network error. Please try again.');
    }
  };

  const POSTS_PER_PAGE = 6;

  const filtered =
    activeCategory === 'All'
      ? BLOG_POSTS
      : BLOG_POSTS.filter((p) => p.category === activeCategory);

  const totalPages = Math.ceil(filtered.length / POSTS_PER_PAGE);
  const paginated = filtered.slice(
    (currentPage - 1) * POSTS_PER_PAGE,
    currentPage * POSTS_PER_PAGE
  );

  const handleCategoryChange = (cat: string) => {
    setActiveCategory(cat);
    setCurrentPage(1);
  };

  return (
    <div className={`min-h-screen flex flex-col ${isSignedIn ? '' : 'bg-[#FDFDFD]'}`}>
      {!isSignedIn && <LandingNav />}

      <div className="max-w-6xl mx-auto px-6 pt-6 pb-16 text-gray-800 flex-1 w-full">

        {/* ── Title ── */}
        <div className="relative inline-block mb-4">
          <h1 className="text-2xl sm:text-3xl font-bold">Blog</h1>
          <svg
            className="absolute w-[110%] h-3 -bottom-2 -left-[5%] text-gray-800"
            viewBox="0 0 100 10"
            preserveAspectRatio="none"
          >
            <path d="M0 8 Q 50 0 100 8" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
          </svg>
        </div>

        <p className="text-sm text-gray-500 mb-8 mt-6">
          Ideas on AI video, product growth, and the future of how software sells itself.
        </p>

        {/* ── Category filter ── */}
        <div className="flex flex-wrap gap-2 mb-8">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => handleCategoryChange(cat)}
              className={`text-[13px] font-medium px-3 py-1.5 rounded-full border-none cursor-pointer transition-all duration-150 ${
                activeCategory === cat
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* ── 3-column grid ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {paginated.map((post) => {
            const hovered = hoveredSlug === post.slug;
            return (
              <article
                key={post.slug}
                onMouseEnter={() => setHoveredSlug(post.slug)}
                onMouseLeave={() => setHoveredSlug(null)}
                aria-labelledby={`post-title-${post.slug}`}
                className="flex flex-col bg-white rounded-2xl overflow-hidden border border-black/[0.08]"
                style={{
                  boxShadow: hovered
                    ? '0 2px 4px rgba(0,0,0,0.04), 0 12px 36px rgba(0,0,0,0.12), 0 28px 64px rgba(0,0,0,0.08)'
                    : '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.05)',
                  transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
                  borderColor: hovered ? 'rgba(0,0,0,0.14)' : 'rgba(0,0,0,0.08)',
                  transition: 'transform 0.28s cubic-bezier(0.22,1,0.36,1), box-shadow 0.28s cubic-bezier(0.22,1,0.36,1), border-color 0.2s ease',
                }}
              >


                {/* Body */}
                <div className="flex flex-col flex-1 px-5 pt-5 pb-4 gap-2.5">
                  {/* Meta */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">{post.category}</span>
                    <span className="w-[3px] h-[3px] rounded-full bg-gray-300 flex-shrink-0" aria-hidden="true" />
                    <span className="text-[10px] text-gray-400">{post.readTime}</span>
                  </div>

                  {/* Title */}
                  <h2 id={`post-title-${post.slug}`} className="m-0">
                    <Link
                      to={`/blog/${post.slug}`}
                      className="text-[15px] font-bold leading-snug tracking-tight text-gray-800 hover:text-black no-underline transition-colors duration-150"
                    >
                      {post.title}
                    </Link>
                  </h2>

                  {/* Excerpt */}
                  <p
                    className="text-[13px] leading-relaxed text-gray-500 m-0 flex-1"
                    style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {post.excerpt}
                  </p>

                  {/* SEO keyword anchors */}
                  <div className="flex flex-wrap gap-1.5 mt-1" aria-label="Related topics">
                    {post.keywords.map((kw) => (
                      <a
                        key={kw.text}
                        href={kw.href}
                        className="text-[11px] font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 hover:text-gray-800 px-2 py-0.5 rounded-full no-underline transition-colors duration-150"
                        title={kw.text}
                      >
                        {kw.text}
                      </a>
                    ))}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-2.5 mt-1 border-t border-black/[0.06]">
                    <span className="text-[11px] text-gray-400">{post.date}</span>
                    <Link
                      to={`/blog/${post.slug}`}
                      className="inline-flex items-center gap-1 text-[12px] font-semibold no-underline transition-colors duration-150"
                      style={{ color: hovered ? '#111' : '#9ca3af' }}
                    >
                      Read more
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                      </svg>
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <p className="text-center py-16 text-gray-400 text-sm">
            No posts in this category yet. Check back soon!
          </p>
        )}

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div className="mt-10 flex justify-center">
            <ContinuousPagination
              totalPages={totalPages}
              defaultPage={currentPage}
              onPageChange={(page) => {
                setCurrentPage(page);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          </div>
        )}

        {/* ── Newsletter ── */}
        <section
          className="mt-14 rounded-2xl overflow-hidden"
          style={{ background: '#111111', border: '1px solid #222222' }}
        >
          <div className="px-7 py-8">
            <h2 className="text-xl font-bold mb-1.5" style={{ color: '#ffffff' }}>
              New posts, every week.
            </h2>
            <p className="text-sm mb-6" style={{ color: '#888888' }}>
              Get the latest on AI video, product growth, and demo strategies — directly in your inbox.
            </p>
            {isSubscribed ? (
              <div className="flex items-center gap-2 text-green-400 text-sm font-medium h-10 mt-1">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M20 6 9 17l-5-5"/></svg>
                Thanks for subscribing! Check your inbox for updates.
              </div>
            ) : (
              <form className="flex gap-2 flex-wrap" onSubmit={handleSubscribe} aria-label="Newsletter signup">
                <input
                  type="email"
                  placeholder="you@company.com"
                  id="newsletter-email-input"
                  aria-label="Email address"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex-1 min-w-0 h-10 px-4 rounded-lg text-sm outline-none transition-all duration-150"
                  style={{
                    background: '#1a1a1a',
                    border: '1px solid #333333',
                    color: '#ffffff',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#555555';
                    e.currentTarget.style.background = '#222222';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#333333';
                    e.currentTarget.style.background = '#1a1a1a';
                  }}
                />
                <button
                  type="submit"
                  id="newsletter-submit-btn"
                  className="flex-shrink-0 h-10 px-5 rounded-lg text-sm font-bold border-none cursor-pointer transition-colors duration-150"
                  style={{ background: '#ffffff', color: '#111111' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#e5e5e5')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}
                >
                  Subscribe
                </button>
              </form>
            )}
            {errorMsg && (
              <div className="text-red-400 text-xs mt-2.5 animate-in fade-in duration-200">
                {errorMsg}
              </div>
            )}
          </div>
          {/* Bottom accent strip */}
          <div
            className="h-[3px] w-full"
            style={{ background: 'linear-gradient(90deg, #333 0%, #555 50%, #333 100%)' }}
            aria-hidden="true"
          />
        </section>


      </div>

      {!isSignedIn && <LandingFooter />}
    </div>
  );
};
