/**
 * One queue per workspace: a command that reads and rewrites a project's
 * recording state waits for the previous one in the same project, without a
 * slow browser in one project holding up every other project on the worker.
 */
const locks = new Map<string, Promise<void>>()

export async function withWorkspaceLock<T>(workspace: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(workspace) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>(resolve => {
    release = resolve
  })
  const tail = previous.then(() => current)
  locks.set(workspace, tail)
  await previous
  try {
    return await fn()
  } finally {
    release()
    if (locks.get(workspace) === tail) locks.delete(workspace)
  }
}
