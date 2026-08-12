import { chromium } from 'playwright'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto('http://localhost:5199/', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)
const section = await page.$('.landing-carousel')
await section.scrollIntoViewIfNeeded()
await page.waitForTimeout(1500)

const centerVideo = '.landing-carousel [aria-roledescription="slide"]:nth-child(1) video'

// seek ~5s ahead via the slider
const t0 = await page.$eval(centerVideo, v => v.currentTime)
await page.$eval('.landing-carousel input[type="range"]', (el, t) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(el, String(t + 5))
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}, t0)
await page.waitForTimeout(600)
const t1 = await page.$eval(centerVideo, v => v.currentTime)
console.log('seek: ', t0.toFixed(1), '->', t1.toFixed(1))

// unmute via button
await page.click('.landing-carousel button[aria-label="Unmute video"]')
await page.waitForTimeout(400)
let muted = await page.$eval(centerVideo, v => v.muted)
const label1 = await page.$eval('.landing-carousel button[aria-label*="ute video"]', b => b.getAttribute('aria-label'))
console.log('after unmute click: video.muted =', muted, '| button now says:', label1)

// mute again
await page.click('.landing-carousel button[aria-label="Mute video"]')
await page.waitForTimeout(400)
muted = await page.$eval(centerVideo, v => v.muted)
console.log('after mute click: video.muted =', muted)

// carousel drag still works (cards move) — drag on the video itself, not the pill
await page.mouse.move(720, 300)
await page.mouse.down()
await page.mouse.move(520, 300, { steps: 8 })
await page.mouse.up()
await page.waitForTimeout(1200)
const caption = await page.$eval('.landing-carousel p', el => el.textContent)
console.log('caption after drag:', caption)

await page.mouse.move(720, 380)
await page.waitForTimeout(300)
await section.screenshot({ path: '/tmp/carousel-seek.png' })
await browser.close()
console.log('done')
