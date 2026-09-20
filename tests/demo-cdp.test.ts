import { execFile } from 'node:child_process'
import fs from 'node:fs'
import { createServer, type Server } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  normalizePlaywrightCommand,
  PLAYWRIGHT_CLI_VERBS,
  scopePlaywrightCommand,
} from '../.pi/cli/demo.js'
import { sanitizeSessionName, startRecording } from '../apps/api/src/render/recording.js'
import { startManagerBrowser } from '../apps/api/src/render/utils/manager-browser.js'
import { getManagerHeaders } from '../packages/shared/src/manager-client.js'

const execFileAsync = promisify(execFile)

describe('demo video session name sanitization & scoping', () => {
  it('sanitizes domain names with dots, spaces, and special characters', () => {
    expect(sanitizeSessionName('stripe.com')).toBe('stripe_com')
    expect(sanitizeSessionName('my.app.pitch.co')).toBe('my_app_pitch_co')
    expect(sanitizeSessionName('studio--user_123--demo.v1')).toBe('studio--user_123--demo_v1')
    expect(sanitizeSessionName('clean-session_name-123')).toBe('clean-session_name-123')
    expect(sanitizeSessionName('project name with spaces!')).toBe('project_name_with_spaces_')
  })

  it('normalizes all Playwright verbs to playwright-cli commands', () => {
    for (const verb of ['snapshot', 'click', 'goto', 'press', 'eval', 'resize', 'hover', 'fill']) {
      expect(PLAYWRIGHT_CLI_VERBS.has(verb)).toBe(true)
      expect(normalizePlaywrightCommand(`${verb} arg1`)).toBe(`playwright-cli ${verb} arg1`)
    }

    expect(normalizePlaywrightCommand('snapshot')).toBe('playwright-cli snapshot')
    expect(normalizePlaywrightCommand('goto https://example.com')).toBe(
      'playwright-cli goto https://example.com',
    )
    expect(normalizePlaywrightCommand('click e53')).toBe('playwright-cli click e53')
    expect(normalizePlaywrightCommand('press ArrowRight')).toBe('playwright-cli press ArrowRight')
    expect(normalizePlaywrightCommand('resize 1920 1080')).toBe('playwright-cli resize 1920 1080')
    expect(normalizePlaywrightCommand('eval "() => 1"')).toBe('playwright-cli eval "() => 1"')
  })

  it('preserves commands already starting with playwright-cli', () => {
    expect(normalizePlaywrightCommand('playwright-cli snapshot')).toBe('playwright-cli snapshot')
    expect(normalizePlaywrightCommand('playwright-cli -s=custom snapshot')).toBe(
      'playwright-cli -s=custom snapshot',
    )
  })

  it('does not alter non-playwright shell commands', () => {
    expect(normalizePlaywrightCommand('sleep 2')).toBe('sleep 2')
    expect(normalizePlaywrightCommand('echo hello')).toBe('echo hello')
    expect(normalizePlaywrightCommand('ls -la')).toBe('ls -la')
    expect(normalizePlaywrightCommand('')).toBe('')
  })

  it('scopes commands to sanitized session names', () => {
    expect(scopePlaywrightCommand('stripe.com', 'snapshot')).toBe(
      'playwright-cli -s=stripe_com snapshot',
    )
    expect(scopePlaywrightCommand('demo-session', 'playwright-cli click e1')).toBe(
      'playwright-cli -s=demo-session click e1',
    )
    expect(scopePlaywrightCommand('demo.session', 'playwright-cli -s=existing click e1')).toBe(
      'playwright-cli -s=existing click e1',
    )
    expect(scopePlaywrightCommand('demo.session', 'sleep 1')).toBe('sleep 1')
  })
})

describe('guest playwright-cli binary routing over PITCH_SOCKET', () => {
  const guestPw = path.resolve('.pi/guest/playwright-cli')
  let tmpDir: string

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pitch-guest-test-'))
  })

  afterAll(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {}
  })

  it('exists and is executable', () => {
    expect(fs.existsSync(guestPw)).toBe(true)
    const stats = fs.statSync(guestPw)
    expect(stats.mode & 0o111).toBeGreaterThan(0) // executable
  })

  it('fails with clear error if PITCH_SOCKET is not set and no system binary found', async () => {
    const nodeBinDir = path.join(tmpDir, 'node-bin')
    fs.mkdirSync(nodeBinDir, { recursive: true })
    const nodePath = process.execPath
    const symlinkPath = path.join(nodeBinDir, 'node')
    try {
      fs.unlinkSync(symlinkPath)
    } catch {}
    fs.symlinkSync(nodePath, symlinkPath)

    try {
      await execFileAsync(guestPw, ['snapshot'], {
        env: { PATH: nodeBinDir, PITCH_SOCKET: '' },
      })
      expect.unreachable('should have thrown')
    } catch (err: any) {
      expect(err.code).toBe(2)
      expect(err.stderr).toContain('PITCH_SOCKET is not set')
    }
  })

  it('forwards commands over PITCH_SOCKET and unwraps JSON stdout/stderr', async () => {
    const sockPath = path.join(tmpDir, 'test.sock')
    try {
      fs.unlinkSync(sockPath)
    } catch {}

    let receivedArgv: any = null

    const server: Server = createServer(conn => {
      let data = ''
      conn.setEncoding('utf8')
      conn.on('data', chunk => {
        data += chunk
        const nl = data.indexOf('\n')
        if (nl !== -1) {
          const line = data.slice(0, nl)
          receivedArgv = JSON.parse(line)
          const mockResponse = JSON.stringify({
            stdout:
              '### Page\n- Page URL: https://example.com\n### Snapshot\n- button "Click me" [ref=e1]',
            stderr: '',
          })
          conn.write(`${JSON.stringify({ out: mockResponse })}\n`)
          conn.end(`${JSON.stringify({ exit: 0 })}\n`)
        }
      })
    })

    await new Promise<void>(resolve => server.listen(sockPath, resolve))

    try {
      const { stdout, stderr } = await execFileAsync(guestPw, ['snapshot'], {
        env: { PATH: process.env.PATH, PITCH_SOCKET: sockPath },
      })

      expect(receivedArgv).toEqual({
        argv: ['demo', 'bash', '--command', 'playwright-cli snapshot'],
      })
      expect(stdout).toContain('### Page')
      expect(stdout).toContain('[ref=e1]')
      expect(stderr).toBe('')
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()))
      try {
        fs.unlinkSync(sockPath)
      } catch {}
    }
  })

  it('handles arguments with spaces and quotes', async () => {
    const sockPath = path.join(tmpDir, 'test-quotes.sock')
    try {
      fs.unlinkSync(sockPath)
    } catch {}

    let receivedArgv: any = null

    const server: Server = createServer(conn => {
      let data = ''
      conn.setEncoding('utf8')
      conn.on('data', chunk => {
        data += chunk
        const nl = data.indexOf('\n')
        if (nl !== -1) {
          const line = data.slice(0, nl)
          receivedArgv = JSON.parse(line)
          conn.write(`${JSON.stringify({ out: '{"stdout":"ok","stderr":""}' })}\n`)
          conn.end(`${JSON.stringify({ exit: 0 })}\n`)
        }
      })
    })

    await new Promise<void>(resolve => server.listen(sockPath, resolve))

    try {
      const { stdout } = await execFileAsync(
        guestPw,
        ['eval', '() => location.href', 'hello "world"'],
        {
          env: { PATH: process.env.PATH, PITCH_SOCKET: sockPath },
        },
      )

      expect(receivedArgv).toEqual({
        argv: [
          'demo',
          'bash',
          '--command',
          'playwright-cli eval "() => location.href" "hello \\"world\\""',
        ],
      })
      expect(stdout.trim()).toBe('ok')
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()))
      try {
        fs.unlinkSync(sockPath)
      } catch {}
    }
  })

  it('propagates non-zero exit code on failure', async () => {
    const sockPath = path.join(tmpDir, 'test-fail.sock')
    try {
      fs.unlinkSync(sockPath)
    } catch {}

    const server: Server = createServer(conn => {
      let data = ''
      conn.setEncoding('utf8')
      conn.on('data', chunk => {
        data += chunk
        const nl = data.indexOf('\n')
        if (nl !== -1) {
          conn.write(`${JSON.stringify({ out: '{"stdout":"","stderr":"Target closed"}' })}\n`)
          conn.end(`${JSON.stringify({ exit: 1 })}\n`)
        }
      })
    })

    await new Promise<void>(resolve => server.listen(sockPath, resolve))

    try {
      await expect(
        execFileAsync(guestPw, ['click', 'e999'], {
          env: { PATH: process.env.PATH, PITCH_SOCKET: sockPath },
        }),
      ).rejects.toMatchObject({
        code: 1,
        stderr: expect.stringContaining('Target closed'),
      })
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()))
      try {
        fs.unlinkSync(sockPath)
      } catch {}
    }
  })
})

describe('CDP manager browser & STUDIO_CDP_URL support', () => {
  const prevCdpUrl = process.env.STUDIO_CDP_URL
  const prevAuthToken = process.env.CLOAK_MANAGER_AUTH_TOKEN

  afterEach(() => {
    if (prevCdpUrl === undefined) delete process.env.STUDIO_CDP_URL
    else process.env.STUDIO_CDP_URL = prevCdpUrl

    if (prevAuthToken === undefined) delete process.env.CLOAK_MANAGER_AUTH_TOKEN
    else process.env.CLOAK_MANAGER_AUTH_TOKEN = prevAuthToken
  })

  it('supports explicit STUDIO_CDP_URL in startManagerBrowser without manager calls', async () => {
    process.env.STUDIO_CDP_URL = 'http://127.0.0.1:9222'
    const handle = await startManagerBrowser('any-user')
    expect(handle.cdpUrl).toBe('http://127.0.0.1:9222')
    expect(handle.profileId).toBe('any-user')
    await expect(handle.close()).resolves.toBeUndefined()
  })

  it('sends manager auth headers when token is set', () => {
    process.env.CLOAK_MANAGER_AUTH_TOKEN = 'secret-token'
    const headers = getManagerHeaders()
    expect(headers.Authorization).toBe('Bearer secret-token')

    delete process.env.CLOAK_MANAGER_AUTH_TOKEN
    expect(getManagerHeaders().Authorization).toBeUndefined()
  })
})

describe('startRecording lifecycle & session naming', () => {
  const prevCdpUrl = process.env.STUDIO_CDP_URL

  afterEach(() => {
    if (prevCdpUrl === undefined) delete process.env.STUDIO_CDP_URL
    else process.env.STUDIO_CDP_URL = prevCdpUrl
  })

  it('accepts project directories containing dots and sanitizes session name', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'studio--user123--stripe.com-'))

    let liveProfileId: string | null = null

    try {
      if (isLive) {
        const createRes = await fetch(`${MANAGER.replace(/\/+$/, '')}/api/profiles`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'sanitize_session_live_profile' }),
        })
        const profile = (await createRes.json()) as any
        liveProfileId = profile.id
        await fetch(`${MANAGER.replace(/\/+$/, '')}/api/profiles/${liveProfileId}/launch`, {
          method: 'POST',
        })

        process.env.STUDIO_CDP_URL = `${MANAGER.replace(/\/+$/, '')}/api/profiles/${liveProfileId}/cdp`
        const handle = await startRecording({
          userId: 'user_123',
          workspaceDir: tmp,
        })
        expect(handle.session).toMatch(/^[a-zA-Z0-9_-]+$/)
        expect(handle.session).toContain('stripe_com')
        await handle.stop()
      } else {
        const rawSession = path.basename(tmp)
        const sanitized = sanitizeSessionName(rawSession)
        expect(sanitized).toMatch(/^[a-zA-Z0-9_-]+$/)
        expect(sanitized).toContain('stripe_com')
      }
    } finally {
      if (liveProfileId) {
        await fetch(`${MANAGER.replace(/\/+$/, '')}/api/profiles/${liveProfileId}/stop`, {
          method: 'POST',
        }).catch(() => {})
        await fetch(`${MANAGER.replace(/\/+$/, '')}/api/profiles/${liveProfileId}`, {
          method: 'DELETE',
        }).catch(() => {})
      }
      try {
        fs.rmSync(tmp, { recursive: true, force: true })
      } catch {}
    }
  }, 60_000)
})

// Live CDP test against running CloakBrowser Manager if available
const MANAGER = process.env.CLOAK_MANAGER_URL || 'http://localhost:8080'
async function checkManagerLive(): Promise<boolean> {
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
    const { execAsync } = await import('../apps/api/src/render/media.js')
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
