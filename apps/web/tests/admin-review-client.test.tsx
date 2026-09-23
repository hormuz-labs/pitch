import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API_URL } from '../src/config'
import { api } from '../src/lib/api'
import { saveBlob } from '../src/lib/save-blob'
import { adminMediaPath, adminStudio } from '../src/solid/studio/client'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('adminStudio: every read goes to /admin, with the header', () => {
  it.each([
    ['get', () => adminStudio.get('tok', 'p 1'), '/admin/projects/p%201/studio'],
    ['messages', () => adminStudio.messages('tok', 'p1'), '/admin/projects/p1/messages'],
    ['assets', () => adminStudio.assets('tok', 'p1'), '/admin/projects/p1/assets'],
    ['getExport', () => adminStudio.getExport('tok', 'p1'), '/admin/projects/p1/export'],
  ] as const)('%s', async (_name, run, path) => {
    fetchMock.mockResolvedValueOnce(json({}))
    await run()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${API_URL}${path}`)
    expect(init.method).toBe('GET')
    expect(init.headers.Authorization).toBe('Bearer tok')
  })

  it('has no way to write', () => {
    expect(Object.keys(adminStudio).sort()).toEqual([
      'assets',
      'download',
      'eventsUrl',
      'get',
      'getExport',
      'messages',
      'thumbnailUrl',
    ])
  })

  it('streams events and thumbnails from the admin routes', () => {
    expect(adminStudio.eventsUrl('p1', 'tok')).toBe(`${API_URL}/admin/projects/p1/events?token=tok`)
    expect(adminStudio.thumbnailUrl('p1', 2, 'tok', 3)).toBe(
      `${API_URL}/admin/projects/p1/thumbnail?t=2&v=3&token=tok`,
    )
  })

  it.each([
    ['chat', '/admin/projects/p1/download/chat'],
    ['chat-json', '/admin/projects/p1/download/chat?format=json'],
    ['logs', '/admin/projects/p1/download/logs'],
  ] as const)('downloads %s with the header, never a token in the URL', async (kind, path) => {
    fetchMock.mockResolvedValueOnce(
      new Response('# chat', {
        headers: { 'content-disposition': 'attachment; filename="pitch-p1-chat.md"' },
      }),
    )
    const out = await adminStudio.download('tok', 'p1', kind)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${API_URL}${path}`)
    expect(url).not.toContain('token')
    expect(init.headers.Authorization).toBe('Bearer tok')
    expect(out.filename).toBe('pitch-p1-chat.md')
    expect(await out.blob.text()).toBe('# chat')
  })

  it('surfaces the server’s refusal', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'Not authorized as admin' }, 403))
    await expect(adminStudio.download('tok', 'p1', 'logs')).rejects.toMatchObject({
      status: 403,
      message: 'Not authorized as admin',
    })
  })
})

describe('api.file', () => {
  it('has no filename when the server sends none', async () => {
    fetchMock.mockResolvedValueOnce(new Response('x'))
    expect((await api.file('/x', 'tok')).filename).toBeNull()
  })
})

describe('adminMediaPath', () => {
  it('moves the owner’s thumbnail routes under /admin', () => {
    expect(adminMediaPath('p1', '/projects/p1/assets/thumb?path=a.png&at=2')).toBe(
      '/admin/projects/p1/assets/thumb?path=a.png&at=2',
    )
    expect(adminMediaPath('p 1', '/projects/p%201/thumbnail')).toBe(
      '/admin/projects/p%201/thumbnail',
    )
  })

  it('leaves workspace files and other projects alone', () => {
    expect(adminMediaPath('p1', '/files/projects/studio--u--n/a.png')).toBe(
      '/files/projects/studio--u--n/a.png',
    )
    expect(adminMediaPath('p1', '/projects/p2/assets/thumb')).toBe('/projects/p2/assets/thumb')
    expect(adminMediaPath('p1', 'https://cdn.example.com/a.png')).toBe(
      'https://cdn.example.com/a.png',
    )
  })
})

describe('saveBlob', () => {
  it('saves through an object URL and releases it', () => {
    vi.useFakeTimers()
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:local/1')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    saveBlob(new Blob(['x']), 'pitch-p1-logs.json')
    const anchor = click.mock.instances[0] as unknown as HTMLAnchorElement
    expect(anchor.download).toBe('pitch-p1-logs.json')
    expect(anchor.href).toBe('blob:local/1')
    vi.runAllTimers()
    expect(revoke).toHaveBeenCalledWith('blob:local/1')
    expect(create).toHaveBeenCalledOnce()
    click.mockRestore()
    create.mockRestore()
    revoke.mockRestore()
    vi.useRealTimers()
  })
})
