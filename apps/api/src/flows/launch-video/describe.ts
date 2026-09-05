/**
 * Launch-video workspace inspection: the shot list (shots.js is the source
 * of truth; js/timing.js for projects that predate the engine), the live
 * preview, the mixdown and local exports.
 */
import { existsSync } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import type { Description, Output, Scene } from '../../flows/types.js'
import { fileUrl, type Workspace } from '../../studio/paths.js'

export type RenderRes = '720p' | '1080p' | '4k'
export const RENDER_RESES: RenderRes[] = ['720p', '1080p', '4k']
export const renderFile = (res: RenderRes) => `renders/launch-${res}.mp4`

/** Evaluate shots.js as a pure data literal — no DOM, no GSAP. */
export function evalShots(
  src: string,
): { shots?: Array<Record<string, unknown>>; audio?: any } | null {
  new Function('window', `"use strict";\n${src}`)
  const fn = new Function('window', `"use strict";\n${src}\n;return window.SHOTS ?? null;`)
  return fn({}) as any
}

export interface ShotsProbe {
  ok: boolean
  hasIndex: boolean
  scenes: number
  duration: number
  error: string | null
}

export async function probeShots(dir: string): Promise<ShotsProbe> {
  const hasIndex = existsSync(path.join(dir, 'index.html'))
  const shotsPath = path.join(dir, 'shots.js')
  if (!existsSync(shotsPath)) return { ok: hasIndex, hasIndex, scenes: 0, duration: 0, error: null }
  try {
    const spec = evalShots(await readFile(shotsPath, 'utf8'))
    if (!spec || !Array.isArray(spec.shots))
      return {
        ok: false,
        hasIndex,
        scenes: 0,
        duration: 0,
        error: 'shots.js does not set window.SHOTS = { shots: [...] }',
      }
    const duration = spec.shots.reduce((t, s) => t + (Number(s.dur) || 0), 0)
    return { ok: true, hasIndex, scenes: spec.shots.length, duration, error: null }
  } catch (err) {
    const e = err as Error
    return { ok: false, hasIndex, scenes: 0, duration: 0, error: `${e.name}: ${e.message}` }
  }
}

type TimingMap = Record<string, { dur?: number; vo?: string | null; type?: string | null }>

async function readSceneTiming(dir: string): Promise<{ timing: TimingMap; ordered: boolean }> {
  const shotsPath = path.join(dir, 'shots.js')
  if (existsSync(shotsPath)) {
    try {
      const spec = evalShots(await readFile(shotsPath, 'utf8'))
      const out: TimingMap = {}
      ;(spec?.shots ?? []).forEach((s, i) => {
        const id = typeof s.id === 'string' && s.id ? s.id : `shot${i + 1}`
        out[id] = {
          dur: Number(s.dur) || 0,
          vo: typeof s.vo === 'string' ? s.vo : typeof s.cue === 'string' ? s.cue : null,
          type: typeof s.type === 'string' ? s.type : null,
        }
      })
      return { timing: out, ordered: true }
    } catch {
      return { timing: {}, ordered: true }
    }
  }
  const timingPath = path.join(dir, 'js', 'timing.js')
  if (!existsSync(timingPath)) return { timing: {}, ordered: false }
  try {
    const src = await readFile(timingPath, 'utf8')
    const fn = new Function('window', `"use strict";\n${src}\n;return window.SCENE_TIMING ?? {};`)
    return { timing: (fn({}) as TimingMap) ?? {}, ordered: false }
  } catch {
    return { timing: {}, ordered: false }
  }
}

function naturalOrder(a: string, b: string): number {
  const na = Number.parseInt(a.replace(/\D/g, ''), 10)
  const nb = Number.parseInt(b.replace(/\D/g, ''), 10)
  if (Number.isNaN(na) || Number.isNaN(nb)) return a.localeCompare(b)
  return na - nb
}

export async function newestMtime(targets: string[]): Promise<number> {
  let newest = 0
  for (const t of targets) {
    if (!existsSync(t)) continue
    const st = await stat(t)
    if (st.isDirectory())
      newest = Math.max(newest, await newestMtime((await readdir(t)).map(c => path.join(t, c))))
    else newest = Math.max(newest, st.mtimeMs)
  }
  return newest
}

export const sourceTargets = (dir: string) =>
  ['index.html', 'shots.js', 'js', 'css', 'audio/mix.wav'].map(f => path.join(dir, f))

export async function describeLaunch(
  ws: Workspace,
): Promise<
  Description & { renders: Array<{ res: RenderRes; url: string; stale: boolean; bytes: number }> }
> {
  const dir = ws.dir
  const outputs: Output[] = []
  const renders: Array<{ res: RenderRes; url: string; stale: boolean; bytes: number }> = []
  const localRenders = path.join(dir, 'renders')
  if (existsSync(localRenders)) {
    const sourcesAt = await newestMtime(sourceTargets(dir))
    for (const res of RENDER_RESES) {
      const file = path.join(dir, renderFile(res))
      if (!existsSync(file)) continue
      const st = await stat(file)
      const url = fileUrl(ws.internal, renderFile(res))
      renders.push({ res, url, stale: sourcesAt > st.mtimeMs, bytes: st.size })
      outputs.push({
        kind: 'video',
        url,
        res,
        label: `Launch ${res}`,
        createdAt: st.mtime.toISOString(),
      })
    }
  }
  const probe = await probeShots(dir)
  const preview = probe.hasIndex
    ? ({ kind: 'html', url: fileUrl(ws.internal, 'index.html') } as const)
    : null

  let audioUrl: string | null = null
  const audioDir = path.join(dir, 'audio')
  if (existsSync(audioDir)) {
    const files = await readdir(audioDir).catch(() => [] as string[])
    if (files.includes('mix.wav')) audioUrl = fileUrl(ws.internal, 'audio/mix.wav')
    else {
      const pick = files.find(f => /\.(wav|mp3|m4a|aac|ogg)$/i.test(f) && !f.startsWith('.'))
      if (pick) audioUrl = fileUrl(ws.internal, `audio/${pick}`)
    }
  }

  const { timing, ordered } = await readSceneTiming(dir)
  const ids = ordered ? Object.keys(timing) : Object.keys(timing).sort(naturalOrder)
  const scenes: Scene[] = []
  let t = 0
  ids.forEach((id, i) => {
    const dur = Number(timing[id]?.dur) || 0
    scenes.push({
      id,
      index: i + 1,
      start: t,
      end: t + dur,
      dur,
      label: timing[id]?.vo ?? null,
      type: timing[id]?.type ?? null,
    })
    t += dur
  })
  return {
    preview,
    audioUrl,
    scenes,
    duration: t,
    outputs,
    error: probe.error,
    renders,
    extra: { renders },
  }
}
