import { render, screen } from '@solidjs/testing-library'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  loader: vi.fn(),
  reloadForNewBuild: vi.fn(),
}))

vi.mock('../src/solid/core/route-modules', () => ({
  discoveredRouteModules: new Proxy({}, { get: () => mocks.loader }),
}))
vi.mock('../src/lib/stale-build', async () => {
  const actual = await vi.importActual<any>('../src/lib/stale-build')
  return { ...actual, reloadForNewBuild: mocks.reloadForNewBuild }
})

import { loadRouteModule } from '../src/solid/core/routes'

const settled = (promise: Promise<unknown>) =>
  Promise.race([promise.then(() => true), new Promise(r => setTimeout(() => r(false), 30))])

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('loadRouteModule after a deploy', () => {
  it('loads a route normally', async () => {
    mocks.loader.mockResolvedValue({ NewProjectView: () => <p>New project</p> })
    const route = await loadRouteModule('newProject')
    render(() => <route.default />)
    expect(screen.getByText('New project')).toBeTruthy()
  })

  it('waits on its fallback while the page reloads onto the new build', async () => {
    mocks.loader.mockRejectedValue(
      new TypeError('Failed to fetch dynamically imported module: /assets/NewProjectView-old.js'),
    )
    mocks.reloadForNewBuild.mockReturnValue(true)
    expect(await settled(loadRouteModule('newProject'))).toBe(false)
    expect(mocks.reloadForNewBuild).toHaveBeenCalledOnce()
  })

  it('waits when Vite’s handler already cancelled the error to reload', async () => {
    mocks.loader.mockResolvedValue(undefined)
    expect(await settled(loadRouteModule('newProject'))).toBe(false)
  })

  it('offers a refresh, not a developer placeholder, if reloading did not help', async () => {
    mocks.loader.mockRejectedValue(new TypeError('Importing a module script failed.'))
    mocks.reloadForNewBuild.mockReturnValue(false)
    const route = await loadRouteModule('newProject')
    render(() => <route.default />)
    expect(screen.getByRole('alert').textContent).toContain('This page didn’t load')
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeTruthy()
    expect(screen.queryByText('Route is being migrated')).toBeNull()
  })
})
