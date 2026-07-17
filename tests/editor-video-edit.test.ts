import { describe, expect, it, vi } from 'vitest'
import { createElement } from '../apps/web/node_modules/react'
import { renderToStaticMarkup } from '../apps/web/node_modules/react-dom/server'
import { MemoryRouter, Route, Routes } from '../apps/web/node_modules/react-router-dom'

vi.mock('@clerk/react', () => ({ useAuth: () => ({ getToken: vi.fn() }) }))

import type { Project } from '../apps/web/src/types'
import { EditorView, VideoEditionHistory } from '../apps/web/src/views/EditorView'

const completedProject: Project = {
  id: 'job_1',
  userId: 'user_test',
  status: 'COMPLETED',
  videoUrl: 'https://cdn.example/final.mp4',
  parameters: {
    workflowStage: 'RENDER_QUEUED',
    storyboard: {
      revision: 4,
      approvedRevision: 4,
      status: 'approved',
      transition: 'fade',
      titleCards: {
        intro: { enabled: false, title: '', subtitle: '' },
        outro: { enabled: false, title: '', subtitle: '' },
      },
      scenes: [],
    },
  },
  createdAt: '2026-07-17T00:00:00.000Z',
  updatedAt: '2026-07-17T01:00:00.000Z',
}

describe('completed video editing', () => {
  it('renders saved editions with the latest and selected states', () => {
    const html = renderToStaticMarkup(
      createElement(VideoEditionHistory, {
        editions: [
          {
            id: 'edition_2',
            jobId: 'job_1',
            editionNumber: 2,
            videoUrl: 'https://cdn.example/v2.mp4',
            createdAt: '2026-07-17T02:00:00.000Z',
          },
          {
            id: 'edition_1',
            jobId: 'job_1',
            editionNumber: 1,
            videoUrl: 'https://cdn.example/v1.mp4',
            createdAt: '2026-07-17T01:00:00.000Z',
          },
        ],
        activeEditionId: 'edition_1',
        onSelect: vi.fn(),
      }),
    )

    expect(html).toContain('Video history')
    expect(html).toContain('2 editions')
    expect(html).toContain('Edition 2')
    expect(html).toContain('Latest')
    expect(html).toContain('Edition 1')
    expect(html).toContain('aria-pressed="true"')
  })

  it('shows a paid Edit action beside the completed video', () => {
    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        { initialEntries: ['/editor/job_1'] },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/editor/:id',
            element: createElement(EditorView, {
              projects: [completedProject],
              jobLogs: {},
              isMobile: false,
              onDelete: vi.fn(),
              onUpdate: vi.fn(),
            }),
          }),
        ),
      ),
    )

    expect(html).toContain('id="edit-video-btn"')
    expect(html).toContain('Edit this edition')
    expect(html).toContain('Costs 3 credits')
  })
})
