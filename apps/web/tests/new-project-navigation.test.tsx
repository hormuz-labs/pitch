import { describe, expect, it, vi } from 'vitest'
import { openStudioProject } from '../src/solid/core/projectNavigation'

describe('new project navigation', () => {
  it('keeps the submitted view mounted until the Studio route is ready', async () => {
    const navigate = vi.fn()
    let finishLoading!: () => void
    const studioRouteReady = new Promise<void>(resolve => {
      finishLoading = resolve
    })

    const opening = openStudioProject('project-1', navigate, studioRouteReady)
    expect(navigate).not.toHaveBeenCalled()

    finishLoading()
    await opening
    expect(navigate).toHaveBeenCalledWith('/p/project-1')
  })
})
