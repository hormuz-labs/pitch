import { execFile } from 'node:child_process'
import fs from 'node:fs'
import { createServer, type Server } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  compactPlaywrightCommand,
  normalizePlaywrightCommand,
  PLAYWRIGHT_CLI_VERBS,
  scopePlaywrightCommand,
} from '../.pi/cli/demo.js'
import {
  assertRecordingCoversTimeline,
  recoverRecordingArtifact,
  sanitizeSessionName,
} from '../apps/api/src/render/recording.js'
import { withTimeout } from '../apps/api/src/render/utils/cloak-browser.js'

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

  it('suppresses expensive automatic snapshots for direct interactions', () => {
    expect(compactPlaywrightCommand('playwright-cli hover e1')).toBe(
      'playwright-cli --raw hover e1',
    )
    expect(compactPlaywrightCommand('playwright-cli click e1')).toBe(
      'playwright-cli --raw click e1',
    )
    expect(compactPlaywrightCommand('playwright-cli snapshot')).toBe('playwright-cli snapshot')
    expect(compactPlaywrightCommand('playwright-cli --raw click e1')).toBe(
      'playwright-cli --raw click e1',
    )
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

describe('direct CloakBrowser operation bounds', () => {
  it('returns completed operations', async () => {
    await expect(withTimeout('quick operation', Promise.resolve('ok'), 50)).resolves.toBe('ok')
  })

  it('rejects stalled operations', async () => {
    await expect(withTimeout('stalled operation', new Promise(() => {}), 5)).rejects.toThrow(
      'stalled operation timed out after 5ms',
    )
  })
})

describe('recording session naming', () => {
  it('sanitizes project directories containing dots', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'studio--user123--stripe.com-'))

    try {
      const sanitized = sanitizeSessionName(path.basename(tmp))
      expect(sanitized).toMatch(/^[a-zA-Z0-9_-]+$/)
      expect(sanitized).toContain('stripe_com')
    } finally {
      try {
        fs.rmSync(tmp, { recursive: true, force: true })
      } catch {}
    }
  })
})

describe('recording artifact finalization', () => {
  it('rejects a recording that ends well before the tracked session', () => {
    expect(() => assertRecordingCoversTimeline(39.5, 1_000, 58_000)).toThrow(
      /captured 39.5s of 57.0s/,
    )
  })

  it('allows normal recorder finalization tolerance', () => {
    expect(() => assertRecordingCoversTimeline(56, 1_000, 58_000)).not.toThrow()
  })

  it('keeps a non-empty canonical recording', () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-recording-'))
    const recording = path.join(workspace, 'recording')
    fs.mkdirSync(recording)
    const expected = path.join(recording, 'demo.webm')
    fs.writeFileSync(expected, 'video')
    expect(recoverRecordingArtifact(workspace, expected, Date.now() - 1000)).toBe(expected)
    expect(fs.readFileSync(expected, 'utf8')).toBe('video')
    fs.rmSync(workspace, { recursive: true, force: true })
  })

  it('recovers the one current Playwright trace into the canonical path', () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-recording-'))
    const traces = path.join(workspace, '.playwright-cli', 'traces')
    const recording = path.join(workspace, 'recording')
    fs.mkdirSync(traces, { recursive: true })
    fs.mkdirSync(recording)
    const startedAt = Date.now() - 1000
    fs.writeFileSync(path.join(traces, 'take.webm'), 'captured video')
    const expected = path.join(recording, 'demo.webm')

    expect(recoverRecordingArtifact(workspace, expected, startedAt)).toBe(expected)
    expect(fs.readFileSync(expected, 'utf8')).toBe('captured video')
    fs.rmSync(workspace, { recursive: true, force: true })
  })

  it('rejects missing, empty, stale, or ambiguous recordings', () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-recording-'))
    const traces = path.join(workspace, '.playwright-cli', 'traces')
    const recording = path.join(workspace, 'recording')
    fs.mkdirSync(traces, { recursive: true })
    fs.mkdirSync(recording)
    const startedAt = Date.now()
    const stale = path.join(traces, 'stale.webm')
    fs.writeFileSync(stale, 'old')
    fs.utimesSync(stale, new Date(startedAt - 5000), new Date(startedAt - 5000))
    const expected = path.join(recording, 'demo.webm')
    expect(() => recoverRecordingArtifact(workspace, expected, startedAt)).toThrow(
      /0 current trace candidate/,
    )

    fs.writeFileSync(path.join(traces, 'one.webm'), 'one')
    fs.writeFileSync(path.join(traces, 'two.webm'), 'two')
    expect(() => recoverRecordingArtifact(workspace, expected, startedAt)).toThrow(
      /2 current trace candidate/,
    )
    fs.rmSync(workspace, { recursive: true, force: true })
  })
})
