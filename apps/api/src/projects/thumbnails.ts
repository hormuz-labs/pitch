/**
 * Project thumbnails: a frame of the live preview (html/deck flows, via a
 * shared headless browser presenting a preview grant cookie) or of the
 * latest render (video flows, via ffmpeg). Cached under <workspace>/.thumbs/.
 */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { createLogger } from '@saas/shared'
import type { Browser } from 'playwright'
import { getAgent } from '../flows/index.js'
import { PREVIEW_COOKIE, previewGrant } from '../lib/preview-auth.js'
import { launchStudioBrowser } from '../render/utils/studio-browser.js'
import { type ProjectRow, workspaceOf } from './rows.js'

const execFileP = promisify(execFile)
const logger = createLogger('studio:thumbnails')

let sharedBrowser: Browser | null = null
let browserPromise: Promise<Browser> | null = null

export async function getBrowser(): Promise<Browser> {
  if (sharedBrowser?.isConnected()) return sharedBrowser
  if (browserPromise) return browserPromise
  browserPromise = (async () => {
    const browser = await launchStudioBrowser()
    browser.on('disconnected', () => {
      sharedBrowser = null
      browserPromise = null
    })
    sharedBrowser = browser
    return browser
  })().finally(() => {
    browserPromise = null
  })
  return browserPromise
}

export async function closeBrowser(): Promise<void> {
  if (sharedBrowser) await sharedBrowser.close().catch(() => {})
}

/**
 * The origin used to load previews through the normal authenticated file route.
 */
export function apiOrigin(): string {
  const port = process.env.PORT || 3000
  return process.env.STUDIO_INTERNAL_ORIGIN || `http://127.0.0.1:${port}`
}

async function newestSourceMtime(dir: string, flow: ReturnType<typeof getAgent>): Promise<number> {
  let newest = 0
  const { readdir } = await import('node:fs/promises')
  const walk = async (d: string, rel: string, depth: number) => {
    if (depth > 3) return
    for (const e of await readdir(d, { withFileTypes: true }).catch(() => [])) {
      if (e.name.startsWith('.')) continue
      const r = rel ? `${rel}/${e.name}` : e.name
      const p = path.join(d, e.name)
      if (e.isDirectory()) await walk(p, r, depth + 1)
      else if (flow.relevant.test(r)) newest = Math.max(newest, (await stat(p)).mtimeMs)
    }
  }
  await walk(dir, '', 0)
  return newest
}

export async function projectThumbnail(p: ProjectRow, t: number): Promise<Buffer | null> {
  const ws = workspaceOf(p)
  const flow = getAgent()
  if (!existsSync(ws.dir)) return null
  const desc = await flow.describe(ws).catch(err => {
    logger.warn({ err, projectId: p.id }, 'describe failed')
    return null
  })
  if (!desc?.preview) return null
  const thumbsDir = path.join(ws.dir, '.thumbs')
  const cacheFile = path.join(
    thumbsDir,
    `${desc.preview.kind}_${t.toFixed(2).replace(/\./g, '_')}.jpg`,
  )
  try {
    if (existsSync(cacheFile)) {
      const thumbStat = await stat(cacheFile)
      if (thumbStat.mtimeMs >= (await newestSourceMtime(ws.dir, flow))) return readFile(cacheFile)
    }
  } catch {
    // fresh capture
  }

  let buf: Buffer | null = null
  try {
    if (desc.preview.kind === 'video') {
      const local = path.join(
        ws.dir,
        decodeURIComponent(desc.preview.url.split(`/${encodeURIComponent(ws.internal)}/`)[1] ?? ''),
      )
      const file = existsSync(local) ? local : desc.preview.url
      const { stdout } = await execFileP(
        'ffmpeg',
        [
          '-ss',
          String(t),
          '-i',
          file,
          '-frames:v',
          '1',
          '-vf',
          'scale=640:-2',
          '-f',
          'image2pipe',
          '-vcodec',
          'mjpeg',
          '-q:v',
          '5',
          'pipe:1',
        ],
        { encoding: 'buffer', maxBuffer: 8 * 1024 * 1024 } as any,
      )
      buf = Buffer.from(stdout as any)
    } else if (desc.preview.kind === 'html' || desc.preview.kind === 'deck') {
      const browser = await getBrowser()
      const origin = new URL(apiOrigin())
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
      try {
        await context.addCookies([
          {
            name: PREVIEW_COOKIE,
            value: previewGrant(p.userId),
            domain: origin.hostname,
            path: '/',
            httpOnly: true,
            secure: false,
            sameSite: 'Lax',
          },
        ])
        const page = await context.newPage()
        await page.goto(`${apiOrigin()}${desc.preview.url}`, {
          waitUntil: 'domcontentloaded',
          timeout: 10000,
        })
        if (desc.preview.kind === 'html') {
          await page
            .waitForFunction(
              "() => window.__READY === true || typeof window.__SEEK === 'function'",
              null,
              { timeout: 8000 },
            )
            .catch(() => {})
          await page.evaluate(`if (typeof window.__SEEK === 'function') window.__SEEK(${t});`)
        } else {
          await page.waitForTimeout(600)
          const slide = Math.max(1, Math.round(t))
          await page.evaluate(
            `(() => { const s = document.querySelectorAll('.slide')[${slide - 1}]; if (s) s.scrollIntoView({ block: 'start' }); })()`,
          )
        }
        await page.waitForTimeout(200)
        buf = await page.screenshot({ type: 'jpeg', quality: 75 })
      } finally {
        await context.close().catch(() => {})
      }
    }
  } catch (err) {
    logger.error({ err, projectId: p.id, t }, 'thumbnail capture failed')
    return null
  }
  if (buf) {
    void mkdir(thumbsDir, { recursive: true })
      .then(() => writeFile(cacheFile, buf!))
      .catch(() => {})
  }
  return buf
}
