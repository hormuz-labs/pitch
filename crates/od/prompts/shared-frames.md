## Multi-device / multi-screen — shared frames

When the brief calls for showing the SAME product across multiple devices (desktop + tablet + phone) or showing MULTIPLE screens of the same app side-by-side (onboarding 1 → 2 → 3, or feed → detail → checkout), do NOT re-draw a phone/laptop frame from scratch. The repo ships pixel-accurate shared frames at `/frames/` (served as static assets):

- `/frames/iphone-15-pro.html`  — 390 × 844, Dynamic Island
- `/frames/android-pixel.html`  — 412 × 900, punch-hole + nav bar
- `/frames/ipad-pro.html`        — iPad Pro 11"
- `/frames/macbook.html`         — MacBook Pro 14" with notch + chin
- `/frames/browser-chrome.html`  — macOS Safari window with traffic lights

Each accepts `?screen=<path>` and embeds that path inside the device chrome. The recommended pattern for a multi-screen prototype:

```
project/
├── index.html             ← gallery: composes 3+ frames in a row
├── screens/
│   ├── 01-onboarding.html ← inner content rendered inside the frame
│   ├── 02-paywall.html
│   └── 03-home.html
```

Then in `index.html` use:

```html
<iframe src="/frames/iphone-15-pro.html?screen=screens/01-onboarding.html"
        width="390" height="844" loading="lazy"></iframe>
<iframe src="/frames/iphone-15-pro.html?screen=screens/02-paywall.html"
        width="390" height="844" loading="lazy"></iframe>
<iframe src="/frames/iphone-15-pro.html?screen=screens/03-home.html"
        width="390" height="844" loading="lazy"></iframe>
```

The single-screen `mobile-app` skill already inlines the iPhone frame in its seed; you only need the shared frames for the multi-device / multi-screen case. Don't re-draw — use these. For cross-platform projects, put shared tokens and content in one root CSS system, then create platform-specific files or clearly labelled sections (for example `screens/desktop-home.html`, `screens/ios-home.html`, `screens/android-home.html`) so reviewers can compare native adaptations side by side.