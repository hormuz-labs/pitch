import { setTimeout } from 'node:timers/promises'

/** Speech occupies the capture timeline without holding the browser tool lock. */
export async function waitForNarration(endTime: number | undefined, signal?: AbortSignal) {
  signal?.throwIfAborted()
  const remaining = (endTime ?? 0) - Date.now()
  if (remaining > 0) await setTimeout(remaining, undefined, { signal })
}

export function assertBrowserCommandSucceeded(result: { stdout: string; stderr: string }) {
  // playwright-cli can report a failed action with exit code zero.
  if (/^### Error\b/m.test(result.stdout) || /browser .* is not open/i.test(result.stdout)) {
    throw new Error(`${result.stdout}\n${result.stderr}`.trim())
  }
  return result
}
