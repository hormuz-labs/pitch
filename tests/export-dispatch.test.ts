/**
 * Which exporter an export reaches.
 *
 * Exporters used to be looked up by the project's flow column. Every new
 * project is flow "studio", so a studio project holding a finished launch
 * film never reached the launch renderer: the API answered "nothing to
 * export yet" for a film that was sitting there complete, audit passed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rows = new Map<string, any>()
const kinds = new Map<string, string | null>()

vi.mock('@saas/db', () => ({ getCreditBalance: vi.fn(), deductCredit: vi.fn(), prisma: {} }))
vi.mock('../apps/api/src/projects/service.js', () => ({
  getRow: async (_u: string, id: string) => rows.get(id),
  getProject: async (_u: string, id: string) => ({
    ...rows.get(id),
    description: { preview: kinds.get(id) ? { kind: 'html' } : null, outputs: [] },
  }),
  addOutput: vi.fn(async () => undefined),
  workspaceOf: (p: any) => ({ dir: `/projects/${p.id}`, internal: p.id }),
}))
vi.mock('../apps/api/src/agent/describe.js', () => ({
  artifactKind: async (ws: { internal: string }) => kinds.get(ws.internal) ?? null,
}))

const { exportProject, registerExporter } = await import('../apps/api/src/projects/export.js')

const started: string[] = []
registerExporter('launch-video', {
  start: p => {
    started.push(p.id)
    return {
      running: true,
      res: '1080p',
      url: null,
      progress: 0,
      stage: 'starting',
      error: null,
      startedAt: 1,
      finishedAt: null,
    }
  },
  status: () => ({}) as never,
  cancel: () => false,
})

beforeEach(() => {
  rows.clear()
  kinds.clear()
  started.length = 0
})

describe('exportProject picks the renderer by what the workspace holds', () => {
  it('renders a launch film in a studio project', async () => {
    rows.set('p1', { id: 'p1', flow: 'studio', options: {}, outputs: [] })
    kinds.set('p1', 'launch')
    const s = await exportProject('user_1', 'p1', {})
    expect(s.stage).toBe('starting')
    expect(started).toEqual(['p1'])
  })

  it('still renders the historical launch-video rows', async () => {
    rows.set('p2', { id: 'p2', flow: 'launch-video', options: {}, outputs: [] })
    kinds.set('p2', 'launch')
    await exportProject('user_1', 'p2', {})
    expect(started).toEqual(['p2'])
  })

  it('exports a deck as the PDF its agent published', async () => {
    rows.set('p3', {
      id: 'p3',
      flow: 'studio',
      options: {},
      outputs: [{ kind: 'pdf', url: '/files/p3/build/output.pdf' }],
    })
    kinds.set('p3', 'deck')
    const s = await exportProject('user_1', 'p3', {})
    expect(s.stage).toBe('done')
    expect(s.url).toBe('/files/p3/build/output.pdf')
    expect(started).toEqual([])
  })

  it('says so when a studio project has nothing yet', async () => {
    rows.set('p4', { id: 'p4', flow: 'studio', options: {}, outputs: [] })
    const s = await exportProject('user_1', 'p4', {})
    expect(s.stage).toBe('failed')
    expect(s.error).toBe('nothing to export yet')
  })
})
