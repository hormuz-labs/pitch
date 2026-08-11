import type { PhaseUpdate } from '../types'

/** Ordered launch-video pipeline plus conservative duration estimates used
 * only to keep the displayed bar moving between authoritative worker events. */
export const LAUNCH_VIDEO_PHASES = [
  { key: 'workspace_init', label: 'Setting up workspace', weight: 5, estimateMs: 15_000 },
  { key: 'processing', label: 'Reading your prompt', weight: 5, estimateMs: 30_000 },
  { key: 'recon', label: 'Researching the product', weight: 10, estimateMs: 120_000 },
  { key: 'planning', label: 'Planning creative direction', weight: 10, estimateMs: 120_000 },
  { key: 'voiceover', label: 'Recording voiceover', weight: 20, estimateMs: 180_000 },
  { key: 'building', label: 'Building scenes', weight: 25, estimateMs: 360_000 },
  { key: 'mixing', label: 'Mixing audio', weight: 10, estimateMs: 120_000 },
  { key: 'rendering', label: 'Rendering video', weight: 15, estimateMs: 300_000 },
] as const

type ProgressPhase = Pick<PhaseUpdate, 'phase' | 'status' | 'startedAt'>

/**
 * Combine authoritative backend progress with a conservative estimate for the
 * current running phase. The estimate approaches 90% of that phase and never
 * reports 100%, so only a real backend completion can finish the bar.
 */
export function calculateLaunchVideoProgress(
  phases: ProgressPhase[],
  backendProgress: number,
  nowMs = Date.now(),
): number {
  const reported = Math.min(100, Math.max(0, backendProgress))
  if (reported >= 100) return 100

  const byKey = new Map(phases.map(phase => [phase.phase, phase]))
  let runningIndex = -1
  for (let index = 0; index < LAUNCH_VIDEO_PHASES.length; index++) {
    if (byKey.get(LAUNCH_VIDEO_PHASES[index].key)?.status === 'running') runningIndex = index
  }
  if (runningIndex < 0) return Math.min(99, reported)

  const runningDefinition = LAUNCH_VIDEO_PHASES[runningIndex]
  const runningPhase = byKey.get(runningDefinition.key)
  const parsedStart = runningPhase?.startedAt ? Date.parse(runningPhase.startedAt) : nowMs
  const startMs = Number.isFinite(parsedStart) ? parsedStart : nowMs
  const elapsedMs = Math.max(0, nowMs - startMs)

  const priorWeight = LAUNCH_VIDEO_PHASES.slice(0, runningIndex).reduce(
    (sum, phase) => sum + phase.weight,
    0,
  )
  const phaseFraction = Math.min(
    0.9,
    0.08 + 0.82 * (1 - Math.exp(-elapsedMs / runningDefinition.estimateMs)),
  )
  const estimated = Math.ceil(priorWeight + runningDefinition.weight * phaseFraction)

  return Math.min(99, Math.max(reported, estimated))
}
