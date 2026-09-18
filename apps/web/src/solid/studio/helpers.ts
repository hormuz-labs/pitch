import type { Entry, Target } from './types'
export const fmt = (t: number) => {
  const m = Math.floor(t / 60)
  const s = (t % 60).toFixed(1).padStart(4, '0')
  return m ? `${m}:${s}` : `${s}s`
}

export function timelineRulerTicks(duration: number, width: number): number[] {
  if (!Number.isFinite(duration) || duration <= 0) return [0]
  const intervals = Math.max(2, Math.floor(Math.max(240, width) / 110))
  const roughStep = duration / intervals
  const magnitude = 10 ** Math.floor(Math.log10(roughStep))
  const normalized = roughStep / magnitude
  const niceStep =
    (normalized < Math.sqrt(2)
      ? 1
      : normalized < Math.sqrt(10)
        ? 2
        : normalized < Math.sqrt(50)
          ? 5
          : 10) * magnitude
  const ticks = Array.from({ length: Math.floor(duration / niceStep) + 1 }, (_, index) =>
    Number((index * niceStep).toFixed(10)),
  )
  if (duration - ticks.at(-1)! > niceStep * 0.2) ticks.push(duration)
  else ticks[ticks.length - 1] = duration
  return ticks
}

export function fmtRulerTick(t: number, duration: number): string {
  if (duration < 10)
    return `${t.toFixed(t < 1 || Math.abs(t * 10 - Math.round(t * 10)) > 0.001 ? 2 : 1)}s`
  return fmt(t)
}
export function withTargetLegend(text: string, list: Target[]): string {
  if (!list.length) return text
  const lines = list.map(t => {
    if (t.asset)
      return [
        t.page ? `[${t.ref}] page ${t.page} of ${t.asset}` : `[${t.ref}] the file ${t.asset}`,
        t.text ? `"${t.text}"` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    if (typeof t.time === 'number')
      return [
        `[${t.ref}] ${typeof t.endTime === 'number' && t.endTime > t.time ? `the range ${t.time.toFixed(1)}s–${t.endTime.toFixed(1)}s (${(t.endTime - t.time).toFixed(1)}s long)` : `the moment at ${t.time.toFixed(1)}s`}`,
        t.sceneId ? `in ${t.sceneId}` : null,
        t.text ? `"${t.text}"` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    const attrs = (t.className ? ` class="${t.className}"` : '') + (t.id ? ` id="${t.id}"` : '')
    return [
      `[${t.ref}] <${t.tagName}${attrs}>`,
      t.sceneId
        ? `in ${t.slide ? `slide ${t.slide}` : `scene ${t.sceneId}`}${t.shotType ? ` (type ${t.shotType})` : ''}`
        : 'in the active view',
      t.text ? `text "${t.text}"` : null,
      `selector: ${t.selector}`,
    ]
      .filter(Boolean)
      .join(' · ')
  })
  return `Target elements (referenced below as [n]):\n${lines.join('\n')}\n\n${text}`
}
const phase = (name: string) =>
  (
    ({
      motion_render: 'Rendering the video…',
      demo_render: 'Rendering the video…',
      edit_render: 'Rendering the video…',
      demo_record_start: 'Opening the browser…',
      demo_narrate: 'Narrating…',
      pdf_build: 'Building slides…',
      deck_render: 'Building slides…',
      deck_publish: 'Publishing the deck…',
      transcribe_video: 'Studying the recording…',
      write: 'Writing…',
      edit: 'Writing…',
      bash: 'Working in the studio…',
    }) as Record<string, string>
  )[name] ?? 'Thinking…'
export function buildStatus(entries: Entry[], note: string | null): string {
  if (note) return `preview is not loading yet — ${note}`
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]
    if (e.role === 'question') return 'waiting for your answer…'
    if (e.role === 'tool' && e.tool?.status === 'running') return phase(e.tool.name)
    if (e.role === 'assistant' && e.text.trim())
      return e.text.trim().split('\n').filter(Boolean).at(-1)!.replace(/\*\*/g, '').slice(0, 120)
  }
  return 'Warming up…'
}
export function timelineFollowScrollLeft(
  contentX: number,
  scrollLeft: number,
  viewportWidth: number,
  scrollWidth: number,
  leadingInset: number,
  playing: boolean,
): number | null {
  if (viewportWidth <= 0 || scrollWidth <= viewportWidth) return null
  const usable = Math.max(1, viewportWidth - leadingInset),
    x = contentX - scrollLeft,
    left = leadingInset + Math.min(72, usable * 0.14),
    right = viewportWidth - Math.min(88, usable * 0.16)
  if (x >= left && x <= right) return null
  return Math.min(
    Math.max(0, scrollWidth - viewportWidth),
    Math.max(0, contentX - (playing ? leadingInset + usable * 0.64 : leadingInset + usable * 0.5)),
  )
}
