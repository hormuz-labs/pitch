/**
 * Retry pacing for background work that keeps failing — a checkpoint loop
 * whose storage credentials were rejected, say. Each failure in a row
 * doubles the wait before the next attempt, up to a cap; a success starts
 * over. It also remembers what the last failure said, so the caller can log
 * a new failure loudly and the same one again quietly.
 */
export class Backoff {
  failures = 0
  retryAt = 0
  private said: string | null = null

  constructor(
    private readonly baseMs = 10_000,
    private readonly maxMs = 5 * 60_000,
  ) {}

  /** Still inside the wait after the last failure. */
  waiting(now = Date.now()): boolean {
    return now < this.retryAt
  }

  /** Count a failure and push the next attempt out. `repeat`: it said what the last one did. */
  fail(err: unknown, now = Date.now()): { repeat: boolean; delayMs: number } {
    const said = summary(err)
    const repeat = said === this.said
    this.said = said
    this.failures++
    const delayMs = Math.min(this.maxMs, this.baseMs * 2 ** (this.failures - 1))
    this.retryAt = now + delayMs
    return { repeat, delayMs }
  }

  /** Forget the failures; returns how many in a row this success ends. */
  succeed(): number {
    const ended = this.failures
    this.failures = 0
    this.retryAt = 0
    this.said = null
    return ended
  }
}

/** What an error says, numbers blanked so a timing or a byte count does not make it new. */
function summary(err: unknown): string {
  const e = err as { code?: unknown; message?: unknown } | null
  return `${e?.code ?? ''} ${e?.message ?? String(err)}`.replace(/\d+/g, '#')
}
