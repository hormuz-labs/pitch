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

export async function processVideo(input: string, output: string) {
  const clickEvents = loadClickEvents(input)
  if (clickEvents.length > 0) {
    console.log(`Found ${clickEvents.length} click event(s) to protect during trimming.`)
  }

  console.log('Analyzing audio silence...')
  const { stdout: silenceLog } = await execAsync(
    `ffmpeg -i "${input}" -af silencedetect=noise=-40dB:d=0.5 -f null - 2>&1`,
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
  // Use a 2.0s freeze threshold so short post-fill/type visibility pauses (1.5s)
  // are not classified as dead air and are preserved in the final video.
  const { stdout: freezeLog } = await execAsync(
    `ffmpeg -i "${input}" -vf freezedetect=n=0.01:d=2.0 -f null - 2>&1`,
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

  const duration = await getDuration(input)
  if (!duration) throw new Error('Could not determine video duration')

  const audioDuration = await getAudioDuration(input)
  if (audioDuration > 0 && audioDuration < duration - 0.5) {
    console.log(
      `Audio stream ends early at ${audioDuration.toFixed(2)}s (video is ${duration.toFixed(2)}s). Adding trailing silence.`,
    )
    silences.push({ start: audioDuration, end: duration })
  }

  silences.forEach(s => {
    s.end = Math.min(s.end, duration)
  })
  freezes.forEach(f => {
    f.end = Math.min(f.end, duration)
  })

  // Segments where the screen is BOTH frozen AND silent — drop these.
  const dropSegments = getIntersections(silences, freezes)

  // Force-trim initial silence even without a corresponding freeze.
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

  console.log(
    `Found ${dropSegments.length} raw dead-air segment(s) of both silence and freeze (incl. initial silence).`,
  )

  // Shrink drop segments to leave at least 0.05 seconds (50ms) of breathing room on both sides of the kept segments.
  const breathingRoom = 0.05
  const adjustedDropSegments: Segment[] = []
  for (const drop of dropSegments) {
    if (drop.end - drop.start > breathingRoom * 2) {
      adjustedDropSegments.push({
        start: drop.start + breathingRoom,
        end: drop.end - breathingRoom,
      })
    }
  }
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
  const finalKeepSegments = mergeSegments([...keepSegments, ...clickProtected])

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
