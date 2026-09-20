import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { launchPersistentContext } from 'cloakbrowser'
import { afterAll, describe, expect, it } from 'vitest'
import { fingerprintSeed } from '../../apps/api/src/render/utils/cloak-browser.js'

const root = await mkdtemp(path.join(os.tmpdir(), 'cloak-direct-'))
const origin = 'https://pitch-cloak-state.test'

async function open(id: string, storageStatePath?: string) {
  const context = await launchPersistentContext({
    userDataDir: path.join(root, id),
    headless: true,
    args: [`--fingerprint=${fingerprintSeed('returning-user')}`],
  })
  if (storageStatePath) await context.setStorageState(storageStatePath)
  const page = context.pages()[0] ?? (await context.newPage())
  await page.route(`${origin}/**`, route =>
    route.fulfill({ contentType: 'text/html', body: '<title>Direct Cloak</title>' }),
  )
  await page.goto(origin)
  return { context, page, close: () => context.close() }
}

afterAll(() => rm(root, { recursive: true, force: true }))

describe.sequential('direct CloakBrowser', () => {
  it('launches the patched Chromium with a stable returning-user fingerprint', async () => {
    expect(fingerprintSeed('returning-user')).toBe(fingerprintSeed('returning-user'))
    const browser = await open('identity')
    expect(await browser.page.evaluate(() => navigator.webdriver)).toBe(false)
    expect(await browser.page.evaluate(() => navigator.plugins.length)).toBeGreaterThan(0)
    expect(await browser.page.title()).toBe('Direct Cloak')
    await browser.close()
  }, 60_000)

  it('moves cookies, localStorage, and IndexedDB into a fresh profile', async () => {
    const stateFile = path.join(root, 'state.json')
    const first = await open('state-one')
    await first.context.addCookies([
      { name: 'pitch-cookie', value: 'saved', domain: 'pitch-cloak-state.test', path: '/' },
    ])
    await first.page.evaluate(async () => {
      localStorage.setItem('pitch-local', 'saved')
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('pitch-db', 1)
        request.onupgradeneeded = () => request.result.createObjectStore('state')
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction('state', 'readwrite')
          tx.objectStore('state').put('saved', 'token')
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        }
      })
    })
    await first.context.storageState({ path: stateFile, indexedDB: true })
    await first.close()
    const second = await open('state-two', stateFile)
    expect(await second.context.cookies(origin)).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'pitch-cookie', value: 'saved' })]),
    )
    expect(await second.page.evaluate(() => localStorage.getItem('pitch-local'))).toBe('saved')
    expect(
      await second.page.evaluate(
        async () =>
          new Promise<string>((resolve, reject) => {
            const request = indexedDB.open('pitch-db')
            request.onerror = () => reject(request.error)
            request.onsuccess = () => {
              const db = request.result
              const get = db.transaction('state').objectStore('state').get('token')
              get.onsuccess = () => {
                db.close()
                resolve(String(get.result))
              }
              get.onerror = () => reject(get.error)
            }
          }),
      ),
    ).toBe('saved')
    await second.close()
  }, 90_000)
})
