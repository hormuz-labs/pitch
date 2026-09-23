/**
 * `pitch demo` end to end, the way the agent reaches it: the CLI dispatcher
 * (what the sandbox's `pitch` socket calls) → the demo commands → the studio
 * host-action registry → the demo-video flow → the browser driver → a real
 * Chromium page. Only the database row and the CloakBrowser launch are
 * stand-ins; every hop in between is production code.
 *
 * Skipped where Chromium cannot launch (the studio image ships none).
 */

import fs from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { type Browser, chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const projects = fs.mkdtempSync(path.join(os.tmpdir(), 'pitch-e2e-projects-'))
process.env.PROJECTS_DIR = projects

const shared = vi.hoisted(() => ({ browser: null as Browser | null }))

vi.mock('@saas/db', () => ({
  prisma: { project: { findFirst: async () => ({ id: 'proj_e2e' }) } },
}))
vi.mock('../../apps/api/src/render/recording.ts', async () => {
  const { createBrowserDriver } = await import('../../apps/api/src/render/utils/browser-driver.ts')
  const fsp = await import('node:fs')
  const p = await import('node:path')
  return {
    prepareDemoAssets: async () => {
      throw new Error('not used')
    },
    startRecording: async (input: { workspaceDir: string }) => {
      const context = await shared.browser!.newContext({ viewport: { width: 1280, height: 720 } })
      await context.newPage()
      let recording = false
      let startTime = 0
      return {
        get startTime() {
          return startTime
        },
        get recording() {
          return recording
        },
        streamId: 'demo-e2e',
        driver: createBrowserDriver(context, input.workspaceDir),
        startCapture: async () => {
          startTime = Date.now()
          recording = true
          // As the real capture does: the take replaces the rehearsal marker.
          fsp.rmSync(p.join(input.workspaceDir, 'recording', 'browser.json'), { force: true })
          fsp.writeFileSync(
            p.join(input.workspaceDir, 'recording', 'demo-config.json'),
            JSON.stringify({ startTime, voiceName: 'Puck' }),
          )
        },
        stop: async () => {
          recording = false
          await context.close()
        },
      }
    },
  }
})

const chromiumLaunches = await (async () => {
  try {
    const b = await chromium.launch()
    await b.close()
    return true
  } catch {
    return false
  }
})()
const describeLive = chromiumLaunches ? describe : describe.skip

const PAGE = `<!doctype html><title>E2E</title>
<input id="name" aria-label="Name">
<button id="go" onclick="document.title='clicked'">Go</button>`

describeLive('pitch demo, end to end on a real page', () => {
  let server: Server
  let url: string
  let ws: string
  let pitch: (...argv: string[]) => Promise<{ text: string; ok: boolean }>

  beforeAll(async () => {
    shared.browser = await chromium.launch()
    server = createServer((_req, res) =>
      res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE),
    )
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`

    ws = path.join(projects, 'demo-video--user_e2e--walkthrough')
    fs.mkdirSync(path.join(ws, 'recording'), { recursive: true })
    fs.writeFileSync(
      path.join(ws, 'project.json'),
      JSON.stringify({ userId: 'user_e2e', options: {}, uploads: [] }),
    )
    await import('../../apps/api/src/flows/demo-video/index.ts')
    const { run } = await import('../../.pi/cli/run.ts')
    pitch = (...argv) => run(argv, { cwd: ws })
  }, 60_000)

  afterAll(async () => {
    await shared.browser?.close()
    server?.close()
    fs.rmSync(projects, { recursive: true, force: true })
  })

  const refOf = (snapshot: string, label: RegExp) =>
    snapshot
      .split('\n')
      .find(line => label.test(line))
      ?.match(/\[ref=(\w+)\]/)?.[1]

  it('records, drives the page and stops without a shell anywhere', async () => {
    const started = await pitch('demo', 'record-start', '--url', url)
    expect(started.ok, started.text).toBe(true)
    expect(started.text).toContain('Recording started')

    const snapshot = await pitch('demo', 'browser', '--command', 'snapshot')
    expect(snapshot.ok, snapshot.text).toBe(true)
    const go = refOf(snapshot.text, /button "Go"/)
    const name = refOf(snapshot.text, /textbox "Name"/)
    expect(go && name).toBeTruthy()

    const clicked = await pitch('demo', 'browser', '--command', `click ${go}`)
    expect(clicked.ok, clicked.text).toBe(true)
    expect(clicked.text).toContain('Page: clicked')

    const typed = await pitch('demo', 'fill-field', '--target', name!, '--text', 'hello $(id)')
    expect(typed.ok, typed.text).toBe(true)
    const value = await pitch('demo', 'browser', '--command', `eval "el => el.value" ${name}`)
    expect(value.text).toContain('Result: "hello $(id)"')

    const state = JSON.parse(fs.readFileSync(path.join(ws, 'recording/demo-state.json'), 'utf8'))
    expect(state.clickEvents).toHaveLength(2)

    const stopped = await pitch('demo', 'record-stop')
    expect(stopped.ok, stopped.text).toBe(true)
    expect(stopped.text).toContain('Recording stopped')
  }, 60_000)

  it('refuses shell commands and old verbs before they reach the page', async () => {
    for (const command of ['cat /etc/passwd', 'env', 'run-code "async p => 1"', 'open x']) {
      const result = await pitch('demo', 'browser', '--command', command)
      expect(result.ok).toBe(false)
    }
    const gone = await pitch('demo', 'bash', '--command', 'env')
    expect(gone.ok).toBe(false)
    const readFile = await pitch('demo', 'read-file', '--path', '/etc/passwd')
    expect(readFile.ok).toBe(false)
  })

  it('says plainly when no browser is open', async () => {
    const result = await pitch('demo', 'browser', '--command', 'snapshot')
    expect(result.ok).toBe(false)
    expect(result.text).toContain('record-start')
  })
})
