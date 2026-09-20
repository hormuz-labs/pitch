import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { type Browser, type BrowserContext, chromium, type Page } from 'playwright'

export const STUDIO_LOCAL_ORIGIN = 'http://studio.local'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
}

export function contentTypeFor(filePath: string): string {
  return MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream'
}

export function localPageUrl(filePath: string, query = ''): string {
  const abs = path.resolve(filePath)
  const suffix = query ? (query.startsWith('?') ? query : `?${query}`) : ''
  return `${STUDIO_LOCAL_ORIGIN}${abs.split('/').map(encodeURIComponent).join('/')}${suffix}`
}

export function localPathFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (`${parsed.protocol}//${parsed.host}` !== STUDIO_LOCAL_ORIGIN) return null
    const filePath = decodeURIComponent(parsed.pathname)
    return filePath.startsWith('/') ? filePath : null
  } catch {
    return null
  }
}

export async function serveLocalFiles(target: BrowserContext | Page): Promise<void> {
  await target.route(`${STUDIO_LOCAL_ORIGIN}/**`, async route => {
    const filePath = localPathFromUrl(route.request().url())
    if (filePath === null) return route.continue()
    try {
      await route.fulfill({
        status: 200,
        contentType: contentTypeFor(filePath),
        body: await readFile(filePath),
      })
    } catch (error) {
      await route.fulfill({
        status: (error as NodeJS.ErrnoException).code === 'ENOENT' ? 404 : 500,
        contentType: 'text/plain; charset=utf-8',
        body: `${(error as NodeJS.ErrnoException).code ?? 'ERROR'} ${filePath}`,
      })
    }
  })
}

export function launchStudioBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: true,
    timeout: Number(process.env.BROWSER_START_TIMEOUT_MS || 60_000),
  })
}
