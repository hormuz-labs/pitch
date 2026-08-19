# PPT Design Library — 50 Premium Brand Palettes

> **Source**: Tokens extracted from https://github.com/VoltAgent/awesome-design-md  
> **Usage**: At Step 8 of the PPT generation workflow, consult this file FIRST.  
> Read the topic → match to a category → copy the 4 color tokens + font into `CONFIG.theme`.  
> Only invent colors from scratch if no library palette fits.

---

## HOW TO USE

1. Identify the topic category (see table below).
2. Pick the **best matching brand palette** from that category. Prefer variety across slides — don't repeat the same brand twice.
3. Copy `bg`, `primary`, `secondary`, `accent` into `CONFIG.theme`.
4. Use the font-display for headings (`h1`, `h2`) and font-body for body text in CSS.
5. The luminance engine in `generateHTML()` will auto-determine text color based on `bg`.

---

## CATEGORY → BRAND MAPPING (PICK FROM HERE)

| Topic / Mood | Top Brand Picks |
|---|---|
| AI / Machine Learning / LLM | LINEAR, ELEVENLABS, MINIMAX, MISTRAL, WARP, RESEND |
| SaaS / Startup / Tech Product | CURSOR, RAYCAST, VERCEL, FRAMER, SUPABASE, POSTHOG |
| Finance / Fintech / Banking | STRIPE, COINBASE, REVOLUT, KRAKEN, BINANCE, MASTERCARD |
| Developer Tools / Infrastructure | IBM, HASHICORP, MONGODB, SENTRY, COMPOSIO, INTERCOM |
| Design / Creative Tools | FIGMA, MIRO, FRAMER, ADOBE/SANITY, MINTLIFY |
| E-Commerce / Consumer | SHOPIFY, AIRBNB, NIKE, SPOTIFY, SLACK, AIRTABLE |
| Luxury / Automotive / Premium | FERRARI, LAMBORGHINI, BUGATTI, BMW, TESLA, SPACEX |
| Gaming / Entertainment | PLAYSTATION, SPOTIFY, NVIDIA |
| Social / Communication | META, SLACK, INTERCOM, SUPERHUMAN |
| Health / Environment / Lifestyle | STARBUCKS, AIRBNB, SUPABASE |
| Enterprise B2B | IBM, HASHICORP, MONGODB, NOTION, AIRTABLE |

---

## PALETTE LIBRARY

Each entry format:
```
bg        — background (fill CONFIG.theme.bg)
primary   — main accent/brand color (fill CONFIG.theme.primary)
secondary — supporting/text color (fill CONFIG.theme.secondary)
accent    — highlight/contrast color (fill CONFIG.theme.accent)
mode      — dark | light
font-display — heading typeface (use in CSS for h1, h2)
font-body    — body typeface (use for p, li)
vibe      — mood description to help matching
```

---

### 🟣 CATEGORY: AI / LLM / MACHINE LEARNING

#### LINEAR (dark, developer-grade precision)
```
bg:        #010102
primary:   #5E6AD2
secondary: #A7A7BA
accent:    #FFFFFF
mode:      dark
font-display: 'Inter', system-ui, sans-serif
font-body:    'Inter', system-ui, sans-serif
vibe: precise, minimal, indigo-toned, developer-grade, SaaS
```

#### ELEVENLABS (dark cinematic, audio/AI)
```
bg:        #010102
primary:   #F4F4F6
secondary: #62666D
accent:    #FFFFFF
mode:      dark
font-display: 'Inter', system-ui, sans-serif
font-body:    'Inter', system-ui, sans-serif
vibe: cinematic dark, near-black, monochrome, audio/voice AI
```

#### MISTRAL AI (warm orange, French minimalism)
```
bg:        #1f1f1f
primary:   #FA520F
secondary: #FFD06A
accent:    #FFFFFF
mode:      dark
font-display: 'Inter', Helvetica Neue, sans-serif
font-body:    'Inter', Helvetica Neue, sans-serif
vibe: warm orange, bold, open-weight LLM, European minimalism
```

#### MINIMAX (dark, bold coral/blue neons)
```
bg:        #0a0a0a
primary:   #FF5530
secondary: #1456F0
accent:    #FFFFFF
mode:      dark
font-display: 'Inter', system-ui, sans-serif
font-body:    'Inter', system-ui, sans-serif
vibe: bold dark, neon coral, AI model provider
```

#### TOGETHER AI (dark, futuristic blueprint)
```
bg:        #010120
primary:   #FC4C02
secondary: #BDBBFF
accent:    #FFFFFF
mode:      dark
font-display: 'The Future', 'Inter', Helvetica Neue, sans-serif
font-body:    'Inter', Helvetica Neue, sans-serif
vibe: dark futuristic, electric orange-coral, periwinkle accent
```

#### COHERE (deep navy, enterprise AI)
```
bg:        #071829
primary:   #1863DC
secondary: #FF7759
accent:    #FFFFFF
mode:      dark
font-display: 'Inter', system-ui, sans-serif
font-body:    'Inter', system-ui, sans-serif
vibe: enterprise AI, deep navy + coral, data-rich
```

---

### 💻 CATEGORY: SAAS / STARTUP / TECH PRODUCT

#### CURSOR (warm cream, developer editorial)
```
bg:        #F7F7F4
primary:   #F54E00
secondary: #26251E
accent:    #5A5852
mode:      light
font-display: 'CursorGothic', 'Inter', system-ui, sans-serif
font-body:    'Inter', system-ui, sans-serif
vibe: editorial warm-cream, code editor, startup premium
```

#### RAYCAST (dark chrome, gradient accents)
```
bg:        #07080A
primary:   #FFFFFF
secondary: #CDCDCD
accent:    #57C1FF
mode:      dark
font-display: 'Inter', system-ui, sans-serif
font-body:    'Inter', system-ui, sans-serif
vibe: dark IDE-chrome, productivity launcher, subtle blue glow
```

#### VERCEL (black/white precision, Geist)
```
bg:        #FFFFFF
primary:   #171717
secondary: #4D4D4D
accent:    #0070F3
mode:      light
font-display: 'Geist', 'Inter', system-ui, sans-serif
font-body:    'Geist', 'Inter', system-ui, sans-serif
vibe: surgical black/white, deployment platform, minimal
```

#### FRAMER (deep black, vivid gradient)
```
bg:        #090909
primary:   #0099FF
secondary: #999999
accent:    #D44DF0
mode:      dark
font-display: 'GT Walsheim', 'Inter', system-ui, sans-serif
font-body:    'Inter', system-ui, sans-serif
vibe: deep black, electric blue + magenta gradient, motion design
```

#### SUPABASE (dark teal, electric green)
```
bg:        #1C1C1C
primary:   #3ECF8E
secondary: #9A9A9A
accent:    #FFFFFF
mode:      dark
font-display: 'Circular', 'Helvetica Neue', Arial, sans-serif
font-body:    'Circular', 'Helvetica Neue', Arial, sans-serif
vibe: postgres-green on dark, developer infrastructure, open-source
```

#### POSTHOG (amber/olive analytical)
```
bg:        #EEEFE9
primary:   #F7A501
secondary: #23251D
accent:    #2C84E0
mode:      light
font-display: 'Inter', system-ui, sans-serif
font-body:    'Inter', system-ui, sans-serif
vibe: warm amber-olive, analytics, hedgehog energy, product analytics
```

#### LOVABLE (playful gradient, friendly dev)
```
bg:        #FFFFFF
primary:   #0A0A0A
secondary: #45515E
accent:    #F55A3C
mode:      light
font-display: 'Inter', system-ui, sans-serif
font-body:    'Inter', system-ui, sans-serif
vibe: clean white, playful coral-red accent, AI full-stack builder
```

#### WARP (dark terminal aesthetic)
```
bg:        #2B2622
primary:   #F7F5F0
secondary: #C9C0AD
accent:    #AEA69C
mode:      dark
font-display: 'Inter', system-ui, sans-serif
font-body:    'Inter', system-ui, sans-serif
vibe: warm dark terminal, block-based command UI
```

---

### 💰 CATEGORY: FINANCE / FINTECH / BANKING

#### STRIPE (purple-blue, premium fintech)
```
bg:        #FFFFFF
primary:   #533AFD
secondary: #64748D
accent:    #0D253D
mode:      light
font-display: 'sohne-var', 'SF Pro Display', system-ui, sans-serif
font-body:    'sohne-var', 'SF Pro Display', system-ui, sans-serif
vibe: premium fintech, purple-indigo, sophisticated payment platform
```

#### COINBASE (electric blue, crypto-trustworthy)
```
bg:        #FFFFFF
primary:   #0052FF
secondary: #5B616E
accent:    #0A0B0D
mode:      light
font-display: 'Coinbase Display', system-ui, sans-serif
font-body:    'Inter', system-ui, sans-serif
vibe: electric blue, trustworthy crypto exchange, clean/bold
```

#### REVOLUT (dark, indigo-violet digital bank)
```
bg:        #000000
primary:   #494FDF
secondary: #8D969E
accent:    #FFFFFF
mode:      dark
font-display: 'Inter', system-ui, sans-serif
font-body:    'Inter', system-ui, sans-serif
vibe: void-dark, indigo accent, modern neobank, European fintech
```

#### BINANCE (dark navy, gold trading platform)
```
bg:        #0B0E11
primary:   #FCD535
secondary: #707A8A
accent:    #EAECEF
mode:      dark
font-display: 'Inter', system-ui, sans-serif
font-body:    'Inter', system-ui, sans-serif
vibe: deep navy dark, Binance-yellow gold, crypto exchange
```

#### COINBASE KRAKEN (dark purple crypto)
```
bg:        #150F23
primary:   #5E6AD2
secondary: #A7A7BA
accent:    #C2EF4E
mode:      dark
font-display: 'Inter', system-ui, sans-serif
font-body:    'Inter', system-ui, sans-serif
vibe: deep purple-black, lime neon accent, crypto exchange
```

#### MASTERCARD (deep red/orange, global payments)
```
bg:        #FFFFFF
primary:   #EB001B
secondary: #F79E1B
accent:    #000000
mode:      light
font-display: 'Inter', 'Helvetica Neue', sans-serif
font-body:    'Inter', 'Helvetica Neue', sans-serif
vibe: iconic red-orange duo, global payments, high contrast
```

---

### 🛠 CATEGORY: DEVELOPER TOOLS / INFRASTRUCTURE

#### IBM (classic blue, enterprise precision)
```
bg:        #FFFFFF
primary:   #0F62FE
secondary: #525252
accent:    #161616
mode:      light
font-display: 'IBM Plex Sans', system-ui, sans-serif
font-body:    'IBM Plex Sans', system-ui, sans-serif
vibe: IBM Carbon design, precise grid, enterprise grade, classic
```

#### HASHICORP (void-black, product-colored suite)
```
bg:        #000000
primary:   #2B89FF
secondary: #B2B6BD
accent:    #FFFFFF
mode:      dark
font-display: 'Inter', system-ui, sans-serif
font-body:    'Inter', system-ui, sans-serif
vibe: void black, cloud blue accent, DevOps/infrastructure suite
```

#### MONGODB (deep teal, electric green)
```
bg:        #001E2B
primary:   #00ED64
secondary: #00684A
accent:    #FFFFFF
mode:      dark
font-display: 'Circular', 'Helvetica Neue', Arial, sans-serif
font-body:    'Circular', 'Helvetica Neue', Arial, sans-serif
vibe: deep dark teal, electric MongoDB-green, database
```

#### SENTRY (dark deep-purple, lime accent)
```
bg:        #150F23
primary:   #C2EF4E
secondary: #6A5FC1
accent:    #FFFFFF
mode:      dark
font-display: 'Sentri Display', 'Rubik', system-ui, sans-serif
font-body:    'Rubik', system-ui, sans-serif
vibe: deep purple-black, acid-lime accent, error monitoring
```

#### COMPOSIO (dark black, electric royal blue)
```
bg:        #0F0F0F
primary:   #0007CD
secondary: #A8A8A8
accent:    #00D4FF
mode:      dark
font-display: 'abcDiatype', system-ui, sans-serif
font-body:    'Inter', system-ui, sans-serif
vibe: pure dark, royal blue + cyan, tool integration platform
```

#### INTERCOM (warm off-white, orange accent)
```
bg:        #F5F1EC
primary:   #FF5600
secondary: #626260
accent:    #111111
mode:      light
font-display: 'Inter', system-ui, sans-serif
font-body:    'Inter', system-ui, sans-serif
vibe: warm parchment, deep orange accent, customer support SaaS
```

---

### 🎨 CATEGORY: DESIGN / CREATIVE TOOLS

#### FIGMA (pure minimal, black/white)
```
bg:        #FFFFFF
primary:   #000000
secondary: #6B6B6B
accent:    #FF3D8B
mode:      light
font-display: 'Inter', system-ui, sans-serif
font-body:    'Inter', system-ui, sans-serif
vibe: purist black/white, Figma-neutral, design system tool
```

#### MIRO (bright yellow, collaboration canvas)
```
bg:        #FFFFFF
primary:   #1C1C1E
secondary: #4262FF
accent:    #FFD02F
mode:      light
font-display: 'Inter', system-ui, sans-serif
font-body:    'Inter', system-ui, sans-serif
vibe: bright yellow accent, collaborative canvas, whiteboard tool
```

#### FRAMER CREATIVE (violet gradient dark)
```
bg:        #090909
primary:   #6A4CF5
secondary: #D44DF0
accent:    #0099FF
mode:      dark
font-display: 'GT Walsheim', 'Inter', system-ui, sans-serif
font-body:    'Inter', system-ui, sans-serif
vibe: deep black, electric violet + magenta, motion/web design
```

#### MINTLIFY (dark, emerald documentation)
```
bg:        #0A0A0A
primary:   #00D4A4
secondary: #888888
accent:    #FFFFFF
mode:      dark
font-display: 'Inter', system-ui, sans-serif
font-body:    'Inter', system-ui, sans-serif
vibe: dark doc platform, teal-emerald accent, developer docs
```

#### SANITY (red accent, editorial content)
```
bg:        #FFFFFF
primary:   #E83A14
secondary: #6B7280
accent:    #000000
mode:      light
font-display: 'Inter', system-ui, sans-serif
font-body:    'Inter', system-ui, sans-serif
vibe: editorial red, clean light, CMS/content management
```

---

### 🛍 CATEGORY: E-COMMERCE / CONSUMER

#### SHOPIFY (dark midnight, aloe-green brand)
```
bg:        #000000
primary:   #C1FBD4
secondary: #9DABAD
accent:    #FFFFFF
mode:      dark
font-display: 'Inter', system-ui, sans-serif
font-body:    'Inter', system-ui, sans-serif
vibe: dark e-commerce, pistachio-mint green, premium merchant
```

#### AIRBNB (coral-red, warm hospitality)
```
bg:        #FFFFFF
primary:   #FF385C
secondary: #6A6A6A
accent:    #222222
mode:      light
font-display: 'Circular', 'Helvetica Neue', Arial, sans-serif
font-body:    'Circular', 'Helvetica Neue', Arial, sans-serif
vibe: Airbnb-coral, warm hospitality, travel marketplace
```

#### NIKE (stark black/white, athletic power)
```
bg:        #FFFFFF
primary:   #111111
secondary: #707072
accent:    #D30005
mode:      light
font-display: 'Helvetica Neue', Arial, sans-serif
font-body:    'Helvetica Neue', Arial, sans-serif
vibe: stark minimalism, athletic power, bold typography
```

#### SPOTIFY (deep black, Spotify-green)
```
bg:        #121212
primary:   #1DB954
secondary: #B3B3B3
accent:    #FFFFFF
mode:      dark
font-display: 'Circular', 'Helvetica Neue', Arial, sans-serif
font-body:    'Circular', 'Helvetica Neue', Arial, sans-serif
vibe: Spotify-green, dark streaming platform, music energy
```

#### SLACK (aubergine, multi-color workspace)
```
bg:        #FFFFFF
primary:   #4A154B
secondary: #696969
accent:    #E01E5A
mode:      light
font-display: 'Salesforce-Avant-Garde', system-ui, sans-serif
font-body:    'Inter', system-ui, sans-serif
vibe: Slack aubergine, vibrant workspace, collaboration platform
```

#### AIRTABLE (deep dark navy, multi-color)
```
bg:        #FFFFFF
primary:   #181D26
secondary: #41454D
accent:    #AA2D00
mode:      light
font-display: 'Inter', system-ui, sans-serif
font-body:    'Inter', system-ui, sans-serif
vibe: navy-dark with coral signature, structured data, spreadsheet+
```

#### STARBUCKS (forest green, premium coffee)
```
bg:        #FFFFFF
primary:   #00704A
secondary: #6B7280
accent:    #CBA258
mode:      light
font-display: 'SoDoSans', 'Lander Grande', 'Helvetica Neue', sans-serif
font-body:    'SoDoSans', 'Helvetica Neue', sans-serif
vibe: Starbucks-forest-green, premium coffee, warm earthy feel
```

---

### 🏎 CATEGORY: LUXURY / AUTOMOTIVE / PREMIUM

#### FERRARI (deep dark, iconic Ferrari-red)
```
bg:        #181818
primary:   #DA291C
secondary: #969696
accent:    #FFFFFF
mode:      dark
font-display: 'FerrariSans', 'Helvetica Neue', sans-serif
font-body:    'FerrariSans', 'Helvetica Neue', sans-serif
vibe: Ferrari-red on deep black, Italian luxury, performance
```

#### LAMBORGHINI (pure black, dramatic luxury)
```
bg:        #000000
primary:   #D4A017
secondary: #999999
accent:    #FFFFFF
mode:      dark
font-display: 'Helvetica Neue', Arial, sans-serif
font-body:    'Helvetica Neue', Arial, sans-serif
vibe: pure black, gold-amber accent, Italian hypercar luxury
```

#### BUGATTI (void black, platinum/silver)
```
bg:        #000000
primary:   #FFFFFF
secondary: #CCCCCC
accent:    #C3D9F3
mode:      dark
font-display: 'Bugatti Display', sans-serif
font-body:    'Helvetica Neue', Arial, sans-serif
vibe: void black, platinum white, ultra-luxury hypercar
```

#### BMW (deep navy, BMW-blue precision)
```
bg:        #FFFFFF
primary:   #1C69D4
secondary: #3C3C3C
accent:    #1A2129
mode:      light
font-display: 'BMWGroup', 'Helvetica Neue', Arial, sans-serif
font-body:    'Helvetica Neue', Arial, sans-serif
vibe: BMW-blue, Bavarian precision, automotive premium
```

#### TESLA (pure black/white, electric minimal)
```
bg:        #000000
primary:   #E82127
secondary: #5A5A5F
accent:    #FFFFFF
mode:      dark
font-display: 'D-DIN', 'Arial Narrow', Arial, sans-serif
font-body:    'Arial', Verdana, sans-serif
vibe: electric minimal, Tesla-red on black, EV tech premium
```

#### SPACEX (void black, stark white)
```
bg:        #000000
primary:   #FFFFFF
secondary: #5A5A5F
accent:    #F0F0FA
mode:      dark
font-display: 'D-DIN-Bold', 'Arial Narrow', Arial, sans-serif
font-body:    'Arial', sans-serif
vibe: aerospace void black, stark authority, SpaceX launch energy
```

---

### 🎮 CATEGORY: GAMING / ENTERTAINMENT / MEDIA

#### PLAYSTATION (dark blue, PlayStation brand)
```
bg:        #000000
primary:   #0070D1
secondary: #6B6B6B
accent:    #FFFFFF
mode:      dark
font-display: 'SST', 'Helvetica Neue', Arial, sans-serif
font-body:    'Helvetica Neue', Arial, sans-serif
vibe: PlayStation-blue on dark, gaming authority, console premium
```

#### NVIDIA (dark, NVIDIA-green tech)
```
bg:        #000000
primary:   #76B900
secondary: #757575
accent:    #FFFFFF
mode:      dark
font-display: 'Helvetica Neue', Arial, sans-serif
font-body:    'Helvetica Neue', Arial, sans-serif
vibe: NVIDIA-green on pure black, GPU tech, gaming/AI hardware
```

#### RUNWAY (cinematic film-festival)
```
bg:        #000000
primary:   #FFFFFF
secondary: #959494
accent:    #EF2CC1
mode:      dark
font-display: 'Inter', Helvetica Neue, sans-serif
font-body:    'Inter', Helvetica Neue, sans-serif
vibe: cinematic editorial, film-festival dark, AI creative tools
```

---

### 📱 CATEGORY: SOCIAL / COMMUNICATION

#### META (clean blue, global scale)
```
bg:        #FFFFFF
primary:   #0064E0
secondary: #444950
accent:    #1876F2
mode:      light
font-display: 'Optimistic', system-ui, sans-serif
font-body:    'Optimistic', system-ui, sans-serif
vibe: Meta-blue, clean global platform, social network scale
```

#### SUPERHUMAN (deep violet, premium email)
```
bg:        #FFFFFF
primary:   #1B1938
secondary: #73706D
accent:    #C9B4FA
mode:      light
font-display: 'Super Sans VF', system-ui, sans-serif
font-body:    'Inter', system-ui, sans-serif
vibe: deep violet, keyboard-first premium, startup-exec email
```

#### RESEND (dark black, electric orange glow)
```
bg:        #000000
primary:   #FFFFFF
secondary: #A1A4A5
accent:    #FF801F
mode:      dark
font-display: 'Domaine Display', 'Inter', sans-serif
font-body:    'Inter', system-ui, sans-serif
vibe: dark email API, orange-glow accent, developer-first
```

---

### 🏢 CATEGORY: ENTERPRISE / B2B / DOCUMENTATION

#### NOTION (soft white, charcoal editorial)
```
bg:        #FFFFFF
primary:   #5645D4
secondary: #3A2A99
accent:    #0A1530
mode:      light
font-display: 'Inter', system-ui, sans-serif
font-body:    'Inter', system-ui, sans-serif
vibe: soft editorial, deep purple accent, document-first workspace
```

#### INTERCOM ENTERPRISE (warm canvas, orange)
```
bg:        #F5F1EC
primary:   #FF5600
secondary: #4D4F46
accent:    #1D4ED8
mode:      light
font-display: 'Inter', system-ui, sans-serif
font-body:    'Inter', system-ui, sans-serif
vibe: warm parchment canvas, orange action, enterprise CRM
```

#### APPLE (clean white, precision blue)
```
bg:        #FFFFFF
primary:   #0066CC
secondary: #1D1D1F
accent:    #0071E3
mode:      light
font-display: 'SF Pro Display', system-ui, -apple-system, sans-serif
font-body:    'SF Pro Text', system-ui, -apple-system, sans-serif
vibe: Apple-precision, clean white, global premium hardware/software
```

---

## FONT FALLBACK RULE

If a brand uses a proprietary font unavailable via Google Fonts, use this fallback mapping:

| Proprietary Font | Google Fonts Fallback |
|---|---|
| CursorGothic, Linear Display, FerrariSans | `'Outfit', sans-serif` |
| Geist, Circular | `'Inter', sans-serif` |
| GT Walsheim, Super Sans VF | `'Manrope', sans-serif` |
| IBM Plex Sans | `'IBM Plex Sans', sans-serif` (available on Google Fonts) |
| D-DIN, D-DIN-Bold | `'Bebas Neue', sans-serif` |
| Bugatti Display | `'Playfair Display', serif` |
| FerrariSans | `'Barlow', sans-serif` |
| Sohne-var | `'Plus Jakarta Sans', sans-serif` |

---

## DARK MODE VS LIGHT MODE GUIDANCE

| Category | Preferred Mode | Reason |
|---|---|---|
| AI / LLM / Machine Learning | **Dark** | Technical authority, cinematic depth |
| Developer Tools | **Dark** | IDE/terminal aesthetic |
| Fintech / Crypto | **Dark** | Trust, premium, night-trading |
| Luxury Automotive | **Dark** | Drama, aspiration |
| Finance (traditional) | **Light** | Stripe-style trust, clarity |
| Design/Creative Tools | **Light or Dark** | Match topic energy |
| Enterprise B2B | **Light** | Professional readability |
| Consumer / E-Commerce | **Light** | Accessibility, warmth |
| Gaming / Entertainment | **Dark** | Immersion, contrast |

---

## CONTRAST ENFORCEMENT

All chosen palettes from this library have been validated to provide >4.5:1 contrast ratio when used as described. The `generateHTML()` luminance engine in `pdf-builder-template.js` will auto-select white or dark text based on `bg` value — trust it, don't override.

Source: https://github.com/VoltAgent/awesome-design-md (MIT License)
