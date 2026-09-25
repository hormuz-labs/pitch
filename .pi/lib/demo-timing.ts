import { setTimeout } from 'node:timers/promises'

/** Wait until scheduled speech has finished (or the signal aborts). */
export async function waitForNarration(endTime: number | undefined, signal?: AbortSignal) {
  signal?.throwIfAborted()
  const remaining = (endTime ?? 0) - Date.now()
  if (remaining > 0) await setTimeout(remaining, undefined, { signal })
}
