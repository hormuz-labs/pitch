import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const engine = fileURLToPath(new URL('./engine.py', import.meta.url))

/** One isolated process group: cancelling an action also stops its FFmpeg children. */
export function runVideoEditing(
  root: string,
  action: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<string> {
  signal?.throwIfAborted()
  return new Promise((resolve, reject) => {
    const child = spawn('python3', ['-I', engine, action, '--root', root], {
      cwd: root,
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let failure: Error | undefined
    const stop = (error: Error) => {
      failure ??= error
      if (child.pid) {
        try {
          process.kill(-child.pid, 'SIGKILL')
        } catch {
          // The process may have exited between the signal and this callback.
        }
      }
    }
    const abort = () => stop(new Error('Video editing cancelled'))
    const timeout = setTimeout(() => stop(new Error('Video editing timed out')), 60 * 60_000)
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
    const cleanup = () => {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abort)
    }
    child.stdout.on('data', data => {
      stdout += data.toString()
      if (stdout.length > 8 * 1024 * 1024) stop(new Error('Video editing report exceeds 8 MiB'))
    })
    child.stderr.on('data', data => {
      stderr = (stderr + data.toString()).slice(-16_000)
    })
    child.on('error', error => {
      cleanup()
      reject(error)
    })
    child.on('close', code => {
      cleanup()
      if (failure) return reject(failure)
      try {
        const result = JSON.parse(stdout)
        if (code !== 0 || result.error)
          return reject(new Error(result.error || stderr || `Video editor exited ${code}`))
        resolve(JSON.stringify(result))
      } catch (error) {
        reject(new Error(`Invalid video editing report: ${stderr || String(error)}`))
      }
    })
    child.stdin.on('error', error => stop(error))
    child.stdin.end(JSON.stringify(args))
  })
}
