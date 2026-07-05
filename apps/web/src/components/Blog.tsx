import { useAuth } from '@clerk/react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { API_URL } from '../config'
import { ContinuousPagination } from './ContinuousPagination'
import { LandingFooter } from './LandingFooter'
import { LandingNav } from './LandingNav'

interface Keyword {
  text: string
  href: string
}

interface BlogPost {
  slug: string
  category: string
  readTime: string
  date: string
  title: string
  excerpt: string
  gradient: string
  icon: string
  keywords: Keyword[]
  content: string[] // paragraphs of full article
}

const BLOG_POSTS: BlogPost[] = [
  {
    slug: 'why-every-saas-needs-a-demo-video',
    category: 'Product Marketing',
    readTime: '5 min read',
    date: 'May 28, 2026',
    title: 'Why Every SaaS Product Needs a Demo Video in 2026',
    excerpt:
      'B2B buyers watch multiple videos before talking to sales. A good demo video can cut sales cycles and increase sign-ups.',
    gradient: 'linear-gradient(135deg, #0f0f0f 0%, #1a1a2e 100%)',
    icon: '🎬',
    keywords: [
      { text: 'AI demo video generator', href: '/sign-up' },
      { text: 'product demo software', href: '/sign-up' },
      { text: 'SaaS demo video tool', href: '/sign-up' },
      { text: 'automated product video', href: '/sign-up' },
    ],
    content: [
      'In 2026, the average B2B buyer watches at least three product videos before booking a sales call. Most SaaS founders still rely on screenshots, PDFs, or rushed Loom recordings.',
      'A good demo video shows the product in motion. It guides the viewer and speaks to their pain points. Landing pages with embedded demo videos convert at a much higher rate.',
      'Production is expensive. A video agency costs up to $20,000. Recording it yourself takes hours, and the video becomes outdated as soon as your product changes.',
      'AI demo generation tools fix this. You provide a product URL and describe the flow. The AI agent browses the site, writes the script, records the walkthrough, and delivers a video in minutes.',
      'Early-stage founders can get a professional demo before launching on Product Hunt. Growth-stage companies can keep their library current without hiring a video team.',
      'The question is not whether you need a demo video. The question is how fast you can make one.',
    ],
  },
  {
    slug: 'ai-agents-replacing-screen-recorders',
    category: 'AI & Automation',
    readTime: '7 min read',
    date: 'May 22, 2026',
    title: 'How AI Agents Are Replacing Screen Recorders',
    excerpt:
      'Screen recording tools require manual clicking and editing. AI agents browse your product autonomously and deliver a finished video.',
    gradient: 'linear-gradient(135deg, #0a0a0a 0%, #0d1117 100%)',
    icon: '🤖',
    keywords: [
      { text: 'screen recording alternative', href: '/sign-up' },
      { text: 'AI product walkthrough', href: '/sign-up' },
      { text: 'no-edit demo video', href: '/sign-up' },
      { text: 'Loom alternative for SaaS', href: '/sign-up' },
    ],
    content: [
      'Screen recorders like Loom democratized video creation, but a human still has to do all the work. You have to click, narrate, and edit.',
      'AI agents perform the actions themselves. They navigate the product, fill forms, and record everything.',
      'You give the agent a URL and a description. It opens a browser, explores the product, captures footage, writes a script, and synthesizes a video with voiceover.',
      'The result looks like a professionally produced demo because the agent applies standard production principles quickly.',
      'Teams that used to spend six hours on a video now spend a fraction of that time. They only need to review the final output.',
      'AI agents can also generate demos in multiple languages and with different voice personas from a single prompt. Screen recorders cannot do that.',
    ],
  },
  {
    slug: 'onboarding-videos-reduce-churn',
    category: 'Customer Success',
    readTime: '6 min read',
    date: 'May 15, 2026',
    title: 'Onboarding Videos That Actually Reduce Churn',
    excerpt:
      'Users who never reach their aha moment churn quickly. Contextual onboarding videos increase activation rates and reduce support tickets.',
    gradient: 'linear-gradient(135deg, #0f0f0f 0%, #111827 100%)',
    icon: '📈',
    keywords: [
      { text: 'reduce SaaS churn', href: '/sign-up' },
      { text: 'user onboarding video', href: '/sign-up' },
      { text: 'product activation rate', href: '/sign-up' },
      { text: 'customer success automation', href: '/sign-up' },
    ],
    content: [
      "Users who churn in the first 30 days usually leave because they never saw the product's value.",
      'Showing is better than telling. An onboarding video that walks a new user through their first action reduces time to value.',
      'SaaS companies with in-product video onboarding see better activation rates. Support tickets drop because users understand the product.',
      'Keeping these videos updated is difficult. When the UI changes, the video becomes confusing. Teams spend too much time re-recording.',
      "AI video tools solve this problem. You point the tool at the updated product, and it generates a new walkthrough. You don't have to re-record or hire an editor.",
      'Companies that retain users treat onboarding videos as dynamic assets that they update constantly.',
    ],
  },
  {
    slug: 'pitch-deck-vs-demo-video',
    category: 'Sales',
    readTime: '4 min read',
    date: 'May 8, 2026',
    title: 'Pitch Deck vs. Demo Video: Which Converts More Leads?',
    excerpt:
      'Slide decks require cognitive effort. Demo videos are dynamic and memorable. Prospects who watch a demo video book more discovery calls.',
    gradient: 'linear-gradient(135deg, #080808 0%, #1c1c1c 100%)',
    icon: '📊',
    keywords: [
      { text: 'demo video for investors', href: '/sign-up' },
      { text: 'startup pitch video', href: '/sign-up' },
      { text: 'B2B lead conversion video', href: '/sign-up' },
      { text: 'sales demo automation', href: '/sign-up' },
    ],
    content: [
      'We tested outreach campaigns targeting mid-market SaaS buyers. Half got a PDF pitch deck, and half got a two-minute demo video. The results were clear.',
      'The demo video group booked three times more discovery calls. They also replied more often and asked fewer basic questions.',
      'Pitch decks make the reader work. They have to map features to their own use case. A demo video shows the product solving a real problem in context.',
      "For investor pitches, a 90-second demo establishes the product's reality. The investor sees it work, and the deck provides the financial details.",
      'Founders should lead with video and follow with the deck. The video builds credibility, and the deck tells the business story.',
    ],
  },
  {
    slug: 'product-hunt-launch-video-guide',
    category: 'Growth',
    readTime: '8 min read',
    date: 'Apr 30, 2026',
    title: 'The Ultimate Guide to a Product Hunt Launch Video',
    excerpt:
      'Product Hunt visitors decide whether to engage in five seconds. Listings with a high-quality demo video get twice as many upvotes.',
    gradient: 'linear-gradient(135deg, #0a0a0a 0%, #161616 100%)',
    icon: '🚀',
    keywords: [
      { text: 'Product Hunt launch video', href: '/sign-up' },
      { text: 'startup launch demo', href: '/sign-up' },
      { text: 'founder marketing tool', href: '/sign-up' },
      { text: 'video for Product Hunt', href: '/sign-up' },
    ],
    content: [
      'Product Hunt traffic moves quickly. Visitors glance at your listing and decide instantly whether to stay. A great demo video is the best asset you can add.',
      'Listings with a demo video earn more upvotes and have higher save rates. Visitors find the product compelling enough to return.',
      'The ideal video is 60 to 90 seconds. State the problem first. Then show the product solving it. End with a clear next step.',
      'Narration should be fast and conversational. Product Hunt users prefer directness over formal delivery.',
      'The first frame matters. Product Hunt uses it as a thumbnail. Pick a frame that shows the main interface instead of a title card.',
      'AI tools let you generate a Product Hunt demo quickly. You describe the flow and pick a voice, and the AI produces a professional video.',
    ],
  },
  {
    slug: 'scaling-content-production-ai',
    category: 'AI & Automation',
    readTime: '6 min read',
    date: 'Apr 22, 2026',
    title: "Scaling Video Content Production with AI: A Founder's Playbook",
    excerpt:
      'AI video generation allows small teams to produce content at the speed of a full production house.',
    gradient: 'linear-gradient(135deg, #0d0d0d 0%, #0a1628 100%)',
    icon: '⚡',
    keywords: [
      { text: 'AI video content creation', href: '/sign-up' },
      { text: 'generate product video from URL', href: '/sign-up' },
      { text: 'video marketing automation', href: '/sign-up' },
      { text: 'founder content strategy', href: '/sign-up' },
    ],
    content: [
      'Top SaaS companies produce videos constantly. They publish feature announcements, tutorials, social clips, and investor updates every week.',
      'They use AI content systems. When a product update ships, an AI tool generates a walkthrough video. The team distributes it across email and social media.',
      'Founders with small teams can match the output of larger companies without hiring a video crew.',
      'First, define your content types, like tutorials and customer stories. Next, make a template for each type. Then, use AI to fill those templates when you have something to share.',
      'Video production is now an operational task, not a creative bottleneck. Humans still make creative decisions, but the software handles the recording and editing.',
      'Founders who adopt this approach build content libraries that attract users long after the initial publish date.',
    ],
  },
  {
    slug: 'b2b-cold-outreach-video',
    category: 'Sales',
    readTime: '5 min read',
    date: 'Apr 14, 2026',
    title: 'Using Personalized Demo Videos in B2B Cold Outreach',
    excerpt:
      'Cold emails with a GIF thumbnail linking to a personalized demo get higher reply rates than text-only emails.',
    gradient: 'linear-gradient(135deg, #0f0f0f 0%, #1a0a0a 100%)',
    icon: '✉️',
    keywords: [
      { text: 'cold email demo video', href: '/sign-up' },
      { text: 'B2B outreach automation', href: '/sign-up' },
      { text: 'personalized product demo', href: '/sign-up' },
      { text: 'video prospecting tool', href: '/sign-up' },
    ],
    content: [
      'Cold email is getting harder. Inboxes are full, and buyers ignore generic pitches. Successful teams send highly relevant messages.',
      "One effective technique is putting a GIF thumbnail in the email that links to a short demo video. The GIF auto-plays and catches the reader's attention.",
      'Reply rates are higher than for text-only emails. A video shows that you took the time to create something real.',
      'AI generated videos make personalization scale. You can create different versions of your demo for different industries, highlighting the features they care about most.',
      'You create a base template, use AI to generate vertical-specific versions, and put the GIF thumbnails in your emails.',
      'For founder-led sales, a demo video proves the product works before the prospect even logs in.',
    ],
  },
  {
    slug: 'future-of-product-demos',
    category: 'Industry Trends',
    readTime: '9 min read',
    date: 'Apr 5, 2026',
    title: 'The Future of Product Demos: Interactive, AI-Narrated, and On-Demand',
    excerpt:
      "Next-generation product demos will be interactive, tailored to the viewer's role, and generated instantly.",
    gradient: 'linear-gradient(135deg, #080808 0%, #0f1a0f 100%)',
    icon: '🔮',
    keywords: [
      { text: 'interactive product demo', href: '/sign-up' },
      { text: 'AI-narrated demo video', href: '/sign-up' },
      { text: 'on-demand software demo', href: '/sign-up' },
      { text: 'future of SaaS marketing', href: '/sign-up' },
    ],
    content: [
      'The product demo is changing. Three forces are altering what a demo is and how buyers watch it.',
      'First, AI voice synthesis is getting better. Producing a professionally narrated demo is now cheap and easy.',
      'Second, products will generate demos on demand. An enterprise buyer in healthcare will see a different demo than a startup founder in fintech.',
      'Third, demos are becoming interactive. Viewers can choose different paths, ask questions, and explore features without a sales rep.',
      'Software products will soon have personalized sales agents built into their marketing. Demos will become conversations.',
      'Companies that use AI video today are preparing for this future. Interactive, personalized demos are the goal, and AI video is the first step.',
      'Founders should make video a core part of their strategy now to stay competitive.',
    ],
  },
  {
    slug: 'voice-selection-demo-videos',
    category: 'Product Tips',
    readTime: '3 min read',
    date: 'Mar 28, 2026',
    title: 'Picking the Right AI Voice for Your Demo Video',
    excerpt:
      'Voice tone and pace affect how users perceive your product. We tested AI voices to find out what works best for SaaS.',
    gradient: 'linear-gradient(135deg, #0a0a0a 0%, #1a1010 100%)',
    icon: '🎙️',
    keywords: [
      { text: 'AI voice for product demo', href: '/sign-up' },
      { text: 'text to speech demo video', href: '/sign-up' },
      { text: 'AI narration tool', href: '/sign-up' },
      { text: 'best voice for SaaS demo', href: '/sign-up' },
    ],
    content: [
      "The voice in your demo video matters. In our tests, the choice of voice changed how people rated the product's quality.",
      'The best voices speak at a moderate pace, sound warm but neutral, and feel natural. Voices that sound like a confident coworker work best.',
      'For tools aimed at developers, a precise and neutral delivery is better than a marketing voice. Developers prefer directness. Consumer products benefit from a conversational tone.',
      'A neutral American accent performed well across global audiences, but natural cadence was more important. A voice with slight variations in rhythm beat a smooth but robotic delivery.',
      'You should test a few voice options on your audience before committing to one. The differences are small, but they add up over time.',
      'You can generate the same demo with different voices and test them directly. The data is worth the effort.',
    ],
  },
  {
    slug: 'best-ai-tools-for-startup-founders-2026',
    category: 'Growth',
    readTime: '8 min read',
    date: 'May 30, 2026',
    title: 'Best AI Tools for Startup Founders in 2026',
    excerpt: 'Top founders use AI tools to build, sell, and fundraise faster with smaller teams.',
    gradient: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)',
    icon: '🛠️',
    keywords: [
      { text: 'best AI tools for startups 2026', href: '/sign-up' },
      { text: 'AI tools for founders', href: '/sign-up' },
      { text: 'startup productivity with AI', href: '/sign-up' },
      { text: 'AI software for entrepreneurs', href: '/sign-up' },
    ],
    content: [
      'Successful startups run lean because AI handles many tasks. Founders use a specific set of tools to build and grow.',
      'For engineering, Cursor and GitHub Copilot are standard. AI also handles QA, documentation, and automated testing.',
      'For marketing, AI writes drafts and generates images. AI video tools create product demos from a URL, replacing a production team.',
      'For sales, AI SDRs prospect and send outreach. They research targets and write personalized emails, so humans only talk to qualified leads.',
      'For fundraising, AI helps write narratives and prepare documents. Founders use AI demo videos to show investors the product before they meet.',
      'For support, AI agents handle basic questions. A company that once needed a support rep for 100 customers can now manage 1,000.',
      'Using these tools across all functions creates a huge advantage. Founders who adopt AI early build better habits as they scale.',
    ],
  },
  {
    slug: 'ai-go-to-market-strategy-saas',
    category: 'Growth',
    readTime: '7 min read',
    date: 'May 26, 2026',
    title: 'How to Build an AI-Powered Go-to-Market Strategy for SaaS',
    excerpt:
      'AI changes how SaaS companies attract and retain customers. This is the go-to-market playbook for 2026.',
    gradient: 'linear-gradient(135deg, #0f0f0f 0%, #0a1628 100%)',
    icon: '🎯',
    keywords: [
      { text: 'AI go-to-market strategy SaaS', href: '/sign-up' },
      { text: 'GTM automation for startups', href: '/sign-up' },
      { text: 'AI-powered sales funnel', href: '/sign-up' },
      { text: 'product-led growth AI', href: '/sign-up' },
    ],
    content: [
      'Building a go-to-market strategy used to take years. AI makes it faster. A small team can now do the work of a large department.',
      'The AI GTM stack covers awareness, conversion, activation, and retention. Most of these steps are now automatable.',
      'For awareness, AI tools find your ideal customers and generate content like blog posts and social media threads.',
      'For conversion, AI demo videos are essential. They help prospects understand the product in 90 seconds without a sales call.',
      'For activation, AI onboarding sequences guide users. Video walkthroughs show users what to do based on their actions in the product.',
      'For retention, AI watches usage patterns to spot users who might leave. It sends automatic messages or videos to bring them back.',
      'Founders who set up this system early gain a lasting advantage. The system improves with every customer interaction.',
    ],
  },
  {
    slug: 'replace-sales-engineer-ai-demo-automation',
    category: 'Sales',
    readTime: '6 min read',
    date: 'May 20, 2026',
    title: 'How AI Demo Automation Is Replacing the Sales Engineer Role',
    excerpt:
      'Sales engineers are expensive. AI demo tools do most of their work quickly and cheaply. This changes how sales organizations are built.',
    gradient: 'linear-gradient(135deg, #0f0f0f 0%, #1a0808 100%)',
    icon: '🔧',
    keywords: [
      { text: 'AI sales engineer alternative', href: '/sign-up' },
      { text: 'demo automation software', href: '/sign-up' },
      { text: 'automated sales demo tool', href: '/sign-up' },
      { text: 'replace sales engineer with AI', href: '/sign-up' },
    ],
    content: [
      'Sales engineers build custom demos and answer technical questions. They are expensive and hard to find. AI now does most of this work.',
      'AI demo tools take a product URL and generate a custom, narrated demo in minutes. The demo shows the exact features a prospect needs to see.',
      'A sales engineer costs over $150,000 a year. An AI demo tool costs much less and scales instantly. Startups get enterprise-quality demos without the high salary.',
      "Sales engineers aren't going away entirely. They will focus on complex technical work and custom setups. But the basic custom demo is now automated.",
      'Founders can delay hiring their first sales engineer. They can rely on AI until they reach higher revenue levels, and then hire people for advanced deals.',
      'Companies that treat demo generation as a software feature move faster. Every prospect gets a custom demo immediately.',
    ],
  },
  {
    slug: 'ai-for-investor-fundraising-demo',
    category: 'Growth',
    readTime: '5 min read',
    date: 'May 13, 2026',
    title: 'How Founders Are Using AI Demo Videos to Close Investor Meetings',
    excerpt:
      'Founders who send a 90-second AI demo video get more initial meetings with investors than those who only send pitch decks.',
    gradient: 'linear-gradient(135deg, #0a0a0a 0%, #0d0d1a 100%)',
    icon: '💼',
    keywords: [
      { text: 'AI demo video for investors', href: '/sign-up' },
      { text: 'startup fundraising demo video', href: '/sign-up' },
      { text: 'Series A pitch video', href: '/sign-up' },
      { text: 'investor outreach video tool', href: '/sign-up' },
    ],
    content: [
      'Fundraising requires reaching out to many investors who read dozens of emails a day. You need to show them that you built something real.',
      'A short cold email with a link to a 90-second demo video works well. The video does the selling.',
      'Investors who watch the demo enter the first meeting already understanding the product. The meeting focuses on the business, not basic explanations.',
      'A fundraising demo should state the problem, walk through the product, and end with traction numbers.',
      'Generating this video takes very little time with AI tools. You can make different versions for different types of investors.',
      'Founders who make a demo video before they start outreach book more meetings and get to term sheets faster.',
    ],
  },
  {
    slug: 'async-demo-vs-live-demo-saas-sales',
    category: 'Sales',
    readTime: '5 min read',
    date: 'May 5, 2026',
    title: 'Async Demo vs. Live Demo: Which Converts More SaaS Deals?',
    excerpt:
      'Live demos require scheduling and have low show-up rates. Async AI demos run constantly. Data shows which one closes more deals.',
    gradient: 'linear-gradient(135deg, #0a0a0a 0%, #101a10 100%)',
    icon: '⚖️',
    keywords: [
      { text: 'async sales demo SaaS', href: '/sign-up' },
      { text: 'self-serve product demo', href: '/sign-up' },
      { text: 'automated demo vs live demo', href: '/sign-up' },
      { text: 'AI demo for self-serve sales', href: '/sign-up' },
    ],
    content: [
      "Live demos have problems. You need a sales rep and a scheduled time. Many prospects don't show up, and the rep wastes an hour.",
      'Async demos let the prospect watch a recorded video on their own time. You can see who watched and which parts they replayed. This shows their buying intent.',
      'For smaller deals, async demos close faster than live demos. Buyers want to evaluate the product on their own without sales pressure.',
      'For larger deals, start with an async demo to qualify the buyer, and then follow up with a live technical demo.',
      'You should put your AI generated demo library at the start of your sales funnel. Every piece of marketing should link to an async demo.',
      'Teams using this method report lower costs and higher win rates because the async content pre-qualifies the prospects.',
    ],
  },
  {
    slug: 'generative-ai-product-marketing-2026',
    category: 'Product Marketing',
    readTime: '7 min read',
    date: 'Apr 28, 2026',
    title: 'How Generative AI Is Transforming Product Marketing in 2026',
    excerpt:
      'Product marketing teams use generative AI to make launch assets and demo videos faster without adding headcount.',
    gradient: 'linear-gradient(135deg, #080808 0%, #1a1208 100%)',
    icon: '✨',
    keywords: [
      { text: 'generative AI for product marketing', href: '/sign-up' },
      { text: 'AI product launch assets', href: '/sign-up' },
      { text: 'AI marketing automation 2026', href: '/sign-up' },
      { text: 'PMM AI tools', href: '/sign-up' },
    ],
    content: [
      'Product marketing is difficult. Marketers handle launches, positioning, and sales materials, often by themselves.',
      'Generative AI automates writing and video production. This lets product marketers focus on strategy.',
      'AI creates launch assets quickly. A product launch needs videos, social graphics, and blog posts. AI tools generate all of these in hours instead of weeks.',
      'AI also helps with competitive intelligence. It monitors competitor websites and updates battlecards automatically.',
      'Demo video production is much faster. An AI agent browses the product and delivers a finished video in minutes, bypassing the need for a video crew.',
      'Product marketers who use AI workflows produce more work at higher quality because the software handles the execution.',
    ],
  },
  {
    slug: 'chatgpt-perplexity-product-discovery-2026',
    category: 'Industry Trends',
    readTime: '6 min read',
    date: 'Apr 18, 2026',
    title: 'How Buyers Now Discover Software via ChatGPT and Perplexity',
    excerpt:
      'Software buyers use ChatGPT and Perplexity for research. SaaS companies need to optimize their content for these AI engines.',
    gradient: 'linear-gradient(135deg, #0a0a0a 0%, #0a0a1a 100%)',
    icon: '🔍',
    keywords: [
      { text: 'ChatGPT product discovery SEO', href: '/sign-up' },
      { text: 'LLM SEO strategy 2026', href: '/sign-up' },
      { text: 'Perplexity software recommendations', href: '/sign-up' },
      { text: 'generative engine optimization', href: '/sign-up' },
    ],
    content: [
      'The way people buy B2B software is changing. Many buyers now ask ChatGPT or Perplexity instead of searching Google.',
      'This requires a new strategy. Generative Engine Optimization means optimizing for the sources that LLMs cite.',
      'LLMs answer questions by reading blogs, documentation, and reviews. They look for authoritative content.',
      'SaaS companies need to answer the specific questions buyers ask LLMs. You need content that explains why your tool is the best option.',
      "Clear structure and comprehensive answers are more important than keyword density. LLMs prefer content that actually solves the user's problem.",
      'Companies that optimize for LLMs now will have an advantage as AI discovery becomes the standard way people research software.',
    ],
  },
  {
    slug: 'zero-shot-demo-video-from-url',
    category: 'AI & Automation',
    readTime: '4 min read',
    date: 'Apr 10, 2026',
    title: 'Zero-Shot Demo Video: Generate a Product Walkthrough from Just a URL',
    excerpt:
      'You can generate a professional demo video by giving an AI agent a product URL. No script or editor required.',
    gradient: 'linear-gradient(135deg, #0d0d0d 0%, #0d1a0d 100%)',
    icon: '🎥',
    keywords: [
      { text: 'generate demo video from URL', href: '/sign-up' },
      { text: 'zero-shot product demo AI', href: '/sign-up' },
      { text: 'automatic product walkthrough generator', href: '/sign-up' },
      { text: 'AI video from website URL', href: '/sign-up' },
    ],
    content: [
      'Zero-shot video generation is now possible. You give an AI a URL, and it produces a video that looks manually created.',
      'An AI agent opens a browser and navigates the product. It finds the core user flows, like sign-up and main features.',
      "It records the screen and writes a script based on what it sees. The tone matches the product's target audience.",
      'The AI synthesizes the voice and adds transitions. The final video is ready to embed or share.',
      'This process takes minutes. For most products, the output needs no editing. You can also give the AI specific instructions if needed.',
      'This changes video marketing. You can automatically create a new demo video for every product update.',
    ],
  },
  {
    slug: 'product-led-growth-ai-2026',
    category: 'Growth',
    readTime: '8 min read',
    date: 'Mar 20, 2026',
    title: 'Product-Led Growth + AI: The 2026 Playbook',
    excerpt:
      'Product-led growth companies that use AI for demos and onboarding grow revenue much faster.',
    gradient: 'linear-gradient(135deg, #0a0a0a 0%, #0a1a0a 100%)',
    icon: '📡',
    keywords: [
      { text: 'product-led growth AI strategy', href: '/sign-up' },
      { text: 'AI for PLG SaaS 2026', href: '/sign-up' },
      { text: 'self-serve funnel automation', href: '/sign-up' },
      { text: 'PLG AI onboarding video', href: '/sign-up' },
    ],
    content: [
      'Product-led growth lets products sell themselves. AI makes this model even better.',
      'AI helps at every stage. AI demos educate prospects before they sign up. AI onboarding guides users, and predictive signals show who is ready to pay.',
      'Many PLG companies lack good demo videos. AI lets you generate different demos for different types of users, highlighting relevant features.',
      'AI improves onboarding. Instead of a linear guide, AI watches user behavior and shows video walkthroughs exactly when the user gets stuck.',
      'AI also helps with expansion. It predicts which free users will upgrade. Automated messages convert them before they leave.',
      'PLG companies that integrate AI into their self-serve funnels grow faster and activate users more efficiently.',
    ],
  },
]

const CATEGORIES = [
  'All',
  'AI & Automation',
  'Product Marketing',
  'Sales',
  'Growth',
  'Customer Success',
  'Product Tips',
  'Industry Trends',
]

// ── Individual post page ───────────────────────────────────────────────
export const BlogPostView = () => {
  const { isSignedIn } = useAuth()
  const { slug } = useParams<{ slug: string }>()
  const post = BLOG_POSTS.find(p => p.slug === slug)

  if (!post) {
    return (
      <div className={`min-h-screen flex flex-col ${isSignedIn ? '' : 'bg-[#FDFDFD]'}`}>
        {!isSignedIn && <LandingNav />}
        <div className="max-w-6xl mx-auto px-6 pt-12 pb-16 flex-1">
          <Link
            to="/blog"
            className="text-sm text-gray-400 hover:text-gray-700 transition-colors mb-6 inline-flex items-center gap-1.5 no-underline"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 12H5" />
              <path d="m12 19-7-7 7-7" />
            </svg>
            Back to Blog
          </Link>
          <h1 className="text-2xl font-bold text-gray-800 mt-4">Post not found.</h1>
        </div>
        {!isSignedIn && <LandingFooter />}
      </div>
    )
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
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
          Back to Blog
        </Link>

        {/* Meta */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">
            {post.category}
          </span>
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
            <path
              d="M0 8 Q 50 0 100 8"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
            />
          </svg>
        </div>

        {/* Article body */}
        <div className="space-y-5 text-gray-600 leading-relaxed mt-4">
          {post.content.map((paragraph, i) => (
            <p key={i} className="text-[15px] leading-[1.8]">
              {paragraph}
            </p>
          ))}
        </div>

        {/* SEO keyword anchors */}
        <div className="flex flex-wrap gap-2 mt-10 pt-8 border-t border-black/[0.07]">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400 w-full mb-1">
            Related topics
          </span>
          {post.keywords.map(kw => (
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
              Drop your product URL and let Pitch generate a cinematic, narrated demo video in
              minutes.
            </p>
            <Link
              to="/sign-up"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold no-underline transition-colors duration-150"
              style={{ background: '#ffffff', color: '#111111' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#e5e5e5')}
              onMouseLeave={e => (e.currentTarget.style.background = '#ffffff')}
            >
              Generate a demo free
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
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
  )
}

// ── Blog listing page ──────────────────────────────────────────────────
export const Blog = () => {
  const { isSignedIn } = useAuth()
  const [activeCategory, setActiveCategory] = useState('All')
  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [email, setEmail] = useState('')
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return

    setErrorMsg(null)
    try {
      const res = await fetch(`${API_URL}/newsletter/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: email.trim() }),
      })

      const data = await res.json().catch(() => ({}))

      if (res.ok && data.success) {
        setIsSubscribed(true)
        setEmail('')
      } else {
        setErrorMsg(data.error || data.message || 'Failed to subscribe. Please try again.')
      }
    } catch (err) {
      console.error('Failed to subscribe:', err)
      setErrorMsg('Network error. Please try again.')
    }
  }

  const POSTS_PER_PAGE = 6

  const filtered =
    activeCategory === 'All' ? BLOG_POSTS : BLOG_POSTS.filter(p => p.category === activeCategory)

  const totalPages = Math.ceil(filtered.length / POSTS_PER_PAGE)
  const paginated = filtered.slice((currentPage - 1) * POSTS_PER_PAGE, currentPage * POSTS_PER_PAGE)

  const handleCategoryChange = (cat: string) => {
    setActiveCategory(cat)
    setCurrentPage(1)
  }

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
            <path
              d="M0 8 Q 50 0 100 8"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <p className="text-sm text-gray-500 mb-8 mt-6">
          Ideas on AI video, product growth, and the future of how software sells itself.
        </p>

        {/* ── Category filter ── */}
        <div className="flex flex-wrap gap-2 mb-8">
          {CATEGORIES.map(cat => (
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
          {paginated.map(post => {
            const hovered = hoveredSlug === post.slug
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
                  transition:
                    'transform 0.28s cubic-bezier(0.22,1,0.36,1), box-shadow 0.28s cubic-bezier(0.22,1,0.36,1), border-color 0.2s ease',
                }}
              >
                {/* Body */}
                <div className="flex flex-col flex-1 px-5 pt-5 pb-4 gap-2.5">
                  {/* Meta */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">
                      {post.category}
                    </span>
                    <span
                      className="w-[3px] h-[3px] rounded-full bg-gray-300 flex-shrink-0"
                      aria-hidden="true"
                    />
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
                    {post.keywords.map(kw => (
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
                      <svg
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M5 12h14" />
                        <path d="m12 5 7 7-7 7" />
                      </svg>
                    </Link>
                  </div>
                </div>
              </article>
            )
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
              onPageChange={page => {
                setCurrentPage(page)
                window.scrollTo({ top: 0, behavior: 'smooth' })
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
              Get the latest on AI video, product growth, and demo strategies — directly in your
              inbox.
            </p>
            {isSubscribed ? (
              <div className="flex items-center gap-2 text-green-400 text-sm font-medium h-10 mt-1">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                Thanks for subscribing! Check your inbox for updates.
              </div>
            ) : (
              <form
                className="flex gap-2 flex-wrap"
                onSubmit={handleSubscribe}
                aria-label="Newsletter signup"
              >
                <input
                  type="email"
                  placeholder="you@company.com"
                  id="newsletter-email-input"
                  aria-label="Email address"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="flex-1 min-w-0 h-10 px-4 rounded-lg text-sm outline-none transition-all duration-150"
                  style={{
                    background: '#1a1a1a',
                    border: '1px solid #333333',
                    color: '#ffffff',
                  }}
                  onFocus={e => {
                    e.currentTarget.style.borderColor = '#555555'
                    e.currentTarget.style.background = '#222222'
                  }}
                  onBlur={e => {
                    e.currentTarget.style.borderColor = '#333333'
                    e.currentTarget.style.background = '#1a1a1a'
                  }}
                />
                <button
                  type="submit"
                  id="newsletter-submit-btn"
                  className="flex-shrink-0 h-10 px-5 rounded-lg text-sm font-bold border-none cursor-pointer transition-colors duration-150"
                  style={{ background: '#ffffff', color: '#111111' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#e5e5e5')}
                  onMouseLeave={e => (e.currentTarget.style.background = '#ffffff')}
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
  )
}
