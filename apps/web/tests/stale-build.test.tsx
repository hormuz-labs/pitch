import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  installStaleBuildRecovery,
  isStaleBuildError,
  reloadForNewBuild,
} from '../src/lib/stale-build'

function memoryStorage() {
  const items = new Map<string, string>()
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  }
}

describe('isStaleBuildError', () => {
  it.each([
    'Failed to fetch dynamically imported module: https://trypitch.co/assets/NewProjectView-CR7pGCdu.js',
    'error loading dynamically imported module',
    'Importing a module script failed.',
    'Unable to preload CSS for /assets/index-abc.css',
    "Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of 'text/html'",
  ])('recognises %s', message => {
    expect(isStaleBuildError(new TypeError(message))).toBe(true)
  })

  it('ignores ordinary errors', () => {
    expect(isStaleBuildError(new Error('Cannot read properties of undefined'))).toBe(false)
    expect(isStaleBuildError(undefined)).toBe(false)
  })
})

describe('reloadForNewBuild', () => {
  it('reloads once, then refuses to loop within a minute', () => {
    const storage = memoryStorage()
    const reload = vi.fn()
    expect(reloadForNewBuild({ storage, reload, now: 1_000_000 })).toBe(true)
    expect(reloadForNewBuild({ storage, reload, now: 1_030_000 })).toBe(false)
    expect(reload).toHaveBeenCalledOnce()
  })

  it('reloads again for a later deploy', () => {
    const storage = memoryStorage()
    const reload = vi.fn()
    reloadForNewBuild({ storage, reload, now: 1_000_000 })
    expect(reloadForNewBuild({ storage, reload, now: 1_000_000 + 61_000 })).toBe(true)
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('never reloads without storage to guard against a loop', () => {
    const reload = vi.fn()
    const storage = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {},
    }
    expect(reloadForNewBuild({ storage, reload })).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })
})

describe('installStaleBuildRecovery', () => {
  beforeEach(() => sessionStorage.clear())

  it('cancels Vite’s preload error while the page reloads', () => {
    const target = new EventTarget() as Window
    const reload = vi.spyOn(window.location, 'reload').mockImplementation(() => {})
    installStaleBuildRecovery(target)
    const first = new Event('vite:preloadError', { cancelable: true })
    target.dispatchEvent(first)
    expect(first.defaultPrevented).toBe(true)
    // A second failure right after reloading surfaces instead of looping.
    const second = new Event('vite:preloadError', { cancelable: true })
    target.dispatchEvent(second)
    expect(second.defaultPrevented).toBe(false)
    expect(reload).toHaveBeenCalledOnce()
    reload.mockRestore()
  })
})

describe('vercel.json', () => {
  const config = JSON.parse(readFileSync(resolve(process.cwd(), 'apps/web/vercel.json'), 'utf8'))
  const fallback = config.rewrites.find((r: any) => r.destination === '/index.html')
  const pattern = new RegExp(`^${fallback.source.replace('(.*)', '.*')}$`)

  it('sends app routes to index.html', () => {
    expect(pattern.test('/new')).toBe(true)
    expect(pattern.test('/admin/projects/p1')).toBe(true)
  })

  it('lets a missing chunk 404 instead of answering with HTML', () => {
    expect(pattern.test('/assets/NewProjectView-CR7pGCdu.js')).toBe(false)
  })

  it('caches hashed chunks forever', () => {
    const assets = config.headers.find((h: any) => h.source === '/assets/(.*)')
    expect(assets.headers[0].value).toContain('immutable')
  })
})
