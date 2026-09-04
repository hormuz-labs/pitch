/**
 * Beats: the addressable moments of a rendered video.
 *
 * The launch flow gets its scenes from shots.js and the deck flow from the
 * slides in deck.html. Video flows have no such source — the render is one
 * continuous take — so the renderer records where each narration line landed
 * on the FINAL timeline and writes it next to the .mp4. The studio turns those
 * into a scene strip, which is what makes a video editable by selection:
 * pick the moment, say what should change.
 */
import { readFile, writeFile } from 'node:fs/promises'

export interface Beat {
  /** Seconds on the final video timeline. */
  start: number
  /** How long the clip itself runs (not the beat's share of the timeline). */
  dur: number
  /** What is said/shown — the strip's label and the agent's handle on it. */
  text?: string
  type?: string
}

export interface Timeline {
  durationSec: number
  beats: Beat[]
}

/** A scene as the studio's Description.scenes wants it (flows/types.ts). */
export interface TimelineScene {
  id: string
  index: number
  start: number
  end: number
  dur: number
  label?: string | null
  type?: string | null
}

const TIMELINE_SUFFIX = '.timeline.json'

/** Sidecar path for a render (renders/demo-123.mp4 → renders/demo-123.timeline.json). */
export function timelineFileFor(videoPath: string): string {
  return videoPath.replace(/\.[^.]+$/, '') + TIMELINE_SUFFIX
}

export async function writeTimeline(videoPath: string, timeline: Timeline): Promise<void> {
  await writeFile(timelineFileFor(videoPath), `${JSON.stringify(timeline, null, 2)}\n`, 'utf8')
}

export async function readTimeline(videoPath: string): Promise<Timeline | null> {
  try {
    const parsed = JSON.parse(await readFile(timelineFileFor(videoPath), 'utf8')) as Timeline
    return Array.isArray(parsed?.beats) ? parsed : null
  } catch {
    return null
  }
}

/**
 * Beats → scenes that tile the whole video: each scene runs from its own beat
 * until the next one starts, so clicking anywhere in the strip always lands on
 * something. A gap before the first beat (the intro card) becomes its own scene.
 */
export function scenesFromTimeline(timeline: Timeline | null): TimelineScene[] {
  if (!timeline || timeline.beats.length === 0) return []
  const total = timeline.durationSec
  const sorted = [...timeline.beats].sort((a, b) => a.start - b.start)
  const marks: Array<{ start: number; label?: string; type?: string }> = []
  if (sorted[0]!.start > 0.75) marks.push({ start: 0, label: 'Opening', type: 'card' })
  for (const b of sorted) marks.push({ start: b.start, label: b.text, type: b.type })

  return marks.map((m, i) => {
    const start = Math.max(0, m.start)
    const end = i + 1 < marks.length ? Math.max(start, marks[i + 1]!.start) : Math.max(start, total)
    return {
      id: `beat-${i + 1}`,
      index: i + 1,
      start,
      end,
      dur: end - start,
      label: m.label?.trim() ? m.label.trim() : null,
      type: m.type ?? 'narration',
    }
  })
}

/**
 * One line describing the moment the user selected in the strip, for the
 * agent's <studio-context>. Returns null when the id is not a beat.
 */
export function describeBeat(
  scenes: TimelineScene[],
  sceneId: string | null | undefined,
): string | null {
  if (!sceneId) return null
  const hit = scenes.find(s => s.id === sceneId)
  if (!hit) return null
  const at = `${hit.start.toFixed(1)}s–${hit.end.toFixed(1)}s`
  return hit.label
    ? `moment ${hit.index} of the rendered video (${at}), where the narration says "${hit.label}"`
    : `moment ${hit.index} of the rendered video (${at})`
}
