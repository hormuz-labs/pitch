# Go-To-Market Plan — Pitch (trypitch.co)

*Last updated: 2026-05-18*

---

## Phase 0: Foundation (Week 1-2)

### Product Marketing Context
- [x] Create `.agents/product-marketing.md` — centralized positioning doc
- [x] Build messaging hierarchy (one-liner, value props, proof points per persona) — in `.agents/product-marketing.md`
- [x] Create competitor battle cards (Loom, Synthesia, HeyGen, Navattic, Walnut) — `.agents/competitor-battle-cards.md`

### Website & Conversion Optimization
- [x] Add `/pricing.md` machine-readable file for AI agents — `apps/web/public/pricing.md`
- [x] Add `/llms.txt` for AI system context — `apps/web/public/llms.txt`
- [x] Implement FAQ schema on landing page — visible FAQ section + FAQPage JSON-LD in `index.html`
- [ ] Add social proof section (logos, testimonials, use cases) — blocked on real logos/quotes
- [ ] Create demo video gallery (3-5 sample videos across industries) — blocked on sample video URLs
- [ ] Add "Powered by Pitch" watermark with link on free tier videos — backend render change, separate task

### Technical SEO & AI Visibility
- [x] Robots.txt: Allow GPTBot, PerplexityBot, ClaudeBot, Google-Extended — `apps/web/public/robots.txt` (also OAI, Apple, CCBot, cohere)
- [ ] Submit sitemap to Google Search Console — sitemap.xml shipped, GSC submission must be done from your account
- [x] Set up GA4 with conversion tracking (sign-up, first video generated) — gtag G-VC3NZ72GWY wired in `index.html`; conversion events still need to be defined in GA4
- [x] Create `llms.txt` and `pricing.md` files
- [x] Add structured data (Product, FAQ, HowTo schemas) — JSON-LD @graph in `index.html` (Organization, WebSite, SoftwareApplication+Offers, HowTo, FAQPage)

---

## Phase 1: Launch (Week 3-4)

### Product Hunt Launch
- [ ] **Pre-launch (2 weeks before)**
  - [ ] Build maker account, add co-makers
  - [ ] Create hunter shortlist (reach out 1 week before)
  - [ ] Prepare assets: thumbnail, gallery, video, tagline
  - [ ] Draft launch day posts (Twitter, LinkedIn, communities)
  - [ ] Line up 20-30 supporters to engage on launch day
- [ ] **Launch day**
  - [ ] Post at 12:01 AM PT
  - [ ] First comment: founder story + "ask me anything"
  - [ ] Share across all channels simultaneously
  - [ ] Respond to every comment within 1 hour
- [ ] **Post-launch**
  - [ ] Thank supporters publicly
  - [ ] Repurpose launch content into blog posts
  - [ ] Capture emails from interested commenters

### Betalist
- [ ] Submit 1 week before Product Hunt (stagger launches)
- [ ] Use same assets, tailor description for early-adopter audience
- [ ] Engage with other Betalist submissions (community reciprocity)

### Launch Content
- [ ] "How We Built Pitch" — behind-the-scenes blog post
- [ ] "The State of Product Demo Videos 2026" — data-driven thought leadership
- [ ] Founder LinkedIn post series (3 posts over launch week)
- [ ] Twitter/X thread: "We turned website URLs into cinematic videos. Here's how."

---

## Phase 2: Outbound Engine (Week 4-8)

### Cold Email System

#### Infrastructure (Fix spam issue first)
- [ ] Set up dedicated sending domains (not trypitch.co — use getpitch.io or similar)
- [ ] Configure SPF, DKIM, DMARC records
- [ ] Set up Google Workspace / Outlook for sending
- [ ] Warm up inboxes for 14 days before sending (use Lemlist Warmup or Instantly)
- [ ] Start at 20 emails/day/inbox, ramp to 50/day over 3 weeks
- [ ] Use 3-5 sending inboxes minimum for volume

#### ICP Targeting
- [ ] **Recently funded startups** (Crunchbase, AngelList, PitchBook)
  - Filter: Seed to Series A, last 90 days
  - Why: Need investor updates, pitch videos, website refreshes
- [ ] **Incubator/accelerator cohorts** (EF, Antler, YC, Techstars)
  - Filter: Current and recent cohorts
  - Why: Demo day prep, investor materials, time-constrained
- [ ] **Product-led SaaS companies** (G2, Product Hunt makers)
  - Filter: 10-200 employees, active product updates
  - Why: Need demo content for website, sales, onboarding
- [ ] **Agencies** (design, marketing, video production)
  - Filter: 5-50 employees, B2B focus
  - Why: Can white-label, high volume, recurring need

#### Email Sequences (5 emails each)

**Sequence 1: Recently Funded Startups**
```
Email 1 — Trigger + Insight
Subject: congrats on the raise
Body: Saw the [round] news — congrats. That usually means you're updating 
the website, prepping investor materials, and recording a hundred Looms. 
We built something that turns your URL into a narrated, cinematic demo 
video in minutes. No recording, no editing. [Company] used it for their 
Series A update and got it done in one afternoon. Worth a look?

Email 2 — Social Proof
Subject: demo video example
Body: Here's what it looks like when it's done: [link to sample]. 
The agent navigates your site, writes the script, records it, adds 
voiceover and smooth cursor animations. You just tell it what to show. 
Want me to generate one for your site?

Email 3 — Use Case
Subject: investor update video
Body: Most founders we talk to are using Pitch videos for:
- Investor update emails (attach the MP4)
- Website hero sections (embed on homepage)
- Sales outreach (send to prospects instead of a deck)
One video, three uses. Takes 3 credits (~$3 on Starter).

Email 4 — Objection Handling
Subject: quick question
Body: I know what you're thinking — "another AI tool that makes generic videos." 
This isn't a talking head. It's your actual product, being navigated by an 
AI agent, with cinematic effects (smooth cursor, zoom, color grading). 
Think of it like a film crew that works in minutes, not weeks. 
Open to seeing what it makes of your site?

Email 5 — Breakup
Subject: last one from me
Body: I'll stop reaching out — but if you ever need a product demo video 
without the production hassle, we're at trypitch.co. First few videos are 
on us. Good luck with [specific company goal/news].
```

**Sequence 2: Incubator/Accelerator Teams**
```
Email 1 — Trigger + Value
Subject: demo day prep
Body: Demo day is [X weeks] away. You're probably thinking about your pitch 
deck, your 2-minute presentation, and how to show your product without 
a live demo (which always breaks). We built Pitch — drop your URL, 
describe what you want shown, and get a cinematic narrated video in minutes. 
A few [program name] teams have already used it. Want me to make one for yours?

Email 2 — Proof
Subject: what teams are making
Body: [Link to 2-3 sample videos]. These were all generated autonomously — 
no recording, no editing, no voice actor. The AI navigates the site, 
writes the script, and produces a 1080p MP4. Perfect for demo day, 
investor emails, or your website. Want one for [company]?

Email 3 — Urgency
Subject: before demo day
Body: One thing we've learned: teams that have a polished product video 
before demo day get 3x more follow-up meetings. It's the difference 
between "tell me more" and "send me the deck." Takes 15 minutes to 
generate. Happy to set you up with free credits.

Email 4 — Breakup
Subject: good luck with demo day
Body: Last email from me. If you need a product video before demo day, 
we're at trypitch.co. First videos are free. Rooting for you.
```

#### Tools & Stack
- [ ] **Email finding:** Snov.io, Apollo.io, or Clay
- [ ] **Sending:** Lemlist or Instantly.ai (better deliverability than Snov.io for sending)
- [ ] **Warmup:** Built-in warmup (Lemlist/Instantly) + Mailreach for monitoring
- [ ] **Tracking:** HubSpot Free or Pipedrive for CRM
- [ ] **Enrichment:** Clay or Apollo for firmographic data

### LinkedIn Outreach

#### Profile Optimization
- [ ] Headline: "I turn websites into cinematic product demo videos | Founder @ Pitch"
- [ ] Banner: Screenshot of Pitch in action with CTA
- [ ] About: Founder story + what Pitch does + who it's for
- [ ] Featured: Link to sample video, landing page, Product Hunt launch

#### Content Strategy (3-5 posts/week)
- [ ] **Monday:** Industry insight ("Why every startup needs a product demo video")
- [ ] **Tuesday:** Behind-the-scenes ("How we built the cinematic cursor engine")
- [ ] **Wednesday:** Customer/demo showcase (video post of a Pitch-generated demo)
- [ ] **Thursday:** Thought leadership ("The end of screen recording")
- [ ] **Friday:** Personal/founder journey ("What I learned building in public")

#### Connection + DM Sequence
- [ ] Send 25 connection requests/day to ICP
- [ ] Personalized note: "Saw [company] just [news]. Building something that might help — mind connecting?"
- [ ] After acceptance (wait 2 days): "Thanks for connecting. Quick question — do you have a product demo video on your site yet?"
- [ ] If yes: "Nice — mind if I see it? We're building an AI tool that generates these autonomously and I'd love feedback."
- [ ] If no: "That's exactly what we solve. trypitch.co — drop your URL and get a cinematic demo video in minutes. Happy to give you free credits to try it."

### Personal Outreach
- [ ] **Yashwardhan Chaudhuri** — [Add specific ask: intro, feedback, distribution]
- [ ] **Adnan** — [Add specific ask]
- [ ] **Team Connections** — [List names + specific asks]
- [ ] **Mukund's Connections** — [List names + specific asks]
- [ ] **Hadi** — [Add specific ask]

---

## Phase 3: Content Engine (Week 6-12)

### Content Pillars

**Pillar 1: Product Demo Best Practices** (Searchable — Decision Stage)
- "How to Create a Product Demo Video That Converts"
- "Product Demo Video Examples (2026)"
- "Loom vs Professional Demo Video: When to Use Each"
- "The Anatomy of a Great Product Demo"

**Pillar 2: AI Video Generation** (Searchable + Shareable — Awareness Stage)
- "AI Video Generation for Startups: Complete Guide"
- "Can AI Really Make a Product Demo Video? We Tested It"
- "The Future of Product Marketing Is Autonomous"
- "Synthesia vs HeyGen vs Pitch: Which AI Video Tool Is Right for You?"

**Pillar 3: Startup Marketing on a Budget** (Shareable — Awareness Stage)
- "How to Market Your Startup With $0 (We Tried Everything)"
- "The 5 Videos Every Startup Needs (And How to Make Them in a Day)"
- "Why Your Pitch Deck Needs a Video Appendix"
- "Demo Day Prep: The Complete Checklist"

### Blog Content Calendar (First 8 Posts)
| Week | Title | Type | Target Keyword |
|------|-------|------|----------------|
| 1 | How to Create a Product Demo Video (Without Recording Anything) | How-to | "product demo video" |
| 2 | We Turned 50 Startup URLs Into Demo Videos. Here's What We Learned | Data-driven | "startup demo video" |
| 3 | Loom vs Pitch: When to Record vs When to Automate | Comparison | "loom alternative" |
| 4 | The Complete Guide to Demo Day Videos | Guide | "demo day video" |
| 5 | AI Video Generation for SaaS: What Actually Works | Thought leadership | "ai video generation saas" |
| 6 | 10 Product Demo Video Examples That Convert | Listicle | "product demo examples" |
| 7 | How to Make a Fundraising Video for Investors | How-to | "fundraising video" |
| 8 | Why Every Startup Website Needs a Hero Video | Opinion | "startup website hero video" |

### Video Content (Repurpose Blog → Social)
- [ ] Create 3-5 short-form videos showing Pitch in action
- [ ] "Watch me create a demo video in 60 seconds" (TikTok, Reels, Shorts)
- [ ] "Before/After: Loom recording vs Pitch-generated video" (LinkedIn, Twitter)
- [ ] "How the AI navigates your website" (behind-the-scenes, YouTube)

---

## Phase 4: SEO & Organic Growth (Ongoing)

### Keyword Strategy

**Decision Stage (High Intent)**
- "product demo video generator"
- "ai product demo video"
- "automated demo video"
- "website to video"
- "loom alternative"
- "synthesia alternative"
- "heygen alternative"

**Consideration Stage**
- "best product demo video tools"
- "how to make a product demo video"
- "product demo video examples"
- "saas demo video best practices"

**Awareness Stage**
- "what is ai video generation"
- "how startups can create demo videos"
- "demo day video tips"

### Competitor Pages
- [ ] `/alternatives/loom` — "Loom Alternative: Create Demo Videos Without Recording"
- [ ] `/alternatives/synthesia` — "Synthesia Alternative: Show Your Product, Not an Avatar"
- [ ] `/alternatives/heygen` — "HeyGen Alternative: AI Demo Videos That Show Your Actual Product"
- [ ] `/vs/loom` — "Pitch vs Loom: Autonomous vs Manual Demo Videos"
- [ ] `/vs/synthesia` — "Pitch vs Synthesia: Product Demos vs Talking Heads"

### Technical SEO Checklist
- [ ] Site speed optimization (Core Web Vitals)
- [ ] Mobile responsiveness audit
- [ ] Internal linking structure (blog → product pages)
- [ ] XML sitemap + robots.txt
- [ ] Open Graph + Twitter Card meta tags
- [ ] Canonical URLs
- [ ] 404 page with CTA
- [ ] Blog schema markup

---

## Phase 5: Community & Partnerships (Week 8-16)

### Community Marketing
- [ ] **Muslim Professionals Group** — Host a workshop: "AI Tools for Startup Marketing"
- [ ] **Indie Hackers** — Share build-in-progress updates, engage with other makers
- [ ] **Reddit** — r/startups, r/SaaS, r/Entrepreneur, r/marketing
  - Share genuine advice, not promotional content
  - "How we automated our demo video production" (case study format)
- [ ] **Hacker News** — "Show HN: Pitch — Autonomous cinematic product demos"
- [ ] **Discord/Slack communities** — Startup-focused groups, AI tool communities

### Partnership Opportunities
- [ ] **Incubators/Accelerators** (EF, Antler, YC)
  - Offer free credits to all cohort members
  - Host "Demo Day Video Workshop"
  - Become a preferred vendor
- [ ] **Startup Tools** (Clerk, Supabase, Vercel, Stripe)
  - Co-marketing: "The Startup Video Stack"
  - Integration partnerships
  - Cross-promotion in newsletters
- [ ] **Marketing Agencies**
  - White-label/reseller program
  - Agency discount (20% off Pro tier)
  - Co-create case studies
- [ ] **Newsletter Sponsorships**
  - The Hustle, Morning Brew, SaaS-focused newsletters
  - Micro-newsletters (1k-10k subs, highly engaged)
  - Cost: $100-$500 per placement

### Affiliate Program
- [ ] Structure: 20% recurring commission for referred paid users
- [ ] Create affiliate landing page with resources
- [ ] Recruit: startup influencers, marketing bloggers, YouTube creators
- [ ] Provide: sample videos, swipe copy, tracking links

---

## Phase 6: Paid Acquisition (Week 12+)

### Google Ads
- [ ] **Search Campaigns** (High Intent)
  - Keywords: "product demo video", "demo video generator", "ai video maker"
  - Budget: $20-50/day to start
  - Landing page: Dedicated landing page with sample video
- [ ] **Competitor Keywords**
  - "loom alternative", "synthesia alternative", "heygen alternative"
  - Ad copy: "Show Your Product, Not a Talking Head"

### LinkedIn Ads
- [ ] **Targeting:** Founders, CMOs, Product Marketing at 1-200 employee companies
- [ ] **Format:** Video ad (show a Pitch-generated demo)
- [ ] **Budget:** $30-50/day
- [ ] **Creative:** "Your website can pitch itself. See how →"

### Instagram Ads
- [ ] **Targeting:** Startup founders, marketers, creators (25-45)
- [ ] **Format:** Reels (15-30 sec demo of Pitch in action)
- [ ] **Hook:** "Watch me turn this website into a demo video in 60 seconds"
- [ ] **Budget:** $15-30/day

### Retargeting
- [ ] Pixel all website visitors
- [ ] Retarget with: sample videos, testimonials, limited-time credit offers
- [ ] Budget: $10-20/day

---

## Phase 7: Product-Led Growth (Ongoing)

### Viral Loops
- [ ] **"Powered by Pitch" watermark** on all free tier videos (links to trypitch.co)
- [ ] **Shareable video page** — Each generated video gets a public URL with "Create your own" CTA
- [ ] **Referral program** — Give 5 credits, get 5 credits when someone signs up
- [ ] **"Made with Pitch" badge** — Embeddable badge for companies to show on their site

### Free Tool / Lead Magnet
- [ ] **"Demo Video Scorecard"** — Free tool that analyzes a company's website and scores their demo video readiness
  - Captures email, generates report, recommends Pitch
- [ ] **"Startup Video Checklist"** — Downloadable PDF: "The 5 Videos Every Startup Needs"
  - Gated content, nurtures to sign-up

### In-App Optimization
- [ ] First-run experience: Guide user to generate their first video in <5 minutes
- [ ] Onboarding emails: Day 1 (welcome), Day 3 (tips), Day 7 (case study), Day 14 (upgrade offer)
- [ ] Credit usage notifications: "You have 2 credits left — top up to keep creating"

---

## Metrics & KPIs

### Leading Indicators
| Metric | Target (30 days) | Target (90 days) |
|--------|-----------------|-----------------|
| Website visitors | 1,000 | 5,000 |
| Sign-ups | 100 | 500 |
| First video generated | 50 | 250 |
| Cold emails sent | 500 | 3,000 |
| LinkedIn connections | 200 | 1,000 |
| Content pieces published | 4 | 12 |

### Lagging Indicators
| Metric | Target (30 days) | Target (90 days) |
|--------|-----------------|-----------------|
| Paid conversions | 10 | 50 |
| MRR | $100 | $2,000 |
| Videos generated (total) | 75 | 500 |
| Referral sign-ups | 5 | 50 |
| Product Hunt upvotes | 200+ | — |

---

## Weekly Rhythm

| Day | Focus |
|-----|-------|
| Monday | Content creation (blog, social posts for the week) |
| Tuesday | Cold email (write, send, optimize sequences) |
| Wednesday | LinkedIn (post, engage, connect with 25 ICP) |
| Thursday | Partnerships & community (outreach, events, collaborations) |
| Friday | Analytics review, iteration, planning |

---

## Budget Allocation (Monthly)

| Category | Budget | Notes |
|----------|--------|-------|
| Email tools (Lemlist/Instantly, Apollo) | $100-200 | Sending + finding |
| Google Ads | $600-1,500 | $20-50/day |
| LinkedIn Ads | $900-1,500 | $30-50/day |
| Instagram Ads | $450-900 | $15-30/day |
| Newsletter sponsorships | $200-500 | 1-2 placements/month |
| Content (if outsourcing) | $500-1,500 | Blog posts, design |
| **Total** | **$2,750-6,100** | Scale based on ROI |

---

## Quick Wins (Do This Week)

1. **Fix email deliverability** — Set up dedicated domains, warm up inboxes
2. **Generate 3 sample videos** — Use well-known startup URLs as demos
3. **Post on LinkedIn** — "We built something that turns websites into cinematic demo videos" + video
4. **Submit to Betalist** — Quick win, early adopter audience
5. **Set up analytics** — GA4, conversion tracking, UTM parameters
6. **Create cold email sequence** — Start with recently funded startups
7. **Add social proof to landing page** — Even if it's just "Used by teams at [X]"

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Emails going to spam | Dedicated domains, warmup, monitor deliverability |
| Low Product Hunt traction | Pre-launch preparation, supporter network, quality assets |
| Cold email low response rate | A/B test sequences, improve personalization, refine ICP |
| Content doesn't rank | Focus on long-tail, build backlinks, optimize for AI search |
| Paid ads too expensive | Start small, optimize for conversions, kill underperformers quickly |
| Competitors copy features | Build moat through quality, brand, and customer relationships |
