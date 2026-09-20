import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const MANAGER = process.env.CLOAK_MANAGER_URL
async function checkManagerLive(): Promise<boolean> {
  if (!MANAGER) return false
  try {
    const res = await fetch(`${MANAGER.replace(/\/+$/, '')}/api/profiles`, {
      signal: AbortSignal.timeout(3000),
    })
    return res.ok
  } catch {
    return false
  }
}

const isLive = await checkManagerLive()
const describeLive = isLive ? describe : describe.skip

describeLive('end-to-end CloakBrowser CDP video recording', () => {
  let profileId: string | null = null
  let cdpUrl: string | null = null
  let testWorkspace: string
  const session = 'test-e2e-cdp-recording'

  beforeAll(async () => {
    testWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-cdp-ws-'))
    const createRes = await fetch(`${MANAGER.replace(/\/+$/, '')}/api/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'test_cdp_suite_profile' }),
    })
    const profile = (await createRes.json()) as any
    profileId = profile.id
    await fetch(`${MANAGER.replace(/\/+$/, '')}/api/profiles/${profileId}/launch`, {
      method: 'POST',
    })
    cdpUrl = `${MANAGER.replace(/\/+$/, '')}/api/profiles/${profileId}/cdp`
  }, 60_000)

  afterAll(async () => {
    if (profileId) {
      await fetch(`${MANAGER.replace(/\/+$/, '')}/api/profiles/${profileId}/stop`, {
        method: 'POST',
      }).catch(() => {})
      await fetch(`${MANAGER.replace(/\/+$/, '')}/api/profiles/${profileId}`, {
        method: 'DELETE',
      }).catch(() => {})
    }
    try {
      fs.rmSync(testWorkspace, { recursive: true, force: true })
    } catch {}
  })

  it('records a video session and captures actions over CDP', async () => {
    const { execAsync } = await import('../../apps/api/src/render/media.js')
    const webmPath = path.join(testWorkspace, 'demo.webm')

    // Attach to CDP
    await execAsync(`playwright-cli -s=${session} attach --cdp ${cdpUrl}`, { cwd: testWorkspace })

    // Resize viewport
    await execAsync(`playwright-cli -s=${session} resize 1280 720`, { cwd: testWorkspace })

    // Start video
    await execAsync(`playwright-cli -s=${session} video-start "${webmPath}" --size=1280x720`, {
      cwd: testWorkspace,
    })

    // Navigate to a test data URL
    await execAsync(`playwright-cli -s=${session} goto "data:text/html,<h1>Demo CDP Live</h1>"`, {
      cwd: testWorkspace,
    })

    // Take snapshot over CDP
    const { stdout: snapshotOut } = await execAsync(`playwright-cli -s=${session} snapshot`, {
      cwd: testWorkspace,
    })
    expect(snapshotOut).toContain('Demo CDP Live')

    // Stop video
    await execAsync(`playwright-cli -s=${session} video-stop`, { cwd: testWorkspace })

    // Close session
    await execAsync(`playwright-cli -s=${session} close`, { cwd: testWorkspace }).catch(() => {})

    // Check recorded video exists and has size
    expect(fs.existsSync(webmPath)).toBe(true)
    const stats = fs.statSync(webmPath)
    expect(stats.size).toBeGreaterThan(0)
  }, 60_000)
})
