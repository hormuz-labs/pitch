import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createProject: vi.fn(),
  navigate: vi.fn(),
  openStudioProject: vi.fn(async () => {}),
  params: {} as Record<string, string>,
  uploadFiles: vi.fn(),
}))

vi.mock('@solidjs/router', () => ({
  useNavigate: () => mocks.navigate,
  useSearchParams: () => [mocks.params],
}))
vi.mock('lenis', () => ({
  default: class {
    raf() {}
    destroy() {}
    scrollTo() {}
  },
}))
vi.mock('../src/components/landing/FeaturedVideos', () => ({ FeaturedVideos: () => null }))
vi.mock('../src/lib/studio-api', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/lib/studio-api')>()
  return {
    ...actual,
    createProject: mocks.createProject,
    listStudioModels: vi.fn(async () => ({ default: '', models: [] })),
    uploads: mocks.uploadFiles,
  }
})
vi.mock('../src/solid/core/auth', () => ({
  useAuth: () => ({ getToken: vi.fn(async () => 'token') }),
  useUser: () => ({ userAccessor: () => null }),
}))
vi.mock('../src/solid/core/projectNavigation', () => ({
  openStudioProject: mocks.openStudioProject,
}))
vi.mock('../src/solid/core/routes', () => ({ loadRouteModule: vi.fn(async () => {}) }))
vi.mock('../src/solid/studio/useBrowserProfile', () => ({
  useBrowserProfile: () => ({ loading: () => true, origins: () => [] }),
}))

import { NewProjectView } from '../src/solid/account/NewProjectView'

beforeEach(() => {
  mocks.params = {}
  mocks.createProject.mockReset().mockResolvedValue({ id: 'asset-project' })
  mocks.navigate.mockReset()
  mocks.openStudioProject.mockClear()
  mocks.uploadFiles.mockReset().mockResolvedValue([])
})

describe('/new asset demo outcome', () => {
  it('preselects the asset demo from a shareable /new URL', () => {
    mocks.params = { flow: 'asset-demo' }

    render(() => <NewProjectView />)

    expect(screen.getByRole('button', { name: 'Clear Asset demo' })).not.toBeNull()
    expect(
      screen.getByRole('textbox', { name: 'Describe your project' }).getAttribute('placeholder'),
    ).toBe('Turn these PDFs or images into a narrated visual demo. ')
  })

  it('submits the outcome as agent guidance while retaining the single project path', async () => {
    render(() => <NewProjectView />)

    fireEvent.click(screen.getByRole('button', { name: 'Asset demo' }))
    fireEvent.input(screen.getByRole('textbox', { name: 'Describe your project' }), {
      target: { value: 'Explain the uploaded investor report.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Generate project' }))

    await waitFor(() => expect(mocks.createProject).toHaveBeenCalledOnce())
    expect(mocks.createProject).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        prompt: 'Explain the uploaded investor report.',
        options: expect.objectContaining({ skill: 'asset-demo' }),
      }),
    )
    expect(mocks.createProject.mock.calls[0]?.[1]).not.toHaveProperty('flow')
    expect(mocks.openStudioProject).toHaveBeenCalledWith(
      'asset-project',
      mocks.navigate,
      expect.any(Promise),
    )
  })

  it('opens a dropped PDF without a model turn while retaining the selected outcome', async () => {
    const upload = {
      url: 'https://storage.test/report.pdf',
      name: 'report.pdf',
      type: 'application/pdf',
      size: 12,
    }
    mocks.uploadFiles.mockResolvedValue([upload])
    const { container } = render(() => <NewProjectView />)
    fireEvent.click(screen.getByRole('button', { name: 'Asset demo' }))

    fireEvent.drop(container.querySelector('.new-project-page')!, {
      dataTransfer: {
        types: ['Files'],
        files: [new File(['pdf'], 'report.pdf', { type: 'application/pdf' })],
      },
    })

    await waitFor(() => expect(mocks.createProject).toHaveBeenCalledOnce())
    expect(mocks.createProject).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        prompt: '',
        uploads: [upload],
        options: expect.objectContaining({ skill: 'asset-demo' }),
      }),
    )
  })
})
