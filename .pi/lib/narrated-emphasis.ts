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
