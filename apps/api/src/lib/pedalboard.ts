import { execFile } from 'node:child_process'
import { link, lstat, mkdir, mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { SCRIPTS_DIR } from '../studio/paths.js'

const execFileAsync = promisify(execFile)
const script = path.join(SCRIPTS_DIR, 'audio-effects.py')

async function invoke(params: Record<string, unknown>): Promise<string> {
  try {
    // Isolated Python ignores workspace modules/PYTHONPATH. Arguments are data,
    // never shell code, and the script only constructs built-in effects.
    const { stdout } = await execFileAsync(
      process.env.STUDIO_PYTHON || 'python3',
      ['-I', script, JSON.stringify(params)],
      { timeout: 5 * 60_000, maxBuffer: 1024 * 1024 },
    )
    return stdout.trim()
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      throw new Error('Pedalboard needs host Python; set STUDIO_PYTHON. See docs/installation.md.')
    }
    throw new Error(`Pedalboard failed: ${String(err.stderr || err.message).trim()}`)
  }
}

/** Write atomically, keeping failed/partial renders off the asset shelf. */
export async function runPedalboard(params: Record<string, unknown>): Promise<string> {
  if (params.list === true) return invoke(params)
  const out = String(params.out)
  const existing = await lstat(out).catch((err: NodeJS.ErrnoException) => {
    if (err.code !== 'ENOENT') throw err
    return null
  })
  if (existing) throw new Error('out must be a NEW file; choose a different name')
  await mkdir(path.dirname(out), { recursive: true })
  const tmp = await mkdtemp(path.join(path.dirname(out), '.pedalboard-'))
  try {
    const rendered = path.join(tmp, 'processed.wav')
    const result = await invoke({ ...params, out: rendered })
    // Unlike rename, link refuses to replace an output created during the render.
    await link(rendered, out)
    return result
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
}
