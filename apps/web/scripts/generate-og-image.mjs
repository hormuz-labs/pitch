// Generates public/og-image.png (1200x630 social card) using Playwright.
// Run: node scripts/generate-og-image.mjs   (from apps/web)
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// Everything is inlined as data URIs: setContent() runs on about:blank, where
// Chromium refuses file:// fonts and images, so linked assets silently fall
// back to Times and Helvetica.
const dataUri = (file, type) =>
  `data:${type};base64,${fs.readFileSync(path.join(root, file)).toString('base64')}`
const font = p => dataUri(`node_modules/@fontsource/${p}`, 'font/woff2')
const logo = dataUri('src/assets/tabLogoW.svg', 'image/svg+xml')
const poster = name => dataUri(`public/carousel-posters/${name}.webp`, 'image/webp')

const html = `<!doctype html>
<html>
<head>
<style>
  @font-face { font-family: 'Instrument Serif'; src: url('${font('instrument-serif/files/instrument-serif-latin-400-normal.woff2')}') format('woff2'); }
  @font-face { font-family: 'Instrument Serif'; font-style: italic; src: url('${font('instrument-serif/files/instrument-serif-latin-400-italic.woff2')}') format('woff2'); }
  @font-face { font-family: 'Inter'; src: url('${font('inter/files/inter-latin-400-normal.woff2')}') format('woff2'); }
  @font-face { font-family: 'Inter'; font-weight: 600; src: url('${font('inter/files/inter-latin-600-normal.woff2')}') format('woff2'); }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    position: relative; overflow: hidden;
    width: 1200px; height: 630px;
    background: #000; color: #f4f4f3;
    font-family: 'Inter', sans-serif;
  }
  .glow {
    position: absolute; right: -180px; bottom: -260px; width: 820px; height: 820px; border-radius: 50%;
    background: radial-gradient(circle, rgb(19 133 214 / 30%) 0%, rgb(19 133 214 / 8%) 38%, transparent 66%);
  }
  .copy {
    position: absolute; z-index: 2; inset: 64px auto 60px 72px; width: 620px;
    display: flex; flex-direction: column; justify-content: space-between;
  }
  .brand { display: flex; align-items: center; gap: 16px; }
  .brand img { width: 52px; height: 52px; border-radius: 12px; }
  .brand span { font-size: 30px; font-weight: 600; letter-spacing: -0.02em; }
  h1 {
    font-family: 'Instrument Serif', serif; font-weight: 400;
    font-size: 78px; line-height: 1; letter-spacing: -0.02em;
  }
  h1 em { color: #3db4f5; }
  .sub { margin-top: 26px; max-width: 470px; color: #b2aeaa; font-size: 24px; line-height: 1.38; letter-spacing: -0.01em; }
  .url { color: #8f8b87; font-size: 21px; letter-spacing: 0.02em; }
  .films { position: absolute; z-index: 1; top: 0; right: 0; width: 600px; height: 630px; }
  .film {
    position: absolute; width: 440px; aspect-ratio: 16 / 9; object-fit: cover;
    border: 1px solid #2a2a2a; border-radius: 14px;
    box-shadow: 0 40px 80px rgb(0 0 0 / 60%);
  }
  .f1 { top: 40px; left: 200px; transform: rotate(5deg); filter: brightness(.42); }
  .f2 { top: 176px; left: 110px; transform: rotate(-3deg); filter: brightness(.7); }
  .f3 { top: 330px; left: 176px; transform: rotate(2deg); }
  .films::before {
    content: ''; position: absolute; z-index: 3; inset: 0 auto 0 0; width: 120px;
    background: linear-gradient(90deg, #000, transparent);
  }
</style>
</head>
<body>
  <div class="glow"></div>
  <div class="films">
    <img class="film f1" src="${poster('supermemory')}" />
    <img class="film f2" src="${poster('gtmcofounder')}" />
    <img class="film f3" src="${poster('graphify')}" />
  </div>
  <div class="copy">
    <div class="brand"><img src="${logo}" /><span>Pitch</span></div>
    <div>
      <h1>One studio.<br />Work worth <em>shipping.</em></h1>
      <p class="sub">Launch films, product demos, decks and edited videos. Directed from a URL, a recording, or an idea.</p>
    </div>
    <div class="url">trypitch.co</div>
  </div>
</body>
</html>`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
await page.setContent(html, { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts.ready)
const out = path.join(root, 'public/og-image.png')
await page.screenshot({ path: out, type: 'png' })
await browser.close()
console.log(`wrote ${out}`)
