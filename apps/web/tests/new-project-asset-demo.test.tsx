import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ balance: 100 }))),
  )
  mocks.params = {}
  mocks.createProject.mockReset().mockResolvedValue({ id: 'asset-project' })
  mocks.navigate.mockReset()
  mocks.openStudioProject.mockClear()
  mocks.uploadFiles.mockReset().mockResolvedValue([])
})

afterEach(() => vi.unstubAllGlobals())

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

  it('attaches a pasted image to the new chat without starting generation', async () => {
    const upload = { url: '/image.png', name: 'image.png', type: 'image/png', size: 5 }
    mocks.uploadFiles.mockResolvedValue([upload])
    render(() => <NewProjectView />)
    const image = new File(['image'], 'image.png', { type: 'image/png' })
    fireEvent.paste(screen.getByRole('textbox', { name: 'Describe your project' }), {
      clipboardData: { items: [{ kind: 'file', getAsFile: () => image }], files: [image] },
    })
    await waitFor(() => expect(mocks.uploadFiles).toHaveBeenCalledOnce())
    expect(screen.getByRole('img', { name: 'image.png' })).toBeTruthy()
    expect(mocks.createProject).not.toHaveBeenCalled()
  })

  it('rejects audio over 50 MB before uploading it in a new chat', () => {
    const { container } = render(() => <NewProjectView />)
    const file = new File(['audio'], 'large.mp3', { type: 'audio/mpeg' })
    Object.defineProperty(file, 'size', { value: 50 * 1024 * 1024 + 1 })
    fireEvent.drop(container.querySelector('.new-project-page')!, {
      dataTransfer: { types: ['Files'], files: [file] },
    })
    expect(screen.getByText('large.mp3 is over 50 MB')).toBeTruthy()
    expect(mocks.uploadFiles).not.toHaveBeenCalled()
  })

  it('counts previously uploaded attachments when checking the 20-file limit', async () => {
    mocks.uploadFiles.mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => ({
        url: `/photo-${i}.png`,
        name: `photo-${i}.png`,
        type: 'image/png',
        size: 5,
      })),
    )
    const { container } = render(() => <NewProjectView />)
    const image = new File(['image'], 'image.png', { type: 'image/png' })
    fireEvent.paste(screen.getByRole('textbox', { name: 'Describe your project' }), {
      clipboardData: { items: [{ kind: 'file', getAsFile: () => image }], files: [image] },
    })
    await screen.findByRole('img', { name: 'photo-19.png' })
    fireEvent.drop(container.querySelector('.new-project-page')!, {
      dataTransfer: { types: ['Files'], files: [image] },
    })
    expect(screen.getByText(/You can attach up to 20 files/)).toBeTruthy()
    expect(mocks.uploadFiles).toHaveBeenCalledOnce()
  })
})
