#!/usr/bin/env node
// Live integration check for the demo camera's scroll-to-centre behaviour.
//
// Drives the REAL in-page SMOOTH_SCROLL_JS (lifted from the demo-generator tools) against
// a controlled 6000px page and asserts each target lands where the pure spec
// (apps/worker/src/utils/zoom-framing.ts → computeScrollTargetY) predicts. This closes
// the loop between the unit-tested math and the actual browser implementation.
//
// Requires `playwright-cli` on PATH. Run:  node scripts/verify-scroll-centering.mjs
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as path from 'node:path'

const run = promisify(exec)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const sh = async c => {
  try { return (await run(c, { maxBuffer: 1e8 })).stdout } catch (e) { return (e.stdout || '') + (e.stderr || '') }
}
const result = o => { const m = o.match(/### Result\s*\n([\s\S]*?)\n###/); return m ? m[1].trim() : null }

const SCROLL = readFileSync(path.join(root, '.opencode/tools/demo-generator.ts'), 'utf8')
  .match(/const SMOOTH_SCROLL_JS\s*=\s*\n?\s*'([\s\S]*?)'\n/)[1]
const { computeScrollTargetY } = await import(
  path.join(root, 'apps/worker/src/utils/zoom-framing.ts')
)

const html = readFileSync(path.join(__dirname, 'fixtures/scroll-centering-page.html'))
const server = createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html) })
await new Promise(r => server.listen(0, r))
const url = `http://localhost:${server.address().port}/`

const CASES = [['topish', 200], ['edge', 900], ['mid', 3000], ['bottom', 5880]]
let pass = 0
try {
  await sh('playwright-cli open'); await sh('playwright-cli resize 1920 1080')
  await sh(`playwright-cli goto "${url}"`); await new Promise(r => setTimeout(r, 700))
  const arg = '"' + SCROLL.replace(/(["\\$`])/g, '\\$1') + '"'
  const docH = +result(await sh(`playwright-cli eval "() => document.documentElement.scrollHeight"`))
  const viewH = +result(await sh(`playwright-cli eval "() => window.innerHeight"`))
  for (const [id, docTop] of CASES) {
    await sh(`playwright-cli eval "() => window.scrollTo(0,0)"`); await new Promise(r => setTimeout(r, 200))
    const plan = computeScrollTargetY(docTop, 80, 0, viewH, docH)
    await sh(`playwright-cli eval ${arg} "#${id}"`); await new Promise(r => setTimeout(r, 300))
    const after = +result(
      await sh(`playwright-cli eval "() => { const r=document.getElementById('${id}').getBoundingClientRect(); return Math.round(r.top + r.height/2); }"`),
    )
    const predicted = Math.round(plan.elementViewportCenterAfter)
    const ok = Math.abs(after - predicted) <= 5
    if (ok) pass++
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${id.padEnd(7)} elemCentreAfter=${after} predicted=${predicted} willScroll=${plan.willScroll}`)
  }
} finally {
  await sh('playwright-cli close'); server.close()
}
console.log(`\n${pass}/${CASES.length} live cases match the spec`)
process.exit(pass === CASES.length ? 0 : 1)
