/**
 * The sandbox's actual isolation, on a real kernel.
 *
 * The unit tests check the recipe; these check that the recipe does what it
 * claims — that the shell cannot reach the network, the secrets or another
 * project. Skipped anywhere `bwrap` will not run (macOS, or a container whose
 * seccomp/AppArmor profile forbids it — `make sandbox-check` explains that
 * case).
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bwrapCommand, explainBwrapFailure } from '../../.pi/lib/sandbox'

const BWRAP = process.env.STUDIO_BWRAP || 'bwrap'

let root: string
let workspace: string
let shared: string[]

function run(command: string) {
  const argv = bwrapCommand(command, { workspace, shared })
  const r = spawnSync(BWRAP, argv, { encoding: 'utf8' })
  return { out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim(), code: r.status }
}

function bwrapWorks(): boolean {
  const dir = mkdtempSync(path.join(tmpdir(), 'bwrap-probe-'))
  try {
    const r = spawnSync(BWRAP, bwrapCommand('true', { workspace: dir, shared: [] }), {
      encoding: 'utf8',
    })
    return r.status === 0 && !explainBwrapFailure(r.stderr ?? '')
  } catch {
    return false
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const live = bwrapWorks()
const describeLive = live ? describe : describe.skip
if (!live) console.warn('skipping sandbox integration tests — bwrap will not run here')

describeLive('the agent’s shell is confined to its project', () => {
  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'sandbox-it-'))
    workspace = path.join(root, 'projects', 'studio--user_1--acme')
    mkdirSync(workspace, { recursive: true })
    mkdirSync(path.join(root, 'projects', 'studio--user_2--secret'), { recursive: true })
    mkdirSync(path.join(root, 'engine'), { recursive: true })
    writeFileSync(path.join(root, '.env'), 'CLERK_SECRET_KEY=sk_live_do_not_read_me\n')
    writeFileSync(path.join(root, 'projects', 'studio--user_2--secret', 'shots.js'), 'other user\n')
    writeFileSync(path.join(root, 'engine', 'schema.md'), '# the shot schema\n')
    writeFileSync(path.join(workspace, 'shots.js'), 'window.SHOTS = {}\n')
    shared = [path.join(root, 'engine')]
  })

  afterAll(() => rmSync(root, { recursive: true, force: true }))

  it('runs commands and sees its own workspace', () => {
    expect(run('pwd && cat shots.js').out).toContain('window.SHOTS')
  })

  it('can write to its workspace', () => {
    expect(run('echo made > new.txt && cat new.txt').out).toBe('made')
  })

  it('reads the shared references at the path the host has them', () => {
    expect(run(`cat ${shared[0]}/schema.md`).out).toBe('# the shot schema')
    expect(run('cat ../../engine/schema.md').out).toBe('# the shot schema')
  })

  it('cannot write to a shared reference', () => {
    const r = run(`echo tampered > ${shared[0]}/schema.md 2>&1; cat ${shared[0]}/schema.md`)
    expect(r.out).toContain('# the shot schema')
    expect(r.out).not.toContain('tampered')
  })

  it('cannot read the secrets this process is holding', () => {
    const r = run(`cat ${path.join(root, '.env')} 2>&1; cat /app/.env 2>&1`)
    expect(r.out).not.toContain('sk_live_do_not_read_me')
  })

  it('cannot read another user’s project', () => {
    const other = path.join(root, 'projects', 'studio--user_2--secret', 'shots.js')
    expect(run(`cat ${other} 2>&1`).out).not.toContain('other user')
    expect(run('ls .. 2>&1').out).not.toContain('user_2')
  })

  it('has no network — the thing that stops "npx playwright install"', () => {
    // Name resolution and a direct-to-IP connection both, so a working DNS
    // cache cannot make this pass by accident.
    const r = run(
      'getent hosts registry.npmjs.org > /dev/null 2>&1 && echo RESOLVED || echo no-dns; ' +
        '(exec 3<>/dev/tcp/1.1.1.1/443) 2>/dev/null && echo CONNECTED || echo no-route',
    )
    expect(r.out).toContain('no-dns')
    expect(r.out).toContain('no-route')
  })

  it('inherits none of the host environment', () => {
    process.env.SANDBOX_LEAK_CANARY = 'leaked-secret-value'
    try {
      const r = run('env')
      expect(r.out).not.toContain('leaked-secret-value')
      expect(r.out).not.toContain('SANDBOX_LEAK_CANARY')
      expect(r.out).toContain('STUDIO_SANDBOX=bwrap')
    } finally {
      delete process.env.SANDBOX_LEAK_CANARY
    }
  })

  it('reports a command’s own failure as a command failure, not a broken sandbox', () => {
    const r = run('exit 3')
    expect(r.code).toBe(3)
    expect(explainBwrapFailure(r.out)).toBeNull()
  })
})
