/**
 * The pure parts of admin review: what the downloads contain, what their
 * filenames can be, and which paths may take a session token in the URL.
 */
import { describe, expect, it } from 'vitest'
import { acceptsTokenQuery } from '../apps/api/src/lib/token-query.js'
import {
  adminAssetUrl,
  chatMarkdown,
  parseSessionLog,
  reviewFilename,
} from '../apps/api/src/projects/review.js'

const project = { id: 'proj_1', title: 'Launch film', createdAt: '2026-09-01T10:00:00.000Z' }
const owner = { id: 'u1', email: 'owner@example.com', firstName: 'Olive', lastName: 'Owner' }
const at = Date.parse('2026-09-01T10:00:01Z')

describe('reviewFilename', () => {
  it('names the download after the project', () => {
    expect(reviewFilename('cmuef17ax00009q01zd6cho8n', 'chat', 'md')).toBe(
      'pitch-cmuef17ax00009q01zd6cho8n-chat.md',
    )
    expect(reviewFilename('proj_1', 'logs', 'json')).toBe('pitch-proj_1-logs.json')
  })

  it.each([
    ['a"; filename="evil.exe', 'pitch-afilenameevilexe-chat.md'],
    ['x\r\nSet-Cookie: pwned=1', 'pitch-xSet-Cookiepwned1-chat.md'],
    ['../../etc/passwd', 'pitch-etcpasswd-chat.md'],
    ['', 'pitch-project-chat.md'],
    ['"";', 'pitch-project-chat.md'],
  ])('cannot be used to inject a header or a path: %j', (id, expected) => {
    expect(reviewFilename(id, 'chat', 'md')).toBe(expected)
  })

  it('caps the length', () => {
    expect(reviewFilename('a'.repeat(500), 'chat', 'md')).toBe(`pitch-${'a'.repeat(64)}-chat.md`)
  })
})

describe('chatMarkdown', () => {
  it('writes a header with the project and owner', () => {
    const md = chatMarkdown(project, owner, [], new Date('2026-09-02T00:00:00Z'))
    expect(md).toContain('# Launch film')
    expect(md).toContain('- Project: proj_1')
    expect(md).toContain('- Owner: Olive Owner <owner@example.com> (u1)')
    expect(md).toContain('- Exported: 2026-09-02T00:00:00.000Z')
    expect(md).toContain('- Entries: 0')
  })

  it('lays out every kind of entry in order', () => {
    const md = chatMarkdown(project, owner, [
      { id: '1', role: 'user', text: 'Make a film', at },
      { id: '2', role: 'thinking', text: 'Planning scenes', at },
      { id: '3', role: 'tool', text: '', tool: { name: 'motion_render', status: 'error' }, at },
      {
        id: '4',
        role: 'question',
        text: '',
        ask: {
          intro: 'Two quick questions',
          questions: [{ id: 'q', question: 'How long?', options: [{ id: 'a', label: '30s' }] }],
        },
        at,
      },
      { id: '5', role: 'user', text: 'Queued follow-up', at, pending: 'queued' },
      { id: '6', role: 'assistant', text: 'All done.', at },
    ])
    const order = [
      '## User — 2026-09-01T10:00:01.000Z',
      'Make a film',
      '## Thinking',
      'Planning scenes',
      '## Tool · motion_render · error',
      '## Question',
      'Two quick questions',
      '- How long?',
      '  - 30s',
      '## User (queued)',
      '## Assistant',
      'All done.',
    ]
    let from = 0
    for (const piece of order) {
      const i = md.indexOf(piece, from)
      expect(i, piece).toBeGreaterThanOrEqual(0)
      from = i + piece.length
    }
  })

  it('copes with a missing owner, title and timestamps', () => {
    const md = chatMarkdown({ ...project, title: '' }, null, [
      { id: '1', role: 'assistant', text: 'hi', at: Number.NaN },
    ])
    expect(md).toContain('# Untitled project')
    expect(md).toContain('- Owner: unknown')
    expect(md).toContain('## Assistant\n')
  })
})

describe('parseSessionLog', () => {
  it('parses JSON Lines and keeps torn lines as text', () => {
    expect(parseSessionLog('{"a":1}\n\n{"b":2}\n{"c":')).toEqual([
      { a: 1 },
      { b: 2 },
      { unparsed: '{"c":' },
    ])
  })

  it('is empty when there is no transcript', () => {
    expect(parseSessionLog(null)).toEqual([])
    expect(parseSessionLog('')).toEqual([])
  })
})

describe('adminAssetUrl', () => {
  it('moves the owner’s thumbnail route under /admin', () => {
    expect(adminAssetUrl('proj_1', '/projects/proj_1/assets/thumb?path=a.png')).toBe(
      '/admin/projects/proj_1/assets/thumb?path=a.png',
    )
  })

  it('leaves everything else alone', () => {
    expect(adminAssetUrl('proj_1', '/files/projects/x/a.png')).toBe('/files/projects/x/a.png')
    expect(adminAssetUrl('proj_1', '/projects/other/assets/thumb?path=a.png')).toBe(
      '/projects/other/assets/thumb?path=a.png',
    )
    expect(adminAssetUrl('proj_1', null)).toBeNull()
  })
})

describe('acceptsTokenQuery', () => {
  it.each([
    '/projects/p1/events',
    '/projects/p1/thumbnail',
    '/projects/p1/assets/thumb',
    '/admin/projects/p1/events',
    '/admin/projects/p1/thumbnail',
    '/admin/projects/p1/assets/thumb',
    '/files/projects/studio--u--n/index.html',
  ])('lets media and streams take ?token=: %s', path => {
    expect(acceptsTokenQuery(path)).toBe(true)
  })

  it.each([
    '/admin/projects/p1/download/chat',
    '/admin/projects/p1/download/logs',
    '/admin/projects/p1/studio',
    '/admin/projects/p1/messages',
    '/admin/projects/p1/assets',
    '/admin/projects/p1',
    '/admin/dashboard',
    '/admin/users/u1/credits',
    '/projects/p1',
    '/projects/p1/messages',
    '/projects/p1/prompt',
    '/projects/p1/events/extra',
    '/x/admin/projects/p1/events',
  ])('requires the header everywhere else: %s', path => {
    expect(acceptsTokenQuery(path)).toBe(false)
  })
})
