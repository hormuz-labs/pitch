import { describe, expect, it, vi } from 'vitest'
import { createElement } from '../apps/web/node_modules/react'
import { renderToStaticMarkup } from '../apps/web/node_modules/react-dom/server'
import { MemoryRouter, Route, Routes } from '../apps/web/node_modules/react-router-dom'

// Needs @clerk/react in test.server.deps.inline (vitest.config.ts): vitest
// cannot intercept a module Vite externalises, and without the mock EditorView's
// useAuth throws for want of a <ClerkProvider>.
vi.mock('@clerk/react', () => ({ useAuth: () => ({ getToken: vi.fn() }) }))

import type { Project } from '../apps/web/src/types'
import {
  EditorView,
  VideoEditionHistory,
  VideoEditionPanel,
} from '../apps/web/src/views/EditorView'

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
  const editions = [
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
  ]

  it('keeps the selected version and edit action in a compact toolbar', () => {
    const html = renderToStaticMarkup(
      createElement(VideoEditionHistory, {
        editions,
        activeEditionId: 'edition_1',
        onOpenHistory: vi.fn(),
        onEdit: vi.fn(),
      }),
    )

    expect(html).toContain('id="open-version-history-btn"')
    expect(html).toContain('Edition 1')
    expect(html).toContain('2 versions')
    expect(html).toContain('Edit version')
  })

  it('renders the complete version list inside a right-side history panel', () => {
    const html = renderToStaticMarkup(
      createElement(VideoEditionPanel, {
        editions,
        activeEditionId: 'edition_1',
        onSelect: vi.fn(),
        onEdit: vi.fn(),
        onClose: vi.fn(),
      }),
    )

    expect(html).toContain('aria-label="Video history"')
    expect(html).toContain('Edition 2')
    expect(html).toContain('Latest')
    expect(html).toContain('Edition 1')
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('id="edit-selected-version-btn"')
    expect(html).toContain('Edit selected version')
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
    expect(html).toContain('Edit version')
    expect(html).toContain('Costs 3 credits')
  })
})
