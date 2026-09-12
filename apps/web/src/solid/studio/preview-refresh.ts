/** Refresh credentials for a new artifact, not for an already-loaded media URL. */
export function createPreviewCredential() {
  let snapshot: string | null = null
  let revision: number | undefined
  return (token: string | null, version: number) => {
    if (!token) {
      snapshot = null
      revision = undefined
    } else if (snapshot === null || version !== revision) {
      snapshot = token
      revision = version
    }
    return snapshot
  }
}

/** Coalesce file saves and keep the currently playing artifact mounted until playback pauses. */
export function createPreviewRefresh<T>(options: {
  read: () => Promise<T>
  apply: (value: T, invalidate: boolean) => void
  held: () => boolean
  pending: (value: boolean) => void
  error: (reason: unknown) => void
  delay?: number
}) {
  let revision = 0
  let applied = 0
  let invalidate = false
  let forced = false
  let disposed = false
  let flight: Promise<void> | null = null
  let timer: ReturnType<typeof setTimeout> | undefined

  const flush = (force = false): Promise<void> => {
    if (disposed || applied === revision) return Promise.resolve()
    forced ||= force
    clearTimeout(timer)
    if (flight) return flight
    if (options.held() && !forced) return Promise.resolve()
    const mine = revision
    flight = options
      .read()
      .then(value => {
        if (disposed || mine !== revision || (options.held() && !forced)) return
        const changed = invalidate
        applied = mine
        invalidate = false
        forced = false
        options.pending(false)
        options.apply(value, changed)
      })
      .catch(reason => {
        if (!disposed && mine === revision) {
          forced = false
          options.error(reason)
        }
      })
      .finally(() => {
        flight = null
        if (!disposed && mine !== revision) schedule()
      })
    return flight
  }
  const schedule = () => {
    clearTimeout(timer)
    if (!disposed) timer = setTimeout(() => void flush(), options.delay ?? 250)
  }
  return {
    request(changed = false) {
      if (disposed) return
      revision++
      invalidate ||= changed
      options.pending(true)
      schedule()
    },
    flush,
    resume: schedule,
    dispose() {
      disposed = true
      clearTimeout(timer)
    },
  }
}
