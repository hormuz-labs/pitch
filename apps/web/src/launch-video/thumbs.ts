/**
 * Grabs JPEG thumbnails from a video URL at given timestamps.
 * Uses one shared hidden <video>; captures are serialized through a queue.
 * (Ported from the launch-videos studio's thumbs.ts.)
 */

const cache = new Map<string, string | null>()
let queue: Promise<unknown> = Promise.resolve()
let videoEl: HTMLVideoElement | null = null

function getVideo(): HTMLVideoElement {
  if (!videoEl) {
    videoEl = document.createElement('video')
    videoEl.muted = true
    videoEl.preload = 'auto'
  }
  return videoEl
}

const THUMB_W = 320
const THUMB_H = 180

function doCapture(src: string, time: number): Promise<string | null> {
  return new Promise(resolve => {
    const v = getVideo()
    let settled = false
    const finish = (url: string | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      v.removeEventListener('loadedmetadata', onMeta)
      v.removeEventListener('seeked', onSeek)
      v.removeEventListener('error', onError)
      resolve(url)
    }
    const onError = () => finish(null)
    const onMeta = () => {
      const dur = Number.isFinite(v.duration) ? v.duration : time + 1
      v.currentTime = Math.min(Math.max(time, 0), Math.max(dur - 0.05, 0))
    }
    const onSeek = () => {
      try {
        if (!v.videoWidth || !v.videoHeight) return finish(null)
        const canvas = document.createElement('canvas')
        canvas.width = THUMB_W
        canvas.height = THUMB_H
        const ctx = canvas.getContext('2d')
        if (!ctx) return finish(null)
        // cover-fit the frame into 16:9
        const scale = Math.max(THUMB_W / v.videoWidth, THUMB_H / v.videoHeight)
        const w = v.videoWidth * scale
        const h = v.videoHeight * scale
        ctx.drawImage(v, (THUMB_W - w) / 2, (THUMB_H - h) / 2, w, h)
        finish(canvas.toDataURL('image/jpeg', 0.72))
      } catch {
        finish(null)
      }
    }
    const timer = setTimeout(() => finish(null), 10000)

    v.addEventListener('loadedmetadata', onMeta)
    v.addEventListener('seeked', onSeek)
    v.addEventListener('error', onError)
    const abs = new URL(src, location.href).href
    if (v.src === abs && v.readyState >= 1) onMeta()
    else v.src = abs
  })
}

/** Capture a frame at `time` seconds; results are cached per src+time. */
export function captureFrame(src: string, time: number): Promise<string | null> {
  const key = `${src}|${time.toFixed(2)}`
  const hit = cache.get(key)
  if (hit !== undefined) return Promise.resolve(hit)
  const p = queue.then(() => doCapture(src, time))
  queue = p.catch(() => undefined)
  void p.then(url => cache.set(key, url))
  return p
}
