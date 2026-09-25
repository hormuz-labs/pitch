import { render, waitFor } from '@solidjs/testing-library'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const fn = () => vi.fn(async () => ({}))
  return {
    getToken: vi.fn(async () => 'tok'),
    // The owner's client: in admin mode NOTHING may reach it.
    studio: {
      models: fn(),
      music: fn(),
      get: fn(),
      patch: fn(),
      remove: fn(),
      prompt: fn(),
      rollback: fn(),
      stop: fn(),
      steerQueued: fn(),
      messages: fn(),
      eventsUrl: vi.fn(() => '/owner-events'),
      thumbnailUrl: vi.fn(() => '/owner-thumb'),
      startExport: fn(),
      getExport: fn(),
      cancelExport: fn(),
      share: fn(),
      unshare: fn(),
      upload: fn(),
      assets: fn(),
      addAssets: fn(),
      deleteAsset: fn(),
      saveDeck: fn(),
      renderDeck: fn(),
      saveStoryboard: fn(),
    } as Record<string, ReturnType<typeof vi.fn>>,
    admin: {
      get: vi.fn(),
      messages: vi.fn(),
      assets: vi.fn(),
      getExport: vi.fn(),
      eventsUrl: vi.fn(
        (id: string, token: string) => `/admin/projects/${id}/events?token=${token}`,
      ),
      thumbnailUrl: vi.fn(() => '/admin-thumb'),
      download: vi.fn(),
    },
  }
})

vi.mock('../src/solid/core/auth', () => ({ useAuth: () => ({ getToken: mocks.getToken }) }))
vi.mock('../src/solid/studio/client', async () => {
  const actual = await vi.importActual<any>('../src/solid/studio/client')
  return { ...actual, studio: mocks.studio, adminStudio: mocks.admin }
})

import { type ProjectStore, READ_ONLY_MESSAGE, useProject } from '../src/solid/studio/useProject'

class FakeEventSource {
  static instances: FakeEventSource[] = []
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  constructor(public url: string) {
    FakeEventSource.instances.push(this)
  }
  emit(ev: unknown) {
    this.onmessage?.({ data: JSON.stringify(ev) })
  }
  close() {}
}

const OWNER = { id: 'owner-id', email: 'owner@example.com', firstName: 'Olive', lastName: null }
const DETAIL = {
  id: 'p1',
  title: 'Launch film',
  options: {},
  outputs: [],
  status: 'ready',
  description: { preview: null, outputs: [] },
  owner: OWNER,
}

function mount(admin: boolean): Promise<ProjectStore> {
  let store!: ProjectStore
  render(() => {
    store = useProject('p1', { admin })
    return null
  })
  return waitFor(() => {
    expect(store.initialLoading).toBe(false)
    return store
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  FakeEventSource.instances = []
  vi.stubGlobal('EventSource', FakeEventSource)
  mocks.admin.get.mockResolvedValue(DETAIL)
  mocks.admin.messages.mockResolvedValue({
    entries: [{ id: 'e1', role: 'user', text: 'hello', at: 1 }],
    busy: false,
    activeModel: null,
  })
  mocks.admin.assets.mockResolvedValue([])
  mocks.admin.getExport.mockResolvedValue({ running: false })
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useProject in admin review mode', () => {
  it('loads everything through the admin routes and nothing through the owner’s', async () => {
    const s = await mount(true)
    expect(s.readOnly).toBe(true)
    expect(s.project?.title).toBe('Launch film')
    expect(s.owner).toEqual(OWNER)
    expect(s.entries).toHaveLength(1)
    expect(mocks.admin.get).toHaveBeenCalledWith('tok', 'p1')
    expect(mocks.admin.messages).toHaveBeenCalledWith('tok', 'p1')
    expect(mocks.admin.assets).toHaveBeenCalledWith('tok', 'p1')
    expect(mocks.admin.getExport).toHaveBeenCalledWith('tok', 'p1')
    await waitFor(() => expect(FakeEventSource.instances.length).toBeGreaterThan(0))
    expect(FakeEventSource.instances[0].url).toBe('/admin/projects/p1/events?token=tok')
    for (const [name, call] of Object.entries(mocks.studio))
      expect(call, `studio.${name}`).not.toHaveBeenCalled()
  })

  it('refuses every write before it reaches the network', async () => {
    const s = await mount(true)
    const refused = [
      () => s.addAssets([new File(['x'], 'a.png')]),
      () => s.deleteAsset('uploads/a.png'),
      () => s.upload([new File(['x'], 'a.png')]),
      () => s.updateProject({ title: 'renamed' }),
      () => s.remove(),
      () => s.share(),
      () => s.unshare(),
      () => s.steerQueued('e1'),
    ]
    for (const write of refused) await expect(write()).rejects.toThrow(READ_ONLY_MESSAGE)

    // These are quiet no-ops rather than errors: a stray click must not
    // surface as a failure, and must not send anything either.
    await s.send('spend their credits')
    expect(await s.stop()).toBe(false)
    await s.rollback({
      id: 'e1',
      role: 'user',
      text: 'x',
      at: 1,
      sessionEntryId: 's',
      checkpointId: 'c',
    })
    await s.exportVideo({ res: '1080p' } as any)
    await s.cancelExport()

    for (const [name, call] of Object.entries(mocks.studio))
      expect(call, `studio.${name}`).not.toHaveBeenCalled()
    expect(s.entries.map(e => e.text)).toEqual(['hello'])
  })

  it('reads owner-route thumbnails through the admin route', async () => {
    const s = await mount(true)
    // mediaUrl needs the session token, which lands a tick after mount.
    await waitFor(() =>
      expect(s.mediaUrl('/projects/p1/assets/thumb?path=a.png')).toContain(
        '/admin/projects/p1/assets/thumb?path=a.png',
      ),
    )
    expect(s.mediaUrl('/files/projects/studio--owner-id--x/a.png')).toContain(
      '/files/projects/studio--owner-id--x/a.png',
    )
    expect(s.mediaUrl('/files/projects/studio--owner-id--x/a.png')).not.toContain('/admin/')
  })

  it('ignores the owner’s credit events instead of updating the admin’s header', async () => {
    const s = await mount(true)
    await waitFor(() => expect(FakeEventSource.instances.length).toBeGreaterThan(0))
    const dispatched = vi.spyOn(window, 'dispatchEvent')
    const es = FakeEventSource.instances.at(-1)!
    es.emit({ type: 'credit_balance', balance: 1234 })
    es.emit({ type: 'credit_exhausted', message: 'Out of credits' })
    expect(dispatched).not.toHaveBeenCalled()
    expect(s.entries.map(e => e.role)).toEqual(['user'])
    es.emit({ type: 'entry', entry: { id: 'e2', role: 'assistant', text: 'live', at: 2 } })
    expect(s.entries.map(e => e.text)).toEqual(['hello', 'live'])
    dispatched.mockRestore()
  })

  it.each([
    [403, 'Only administrators can open this view.'],
    [401, 'Only administrators can open this view.'],
    [404, 'No project with this id.'],
    [500, 'Could not load this project. Refresh to try again.'],
  ])('explains a %s', async (status, message) => {
    mocks.admin.get.mockRejectedValueOnce(Object.assign(new Error('nope'), { status }))
    const s = await mount(true)
    expect(s.loadError).toBe(message)
  })
})

describe('useProject for the owner', () => {
  it('still uses the owner’s routes and stays writable', async () => {
    mocks.studio.get.mockResolvedValue(DETAIL)
    mocks.studio.messages.mockResolvedValue({ entries: [], busy: false, activeModel: null })
    mocks.studio.assets.mockResolvedValue([])
    mocks.studio.getExport.mockResolvedValue({ running: false })
    const s = await mount(false)
    expect(s.readOnly).toBe(false)
    expect(s.owner).toBeNull()
    expect(mocks.studio.get).toHaveBeenCalledWith('tok', 'p1')
    expect(mocks.admin.get).not.toHaveBeenCalled()
    expect(s.mediaUrl('/projects/p1/assets/thumb?path=a.png')).not.toContain('/admin/')
    await s.updateProject({ title: 'renamed' })
    expect(mocks.studio.patch).toHaveBeenCalledWith('tok', 'p1', { title: 'renamed' })
  })
})
