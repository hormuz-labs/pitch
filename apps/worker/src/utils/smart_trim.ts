import { exec } from 'child_process'
import fs from 'fs'
import path from 'path'
import { promisify } from 'util'

const execAsync = promisify(exec)

async function getDuration(file: string): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${file}"`,
    )
    return parseFloat(stdout.trim())
  } catch (_e) {
    return 0
  }
}

async function getAudioDuration(file: string): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries stream=duration -select_streams a:0 -of default=noprint_wrappers=1:nokey=1 "${file}"`,
    )
    return parseFloat(stdout.trim())
  } catch (_e) {
    return 0
  }
}

interface Segment {
  start: number
  end: number
}

interface ClickEvent {
  videoTimeSec: number
  x: number
  y: number
}

interface ZoomInEvent {
  type: 'in'
  videoTimeSec: number
  x: number
  y: number
  zoom: number
}

interface ZoomOutEvent {
  type: 'out'
  videoTimeSec: number
}

type ZoomEvent = ZoomInEvent | ZoomOutEvent

function mergeSegments(segments: Segment[]): Segment[] {
  const sorted = [...segments].sort((a, b) => a.start - b.start)
  const merged: Segment[] = []
  for (const seg of sorted) {
    const last = merged[merged.length - 1]
    if (!last) {
      merged.push(seg)
    } else if (seg.start <= last.end + 0.1) {
      last.end = Math.max(last.end, seg.end)
    } else {
      merged.push(seg)
    }
  }
  return merged
}

function getIntersections(a: Segment[], b: Segment[]): Segment[] {
  const intersections: Segment[] = []
  for (const segA of a) {
    for (const segB of b) {
      const start = Math.max(segA.start, segB.start)
      const end = Math.min(segA.end, segB.end)
      if (start < end) {
        intersections.push({ start, end })
      }
    }
  }

  return mergeSegments(intersections)
}

function getDifference(a: Segment[], b: Segment[]): Segment[] {
  const mergedB = mergeSegments(b)
  const diff: Segment[] = []
  for (const segA of a) {
    let fragments = [segA]
    for (const segB of mergedB) {
      const next: Segment[] = []
      for (const frag of fragments) {
        if (frag.end <= segB.start || frag.start >= segB.end) {
          next.push(frag)
        } else {
          if (frag.start < segB.start) {
            next.push({ start: frag.start, end: segB.start })
          }
          if (frag.end > segB.end) {
            next.push({ start: segB.end, end: frag.end })
          }
        }
      }
      fragments = next
    }
    diff.push(...fragments)
  }
  return mergeSegments(diff)
}

function loadClickEvents(input: string): ClickEvent[] {
  const statePath = path.join(path.dirname(input), 'demo-state.json')
  try {
    const raw = fs.readFileSync(statePath, 'utf-8')
    const state = JSON.parse(raw)
    return Array.isArray(state.clickEvents) ? state.clickEvents : []
  } catch {
    return []
  }
}

function loadZoomEvents(input: string): ZoomEvent[] {
  const statePath = path.join(path.dirname(input), 'demo-state.json')
  try {
    const raw = fs.readFileSync(statePath, 'utf-8')
    const state = JSON.parse(raw)
    return Array.isArray(state.zoomEvents) ? state.zoomEvents : []
  } catch {
    return []
  }
}

export async function processVideo(input: string, output: string, detectionInput?: string) {
  const analyzeInput = detectionInput || input

  const clickEvents = loadClickEvents(analyzeInput)
  if (clickEvents.length > 0) {
    console.log(`Found ${clickEvents.length} click event(s) to protect during trimming.`)
  }

  const zoomEvents = loadZoomEvents(analyzeInput)
  if (zoomEvents.length > 0) {
    console.log(`Found ${zoomEvents.length} zoom event(s) to protect during trimming.`)
  }

  console.log('Analyzing audio silence...')
  const { stdout: silenceLog } = await execAsync(
    `ffmpeg -i "${analyzeInput}" -af silencedetect=noise=-50dB:d=0.8 -f null - 2>&1`,
    { maxBuffer: 1024 * 1024 * 100 },
  )

  const silences: Segment[] = []
  const silenceStarts = [...silenceLog.matchAll(/silence_start:\s+([\d.]+)/g)].map(m =>
    parseFloat(m[1]!),
  )
  const silenceEnds = [...silenceLog.matchAll(/silence_end:\s+([\d.]+)/g)].map(m =>
    parseFloat(m[1]!),
  )
  for (let i = 0; i < silenceStarts.length; i++) {
    silences.push({ start: silenceStarts[i]!, end: silenceEnds[i] ?? 999999 })
  }

  console.log('Analyzing video freezes (static screen)...')
  // Run freeze detection on the processed video — during zoom hold phases frames
  // are stable so freezes are detectable. d=1.0 catches short 1s+ static pauses.
  // n=0.05 noise tolerance accounts for compression artifacts.
  const { stdout: freezeLog } = await execAsync(
    `ffmpeg -i "${analyzeInput}" -vf freezedetect=n=0.05:d=1.0 -f null - 2>&1`,
    { maxBuffer: 1024 * 1024 * 100 },
  )

  const freezes: Segment[] = []
  const freezeStarts = [...freezeLog.matchAll(/freeze_start:\s+([\d.]+)/g)].map(m =>
    parseFloat(m[1]!),
  )
  const freezeEnds = [...freezeLog.matchAll(/freeze_end:\s+([\d.]+)/g)].map(m => parseFloat(m[1]!))
  for (let i = 0; i < freezeStarts.length; i++) {
    freezes.push({ start: freezeStarts[i]!, end: freezeEnds[i] ?? 999999 })
  }

  console.log(
    `Found ${silences.length} silence segment(s) and ${freezes.length} freeze segment(s).`,
  )

  const duration = await getDuration(analyzeInput)
  if (!duration) throw new Error('Could not determine video duration')

  const audioDuration = await getAudioDuration(analyzeInput)
  if (audioDuration > 0 && audioDuration < duration - 0.5) {
    console.log(
      `Audio stream ends early at ${audioDuration.toFixed(2)}s (video is ${duration.toFixed(2)}s). Adding trailing silence.`,
    )
    silences.push({ start: audioDuration, end: duration })
  } else if (audioDuration === 0) {
    console.log(
      'No audio track detected — treating entire video as silent for freeze-based trimming.',
    )
    silences.push({ start: 0, end: duration })
  }

  silences.forEach(s => {
    s.end = Math.min(s.end, duration)
  })
  freezes.forEach(f => {
    f.end = Math.min(f.end, duration)
  })

  const dropSegments: Segment[] = []

  // 1. Segments where the screen is BOTH frozen AND silent — always drop these.
  dropSegments.push(...getIntersections(silences, freezes))

  // 2. Pure silence segments (not covered by a freeze) that are long enough
  //    are also dead air — the screen may have minor visual changes (loading
  //    animations, zoom holds, rendering) that prevent the freeze detector
  //    from firing, but without narration the viewer sees nothing meaningful.
  const PURE_SILENCE_MIN_SEC = 1.5
  const pureSilence = getDifference(silences, freezes)
  for (const seg of pureSilence) {
    if (seg.end - seg.start >= PURE_SILENCE_MIN_SEC) {
      console.log(
        `Pure silence segment (${seg.start.toFixed(2)}s → ${seg.end.toFixed(2)}s, ${(seg.end - seg.start).toFixed(2)}s) without freeze — adding as drop.`,
      )
      dropSegments.push(seg)
    }
  }

  // 3. Force-trim initial silence even without a corresponding freeze.
  // When the page is loading (animations, rendering) the freeze detector won't
  // fire, so the opening dead-air is never removed.  If the first silence
  // starts at the very beginning we add it as an extra drop segment so the
  // trimmed video starts when actual content (audio or motion) begins.
  const firstSilence = mergeSegments(silences).find(s => s.start <= 0.15)
  if (firstSilence && firstSilence.end > 0.6 && firstSilence.end < duration - 0.5) {
    const coveredByFreeze = freezes.some(f => f.start <= 0.15 && f.end >= firstSilence.end - 0.1)
    if (!coveredByFreeze) {
      console.log(
        `Initial silence detected (0 → ${firstSilence.end.toFixed(2)}s) without freeze — adding as extra drop segment.`,
      )
      dropSegments.push({ start: 0, end: firstSilence.end })
    }
  }

  // Force-trim the initial freeze even when voiceover has started.
  // A blank/loading screen that hasn't rendered meaningful content yet is
  // useless even with voiceover — the viewer sees nothing.  If there's a
  // freeze starting at t≈0, extend the initial drop to cover it entirely.
  const initialFreeze = freezes.find(f => f.start <= 0.15)
  if (initialFreeze && initialFreeze.end > 1 && initialFreeze.end < duration - 0.5) {
    const mergedDrop = mergeSegments(dropSegments)
    const coveredTo = mergedDrop.find(d => d.start <= 0.15)?.end ?? 0
    if (initialFreeze.end > coveredTo + 0.5) {
      console.log(
        `Initial freeze extends to ${initialFreeze.end.toFixed(2)}s (beyond current drop at ${coveredTo.toFixed(2)}s) — extending drop to remove blank loading screen.`,
      )
      dropSegments.push({ start: 0, end: initialFreeze.end })
    }
  }

  console.log(
    `Found ${dropSegments.length} raw dead-air segment(s) (incl. pure silence + intersections).`,
  )

  // Shrink drop segments to leave breathing room on both sides of the kept segments
  // to prevent cutting into the tail of voiceover audio.  Don't add left padding
  // at the very start or right padding at the very end — there's nothing to preserve
  // there, and we want the video to start/end at actual content.
  const breathingRoom = 0.15
  const adjustedDropSegments: Segment[] = []
  for (const drop of mergeSegments(dropSegments)) {
    const leftPad = drop.start > 0 ? breathingRoom : 0
    const rightPad = drop.end < duration ? breathingRoom : 0
    if (drop.end - drop.start > leftPad + rightPad) {
      adjustedDropSegments.push({
        start: drop.start + leftPad,
        end: drop.end - rightPad,
      })
    }
  }
  adjustedDropSegments.sort((a, b) => a.start - b.start)
  console.log(
    `After leaving ${breathingRoom}s breathing room, we have ${adjustedDropSegments.length} segment(s) to trim.`,
  )

  // Invert to get the segments we KEEP.
  const keepSegments: Segment[] = []
  let cursor = 0
  for (const drop of adjustedDropSegments) {
    if (drop.start - cursor > 0.1) keepSegments.push({ start: cursor, end: drop.start })
    cursor = drop.end
  }
  if (duration - cursor > 0.1) keepSegments.push({ start: cursor, end: duration })

  if (keepSegments.length === 0) {
    console.log('Entire video is dead air — copying original.')
    fs.copyFileSync(input, output)
    return
  }

  // Protect a window around each click event so the cursor overlay remains visible.
  const clickProtected: Segment[] = clickEvents.map(c => ({
    start: Math.max(0, c.videoTimeSec - 0.5),
    end: Math.min(duration, c.videoTimeSec + 1.5),
  }))

  // Protect only the zoom ramp transitions, NOT the hold.  The hold can be
  // long and static — that should still be trimmed.  We just need to make
  // sure the zoom-in animation leading into the hold and the zoom-out
  // animation leading out of it are never truncated.
  const ZOOM_RAMP = 0.375
  const ZOOM_PAD = 0.15
  const zoomProtected: Segment[] = []
  for (let i = 0; i < zoomEvents.length; i++) {
    const ev = zoomEvents[i]!
    if (ev.type === 'in') {
      zoomProtected.push({
        start: Math.max(0, ev.videoTimeSec - ZOOM_RAMP - ZOOM_PAD),
        end: Math.min(duration, ev.videoTimeSec + ZOOM_PAD),
      })
    } else if (ev.type === 'out') {
      zoomProtected.push({
        start: Math.max(0, ev.videoTimeSec - ZOOM_PAD),
        end: Math.min(duration, ev.videoTimeSec + ZOOM_RAMP + ZOOM_PAD),
      })
    }
  }

  const finalKeepSegments = mergeSegments([...keepSegments, ...clickProtected, ...zoomProtected])

  console.log(
    `Keeping ${finalKeepSegments.length} segment(s), trimming ${dropSegments.length} gap(s).`,
  )

  // ── FFmpeg 8.x compatible approach ────────────────────────────────────────
  const dir = path.dirname(output)
  const stamp = Date.now()
  const tmpSegs: string[] = []
  let listFile: string | null = null

  try {
    for (let i = 0; i < finalKeepSegments.length; i++) {
      const seg = finalKeepSegments[i]!
      const dur = (seg.end - seg.start).toFixed(6)
      const segFile = path.join(dir, `__trim_${stamp}_${i}.mp4`)
      console.log(
        `  Segment ${i + 1}/${finalKeepSegments.length}: ${seg.start.toFixed(3)}s → ${seg.end.toFixed(3)}s (${dur}s)`,
      )
      await execAsync(
        `ffmpeg -y -ss ${seg.start.toFixed(6)} -i "${input}" ` +
          `-t ${dur} ` +
          `-c:v libx264 -crf 18 -preset fast -pix_fmt yuv420p ` +
          `-c:a aac -ar 24000 -ac 1 ` +
          `"${segFile}"`,
      )
      tmpSegs.push(segFile)
    }

    if (tmpSegs.length === 1) {
      // Single keep segment — just move the file into place.
      fs.renameSync(tmpSegs[0]!, output)
      tmpSegs.length = 0 // prevent double-delete in finally
    } else {
      // Multiple segments — join with the concat demuxer (no re-encode).
      listFile = path.join(dir, `__trim_${stamp}_list.txt`)
      // Concat demuxer resolves paths relative to the list file directory, so use
      // just the segment filename, not a path containing dir/ again.
      fs.writeFileSync(listFile, tmpSegs.map(f => `file '${path.basename(f)}'`).join('\n'))
      console.log('Concatenating segments...')
      await execAsync(`ffmpeg -y -f concat -safe 0 -i "${listFile}" -c copy "${output}"`)
    }

    console.log(`Done! Smart-trimmed video saved to ${output}`)
  } finally {
    for (const f of tmpSegs) {
      try {
        fs.unlinkSync(f)
      } catch {}
    }
    if (listFile) {
      try {
        fs.unlinkSync(listFile)
      } catch {}
    }
  }
}
