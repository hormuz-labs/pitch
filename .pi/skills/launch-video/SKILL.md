---
name: launch-video
description: Make or edit a product launch film, promo, teaser, feature announcement, kinetic-type film or 3D product animation as a live shots.js preview. Selects the relevant treatment and production references on demand. MP4 export belongs to the user. For a recorded browser walkthrough, use demo-video instead.
---

# Launch films

Create `shots.js`; the studio plays the compiled `index.html` live. The user
exports the MP4. Build and check the preview without rendering a review video.

For post-processing an existing video file (an uploaded clip, generated footage,
or an already exported film), reference the shared
[video-editing](../video-editing/SKILL.md) skill with its path and the requested
change. Keep changes to the live `shots.js` composition in this authoring skill.

## Select one treatment

Read only the matching file. Use the brief, not the runtime, to choose.
Ask only if a consequential choice is missing; delegated direction is yours.
For an edit, keep the established treatment unless the user changes it.

| Requested kind | Read |
|---|---|
| Cinematic launch / brand film | `references/treatments/cinematic.md` |
| Product walkthrough using composed screens | `references/treatments/product.md` |
| Kinetic typography | `references/treatments/kinetic.md` |
| Teaser | `references/treatments/teaser.md` |
| Feature announcement | `references/treatments/feature.md` |
| 3D product animation | `references/treatments/3d.md` |

## Shared direction

Stay within the selected story. Use icon-library for recognizable tools; show
product actions and results with a short label where useful. Extract the site's
facts and identity, not its crowded layout. One focal subject should carry
the viewer through the shot and into the next. Give essential copy time to read.
Runtime is approximate unless explicitly exact or capped; simplify excess
content rather than cramming or padding. Report the actual length.

## Choose motion before locking the storyboard

The complete effects inventory is below. Explore candidates across families with
`pitch effects show <id>` and read their frame strips; load `--source` for the
implementations you choose. Let the studies inform the visual idea and scene
connections. Keep exploring while the direction is weak; no fixed search quota.
`browse`, `search` and `families` are optional aids, not prerequisites. Preserve
the chosen mechanism when adapting it rather than reducing every shot to an entrance.
Use each effects-lab ID only once per film. Track choices in the shot table and
choose another effect for later shots; changing the copy, colour or factory name
does not make a repeated effect new. Keep the truthful `lab` citation on each port.

## Load production details when needed

Paths are relative to this skill directory. Load only what the current task needs.

| Task now | Read |
|---|---|
| Source the product and author new shots | `references/authoring.md` |
| Adapt an effects-lab implementation | `references/effects.md` |
| Plan how scenes connect, including transitions and object handoffs | `references/continuity.md` |
| Resolve a pacing problem | `references/pacing.md` |
| Narrated film: script and record before authoring shots | `references/audio/narration.md` |
| Choose a bed, add SFX or mix | `references/audio.md` — selects the needed audio module |
| Check and finish the preview | `references/finish.md` |

For a narrated film: understand the product → write and record the spoken story
→ build and time visuals around the read → check and mix → finish.
For music-only: source and plan → build → check and mix → finish.
For an edit, load only what that change needs and reuse successful work.

<!-- effects-index:start -->
## Available effects

443 effects across 32 families. IDs below work directly with `pitch effects show <id>`.

### ads

- ads/homepod-mini-apple-event
- ads/imac-cascade-apple-event
- ads/magic-keyboard-specs-apple-event
- ads/sliding-blocks-apple-event

### backgrounds

- backgrounds/animated-stripes
- backgrounds/big-waves
- backgrounds/chevrons-moving-down
- backgrounds/chevrons-moving-up
- backgrounds/circle-cascade
- backgrounds/dancing-dots
- backgrounds/fluted-glass-background-ios
- backgrounds/gradient-background
- backgrounds/gradient-noisy-blur
- backgrounds/halftone-effect
- backgrounds/luma-dot-background
- backgrounds/moving-dots
- backgrounds/moving-lines
- backgrounds/rotating-crosses
- backgrounds/rotating-squares
- backgrounds/small-waves
- backgrounds/themes-animated-gallery
- backgrounds/vector-animation

### before-and-after

- before-and-after/before-after-side-by-side
- before-and-after/before-after-slider
- before-and-after/before-after-split
- before-and-after/before-after-swipe

### blend-modes

- blend-modes/blend-modes-circle-stack
- blend-modes/blend-modes-collage-shuffle
- blend-modes/blend-modes-color-blocks
- blend-modes/blend-modes-double-exposure
- blend-modes/blend-modes-gradient-orbs

### blur

- blur/blur-article-gallery-ios
- blur/blur-bubbles
- blur/blur-bubbles-carousel
- blur/blur-logo-switcher
- blur/blur-news-stack-ios
- blur/blur-swirl

### brand

- brand/apple-news-plus
- brand/bold-color-list
- brand/claude-ai-editorial
- brand/color-cards-cascade
- brand/color-cards-expand
- brand/color-cards-scale
- brand/color-cards-stack
- brand/color-pills-reveal
- brand/color-ring-bounce-reveal
- brand/the-edit-brand-promo
- brand/the-edit-collection-teaser
- brand/the-edit-duo
- brand/the-edit-fragrance-promo
- brand/the-edit-poppy
- brand/the-edit-split-reveal
- brand/the-edit-trio
- brand/the-track-poster
- brand/the-track-product-reveal
- brand/the-track-slideshow
- brand/the-track-tagline

### buttons

- buttons/3-toggle-switch-buttons
- buttons/black-app-store-badge
- buttons/black-social-handle
- buttons/button-hover-effect
- buttons/continue-button-interaction
- buttons/google-play-badge
- buttons/instagram-interactions
- buttons/instagram-like
- buttons/the-prompt-generate-button
- buttons/the-prompt-voice-search
- buttons/toggle-switch-button
- buttons/white-app-store-badge
- buttons/white-social-handle
- buttons/youtube-subscribe-button

### charts

- charts/animated-bar-chart
- charts/animated-donut-chart
- charts/animated-donut-chart-black
- charts/animated-line-chart-blue
- charts/animated-line-chart-purple
- charts/bar-chart-skyline
- charts/bar-chart-sleep-tracker
- charts/donut-chart-3-parts
- charts/grid-chart-split
- charts/horizontal-bar-chart-metrics
- charts/line-chart-user-acquisition
- charts/multiple-bar-chart
- charts/multiple-line-chart-green
- charts/stacked-bar-chart
- charts/stacked-chart-cascade
- charts/stacked-donut-chart

### counters

- counters/counter-blur
- counters/counter-bold-poster
- counters/counter-dotted-circle
- counters/counter-frosted-glass
- counters/counter-glitch
- counters/counter-halftone-poster
- counters/counter-pixel
- counters/counter-progress-ring

### devices

- devices/3-mobile-screens
- devices/animated-ipad-mockup
- devices/animated-iphone-mockup
- devices/animated-mobile-gallery
- devices/animated-mobile-screens
- devices/animated-photo-gallery
- devices/animated-web-gallery
- devices/animated-web-screens
- devices/cascading-mobile-screens
- devices/cascading-screens
- devices/gallery-scroll
- devices/instagram-story-ios
- devices/mobile-app-showcase
- devices/mobile-app-subscribe-field
- devices/mobile-gallery-grid
- devices/mobile-screens-grid
- devices/mobile-screens-reveal
- devices/mobile-screens-slider
- devices/mobile-showreel
- devices/new-message-notification-ios
- devices/orbit-cards
- devices/push-notification-android
- devices/push-notification-ios
- devices/rotating-mobile-screens-black-white
- devices/rotating-smartphones
- devices/sliding-smartphones
- devices/sliding-smartphones-stories
- devices/sliding-web-screens
- devices/text-message-ios
- devices/the-route-boarding-pass
- devices/the-route-ios-flight-tracker
- devices/web-gallery-grid
- devices/web-screens-grid
- devices/whatsapp-messages

### effects

- effects/3d-rotation
- effects/card-flip
- effects/color-keying-effect
- effects/dithering-effect
- effects/gooey-effect
- effects/grainy-color-clamp
- effects/highlight-effect
- effects/holographic-logo
- effects/image-stretch-transition
- effects/inward-echo-loop
- effects/pixel-dissolve-transition
- effects/pixelated-mask
- effects/pixelated-slideshow
- effects/ring-scale-animated-loop
- effects/ripple-effect
- effects/threshold-effect

### gradients

- gradients/gradients-bento
- gradients/gradients-diagonal-sweep
- gradients/gradients-geometric-morph
- gradients/gradients-haze
- gradients/gradients-kaleidoscope
- gradients/gradients-morphing-shapes
- gradients/gradients-petals
- gradients/gradients-vertical-sweep

### icons

- icons/5-stars-move-up
- icons/5-stars-pop
- icons/adobe-after-effects-logo
- icons/adobe-illustrator-logo
- icons/adobe-photoshop-logo
- icons/adobe-premiere-pro-logo
- icons/adobe-xd-logo
- icons/apple-logo
- icons/behance-logo
- icons/bouncy-icons
- icons/check-icon
- icons/close-icon
- icons/cursor
- icons/dislike-icon
- icons/dribbble-logo
- icons/facebook-logo
- icons/heart-icon
- icons/instagram-logo
- icons/like-badge
- icons/like-icon
- icons/live-memoji
- icons/new-badge
- icons/profile-live
- icons/profile-new-story
- icons/smile
- icons/spotify-logo
- icons/the-route-morphing-icons
- icons/tiktok-logo
- icons/twitch-logo
- icons/twitter-logo
- icons/wristwatch
- icons/youtube-logo

### launch

- launch/color-interpolate-glow
- launch/fade-property-reveal
- launch/kinetic-spring-counter
- launch/kinetic-text-stagger
- launch/p5-generative-wave
- launch/perceptual-scale-zoom
- launch/scene-slide-wipe
- launch/spring-feature-pop
- launch/three-device-showcase
- launch/transform-choreography

### launch-primitives

- launch-primitives/code-scan-constellation
- launch-primitives/conversation-card-parallax
- launch-primitives/cursor-dashboard-flythrough
- launch-primitives/focus-target-camera
- launch-primitives/notification-type-payoff
- launch-primitives/phone-gallery-pullback
- launch-primitives/phone-stat-depth
- launch-primitives/product-canvas-pullback
- launch-primitives/reasoning-path-camera
- launch-primitives/result-card-focus-expansion
- launch-primitives/semantic-word-camera
- launch-primitives/spatial-sphere-workflow
- launch-primitives/triptych-prompt-montage
- launch-primitives/voice-pill-magnification

### launch-studies

- launch-studies/ava-cart-recovery
- launch-studies/coderabbit-security-scan
- launch-studies/codex-voice-builder
- launch-studies/elevenlabs-spatial-music
- launch-studies/gemini-assistant-journey
- launch-studies/kinetic-slides-to-prompt
- launch-studies/mobbin-ui-camera
- launch-studies/replit-canvas-camera

### logos

- logos/before-after-logo
- logos/logo-sliding-name
- logos/logo-tap-color-reveal
- logos/nike-curv-logo
- logos/openai-logo
- logos/round-logo
- logos/round-logo-ripple
- logos/round-logo-sliding-name
- logos/simple-dot-logo
- logos/square-logo
- logos/square-logo-scale

### morph

- morph/morph-animated-face
- morph/morph-animated-icon
- morph/morph-line-to-radar-chart
- morph/morph-running-character
- morph/morph-video-mask
- morph/morph-weather-icons

### showreels

- showreels/animated-cards
- showreels/bento-1-1
- showreels/bento-16-9
- showreels/bento-4-5
- showreels/bento-grid
- showreels/bento-modular-showreel
- showreels/cascading-squares-grid
- showreels/interactive-gallery
- showreels/linear-cards
- showreels/photo-gallery
- showreels/project-showcase
- showreels/rewind
- showreels/rotating-cards
- showreels/share-your-work
- showreels/slideshow-loop
- showreels/sliding-squares
- showreels/stacked-cards

### social-media

- social-media/animated-tweet
- social-media/blast-social-media-showcase
- social-media/design-preview
- social-media/drop-it-like-it-s-hot-mask
- social-media/drop-it-like-it-s-hot-sizzle-reel
- social-media/folio-social-media-showcase
- social-media/frames-mobile-showreel
- social-media/image-carousel-parallax
- social-media/instagram-stories-collage
- social-media/instagram-story-2-images
- social-media/instagram-story-2-images-with-captions
- social-media/instagram-story-2-square-images
- social-media/instagram-story-2-vertical-images
- social-media/instagram-story-3-horizontal-images
- social-media/instagram-story-3-square-images
- social-media/instagram-story-3d-hand
- social-media/instagram-story-4-images
- social-media/instagram-story-5-images
- social-media/instagram-story-blog-post
- social-media/instagram-story-browse-more
- social-media/instagram-story-fashion
- social-media/instagram-story-pastel
- social-media/mirror-social-media-showcase
- social-media/orbit-social-media-showreel
- social-media/product-of-the-week-product-hunt
- social-media/project-reveal
- social-media/project-teaser
- social-media/revolve-social-media-showcase
- social-media/slideshow-social-media-showreel
- social-media/spiral-social-media-showcase

### text

- text/animated-feature-list
- text/animated-repeater
- text/animated-text-messages
- text/appear
- text/blend-modes-color-and-text
- text/blend-modes-mode-showcase
- text/blend-modes-overlay-poster
- text/blend-modes-type-blend
- text/blur-text-scroller
- text/blurry-text-spin
- text/bold-text-snap
- text/bouncy-period
- text/cascading-text
- text/countdown-bold
- text/counter-1-000-figma-plugin-installs
- text/crt-effect
- text/design-negative-mask-effect
- text/elastic-text
- text/feature-list-apple-event
- text/glide
- text/glitch-01-text-reveal
- text/glitch-02-text-reveal
- text/glitchy-text-reveal
- text/gradients-animated-list
- text/gradients-logo-reveal
- text/morph-dots-to-text
- text/morph-inflating-text
- text/morph-lines-to-text
- text/morph-shape-to-text
- text/motion-blur
- text/motion-design-looped-text
- text/multiply
- text/save-the-date
- text/sliding-text-reveal
- text/sliding-title-reveal-apple-event
- text/snappy-text-stretch
- text/squeeze
- text/stretch
- text/stretched-type-repeater
- text/text-extrusion
- text/text-mirror-effect
- text/text-scramble
- text/the-crust-animated-menu
- text/the-crust-lunch-time
- text/the-crust-slideshow
- text/the-crust-tagline
- text/the-crust-tagline-and-menu
- text/the-edit-instagram-story
- text/the-edit-product-launch
- text/the-edit-tagline-dark
- text/the-edit-tagline-white
- text/the-harvest-banana-spin
- text/the-harvest-fruit-bounce
- text/the-harvest-orange-float
- text/the-harvest-peach-plunge
- text/the-harvest-pulp
- text/the-harvest-raspberry-check
- text/the-harvest-raspberry-glide
- text/the-prompt-text-to-image
- text/the-route-cities
- text/the-route-departures-board
- text/the-route-logo-reveal
- text/the-vault-card-features
- text/the-vault-feature-list
- text/tilted-text-snap
- text/type-trail
- text/video-title-slide
- text/wow-rotate-and-scale
- text/zero-gravity-bouncy-words

### the-click

- the-click/animated-emoji-button
- the-click/animated-slider
- the-click/back-next-buttons
- the-click/floating-action-menu
- the-click/glass-button
- the-click/glow-button
- the-click/interactive-button-glow
- the-click/interactive-button-trace
- the-click/liquid-glass-menu-horizontal
- the-click/liquid-glass-menu-vertical
- the-click/liquid-glass-toggle
- the-click/navigation-bar
- the-click/on-off-toggle
- the-click/purple-toggle
- the-click/search-bar-reveal
- the-click/side-rail-menu
- the-click/view-cart-button
- the-click/view-cart-button-split

### the-edit

- the-edit/the-edit-nested-images

### the-prompt

- the-prompt/the-prompt-generative-ai-features

### the-route

- the-route/the-route-destinations-carousel
- the-route/the-route-destinations-map
- the-route/the-route-new-destination

### the-stack

- the-stack/the-stack-livestream
- the-stack/the-stack-partnership
- the-stack/the-stack-release-notes
- the-stack/the-stack-sale
- the-stack/the-stack-testimonial
- the-stack/the-stack-we-re-hiring

### the-track

- the-track/the-track-animated-metrics
- the-track/the-track-animated-quote
- the-track/the-track-countdown
- the-track/the-track-mobile-app-showcase
- the-track/the-track-personal-record
- the-track/the-track-promo-reel
- the-track/the-track-session-complete

### the-vault

- the-vault/the-vault-animated-cards
- the-vault/the-vault-card-reveal

### ui-elements

- ui-elements/animated-app-list
- ui-elements/animated-arrow
- ui-elements/animated-color-pallette
- ui-elements/animated-progress-bar
- ui-elements/animated-search-bar
- ui-elements/animated-ui-kit
- ui-elements/banking-app-cards
- ui-elements/charging-apple-watch
- ui-elements/circular-loader
- ui-elements/crazy-ellipse
- ui-elements/interactive-badges
- ui-elements/interactive-components
- ui-elements/loading-animation-bars
- ui-elements/loading-spinner-infinite-loop
- ui-elements/loading-spinner-success-animation
- ui-elements/pacman
- ui-elements/pink-loading-spinner
- ui-elements/progress-donut
- ui-elements/progress-pie
- ui-elements/push-notifications-list-ios
- ui-elements/revenue-app-dribbble
- ui-elements/simple-notification-ios
- ui-elements/social-media-icons
- ui-elements/splitting-cube-perfect-loop
- ui-elements/the-prompt-ai-chat
- ui-elements/the-prompt-image-generation
- ui-elements/the-vault-app-icons
- ui-elements/the-vault-contactless-payment
- ui-elements/the-vault-digital-wallet
- ui-elements/the-vault-payment-notification
- ui-elements/the-vault-payment-notifications
- ui-elements/yosemite-animated-widget

### uncategorised

- uncategorised/config-photo-gallery-01
- uncategorised/config-photo-gallery-02
- uncategorised/config-photo-gallery-03
- uncategorised/feature-sneak-peek
- uncategorised/holo
- uncategorised/instruction-card
- uncategorised/nft-cards-3d
- uncategorised/ready-for-config
- uncategorised/thank-you-config
- uncategorised/zero-gravity-floating-cards

### video-titles

- video-titles/collage-art-promo
- video-titles/gradient-background-loop
- video-titles/gradients-perspective-tunnel
- video-titles/kaleidoscope-intro-slide

### websites

- websites/animated-square-images
- websites/blog-post
- websites/gradient-website-dribbble
- websites/happy-faces-landing-page
- websites/image-mask-parallax-effect
- websites/landing-page-blocks
- websites/minimalist-website
- websites/mountains-animated-website-dribbble
- websites/website-promo
<!-- effects-index:end -->
