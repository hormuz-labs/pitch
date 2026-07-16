export interface NarratedEmphasisCallbacks<Emphasis, Narration> {
  emphasize: () => Promise<Emphasis>
  narrate: () => Promise<Narration>
}

export interface NarratedEmphasisResult<Emphasis, Narration> {
  emphasis: Emphasis | null
  emphasisError: string | null
  narration: Narration
}

export interface PendingNarrationEmphasis<Emphasis> {
  slideIndex: number
  emphasis: Emphasis
}

/** Explicit agent input wins; otherwise consume fresh grounding for this slide only. */
export function resolveNarrationEmphasis<Emphasis>(
  explicit: Emphasis | undefined,
  pending: PendingNarrationEmphasis<Emphasis> | null,
  currentSlide: number | undefined,
): Emphasis | undefined {
  if (explicit !== undefined) return explicit
  if (pending && pending.slideIndex === currentSlide) return pending.emphasis
  return undefined
}

/** A concrete rectangle is authoritative; target refs are only a fallback. */
export function chooseNarratedEmphasisSource<Rect>(source: { target?: string; rect?: Rect }): {
  target: string | undefined
  rect: Rect | undefined
} {
  if (source.rect !== undefined) return { target: undefined, rect: source.rect }
  return { target: source.target, rect: undefined }
}

/**
 * Keep visual emphasis and its voiceover in one ordered beat. Emphasis is
 * optional presentation: if it fails, narration still proceeds.
 */
export async function runNarratedEmphasisBeat<Emphasis, Narration>(
  callbacks: NarratedEmphasisCallbacks<Emphasis, Narration>,
): Promise<NarratedEmphasisResult<Emphasis, Narration>> {
  let emphasis: Emphasis | null = null
  let emphasisError: string | null = null
  try {
    emphasis = await callbacks.emphasize()
  } catch (error) {
    emphasisError = error instanceof Error ? error.message : String(error)
  }
  const narration = await callbacks.narrate()
  return { emphasis, emphasisError, narration }
}
