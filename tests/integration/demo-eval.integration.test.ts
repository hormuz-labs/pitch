/**
 * INTEGRATION test — runs the REAL browser-side element-box eval against a REAL browser
 * via playwright-cli, on a fixture page with actual layout. This covers what the pure
 * unit tests fundamentally cannot: real getBoundingClientRect geometry and real CSS
 * cursor resolution. It exercises the exact ELEMENT_BOX_JS string production uses, then
 * parses its output with the exact production parser (parseElementBoxJson).
 *
 * Requires `playwright-cli` on PATH and launches a browser, so it is SLOW and lives
 * outside the fast unit suite. Run it with `make integration` (bun run test:integration).
 * If playwright-cli isn't installed, the whole suite skips with a clear message.
 */
import { exec, execSync } from 'node:child_process'
import { promisify } from 'node:util'
import { type BrowserServer, chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ELEMENT_BOX_JS, parseElementBoxJson } from '../../.pi/lib/demo-core'

const execAsync = promisify(exec)
const hasCli = (() => {
  try {
    execSync('command -v playwright-cli', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()

const pw = (args: string) => execAsync(`playwright-cli ${args}`, { maxBuffer: 16 * 1024 * 1024 })
/** Run the production ELEMENT_BOX_JS eval on a selector and parse it the production way. */
async function boxOf(selector: string) {
  const { stdout } = await pw(`--raw eval '${ELEMENT_BOX_JS}' '${selector}'`)
  return parseElementBoxJson(stdout)
}

// Fixture served as a data: URL (playwright-cli blocks file:). cursor:pointer is set
// INLINE on the button/card because a bare native <button> isn't pointer by default.
const FIXTURE = `<body style="margin:0">
<button id="btn" style="position:fixed;left:100px;top:50px;width:120px;height:40px;cursor:pointer">Save</button>
<input id="field" style="position:fixed;left:100px;top:120px;width:200px;height:36px" placeholder="name">
<div id="plain" style="position:fixed;left:100px;top:200px;width:120px;height:40px">just text</div>
<div id="card" style="position:fixed;left:400px;top:150px;width:800px;height:600px;cursor:pointer"><h2 style="margin:20px">Farm Al-Amal</h2><div style="height:400px"></div></div>
</body>`

const suite = hasCli ? describe : describe.skip
let server: BrowserServer | undefined
if (!hasCli) console.warn('playwright-cli not found on PATH — skipping demo-eval integration test')

suite('ELEMENT_BOX_JS against a real browser', () => {
  beforeAll(async () => {
    await pw('close').catch(() => {}) // ensure no stale session
    server = await chromium.launchServer({ headless: true })
    await pw(`attach --endpoint ${server.wsEndpoint()}`)
    await pw(`goto "data:text/html,${encodeURIComponent(FIXTURE)}"`)
    await new Promise(r => setTimeout(r, 800)) // let layout settle
  }, 60_000)

  afterAll(async () => {
    await pw('close').catch(() => {})
    await server?.close()
  })

  it('reads real geometry for a normal button', async () => {
    const box = await boxOf('#btn')
    expect(box).not.toBeNull()
    expect(box!.w).toBeCloseTo(120, 0)
    expect(box!.h).toBeCloseTo(40, 0)
    expect(box!.cx).toBeCloseTo(160, 0) // 100 + 120/2
    expect(box!.cy).toBeCloseTo(70, 0) // 50 + 40/2
  })

  it('detects hand (cursor:pointer) on the button, arrow on a text field and plain div', async () => {
    expect((await boxOf('#btn'))!.hand).toBe(true)
    expect((await boxOf('#field'))!.hand).toBe(false)
    expect((await boxOf('#plain'))!.hand).toBe(false)
  })

  it('keeps the anchor at the geometric center for a normal element', async () => {
    const box = (await boxOf('#btn'))!
    expect(box.ax).toBeCloseTo(box.cx, 0)
    expect(box.ay).toBeCloseTo(box.cy, 0)
  })

  it('snaps the anchor to the title for a large clickable card, not its empty center', async () => {
    const box = (await boxOf('#card'))!
    expect(box.hand).toBe(true)
    // geometric center is the empty middle (~800,450); the title sits top-left.
    expect(box.cx).toBeCloseTo(800, 0)
    expect(box.cy).toBeCloseTo(450, 0)
    expect(box.ax).toBeLessThan(box.cx - 100) // anchored left, onto the title
    expect(box.ay).toBeLessThan(box.cy - 100) // anchored up, onto the title
  })
})
