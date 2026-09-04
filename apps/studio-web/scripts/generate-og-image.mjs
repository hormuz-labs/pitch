// Generates public/og-image.png (1200x630 social card) using Playwright.
// Run: node scripts/generate-og-image.mjs   (from apps/web)
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const font = (p) => `file://${path.join(root, 'node_modules/@fontsource', p)}`
const logoSvg = fs.readFileSync(path.join(root, 'src/assets/tabLogoW.svg'), 'utf8')
const logoDataUri = `data:image/svg+xml;base64,${Buffer.from(logoSvg).toString('base64')}`

const html = `<!doctype html>
<html>
<head>
<style>
  @font-face {
    font-family: 'Instrument Serif';
    src: url('${font('instrument-serif/files/instrument-serif-latin-400-normal.woff2')}') format('woff2');
  }
  @font-face {
    font-family: 'Inter';
    src: url('${font('inter/files/inter-latin-400-normal.woff2')}') format('woff2');
  }
  @font-face {
    font-family: 'Inter';
    font-weight: 600;
    src: url('${font('inter/files/inter-latin-600-normal.woff2')}') format('woff2');
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px;
    background: linear-gradient(135deg, #0a0a0a 0%, #16161f 60%, #1a1a2e 100%);
    color: #fff;
    font-family: 'Inter', sans-serif;
    display: flex; flex-direction: column; justify-content: space-between;
    padding: 72px 80px;
    position: relative;
    overflow: hidden;
  }
  .glow {
    position: absolute; width: 700px; height: 700px; border-radius: 50%;
    background: radial-gradient(circle, rgba(99,102,241,0.22) 0%, transparent 65%);
    top: -260px; right: -160px;
  }
  .brand { display: flex; align-items: center; gap: 20px; }
  .brand img { width: 64px; height: 64px; }
  .brand span { font-size: 34px; font-weight: 600; letter-spacing: -0.5px; }
  h1 {
    font-family: 'Instrument Serif', serif;
    font-size: 84px; line-height: 1.05; font-weight: 400;
    letter-spacing: -1px; max-width: 980px;
  }
  h1 em { font-style: italic; color: #a5b4fc; }
  .sub { font-size: 26px; color: #9ca3af; margin-top: 28px; max-width: 860px; line-height: 1.4; }
  .url { font-size: 22px; color: #6b7280; letter-spacing: 0.5px; }
</style>
</head>
<body>
  <div class="glow"></div>
  <div class="brand">
    <img src="${logoDataUri}" />
    <span>Pitch</span>
  </div>
  <div>
    <h1>Turn any URL into a <em>cinematic</em> product demo video</h1>
    <p class="sub">An AI agent navigates your live product, writes the script, and renders a narrated 1080p video in minutes. No recording. No editing.</p>
  </div>
  <div class="url">trypitch.co</div>
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
