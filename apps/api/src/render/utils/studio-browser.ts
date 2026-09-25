import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { type Browser, type BrowserContext, chromium, type Page } from 'playwright'
import { contentTypeFor } from '../../../../../.pi/lib/mime.ts'

export const STUDIO_LOCAL_ORIGIN = 'http://studio.local'

export { contentTypeFor }

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
