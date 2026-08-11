import { describe, expect, it } from 'vitest'
import {
  launchVideoDestination,
  launchVideoProjectDestination,
  resolveLaunchVideoRoute,
} from '../apps/web/src/launch-video/navigation'

describe('launch-video navigation', () => {
  it('uses the stable job ID for active and completed launch-video URLs', () => {
    expect(
      launchVideoDestination({
        id: 'job-active',
        status: 'PROCESSING',
        parameters: { jobType: 'launch-video', projectName: 'acme-launch' },
      }),
    ).toBe('/launch-video/edit/job-active')

    expect(
      launchVideoDestination({
        id: 'job-ready',
        status: 'COMPLETED',
        parameters: { jobType: 'launch-video', projectName: 'acme-launch' },
      }),
    ).toBe('/launch-video/edit/job-ready')
  })

  it('encodes the stable ID and does not depend on the display name', () => {
    expect(
      launchVideoDestination({
        id: 'job/id with spaces',
        status: 'PROCESSING',
        parameters: { jobType: 'launch-video', projectName: 'Acme launch/2026' },
      }),
    ).toBe('/launch-video/edit/job%2Fid%20with%20spaces')
  })

  it('uses a project job ID when available and an explicit legacy name fallback otherwise', () => {
    expect(launchVideoProjectDestination({ name: 'active', jobId: 'job-active' })).toBe(
      '/launch-video/edit/job-active',
    )
    expect(launchVideoProjectDestination({ name: 'legacy project' })).toBe(
      '/launch-video/edit/project/legacy%20project',
    )
  })

  it('resolves the explicit new, edit-list, and edit-job sections', () => {
    expect(resolveLaunchVideoRoute('new', [], false)).toEqual({ section: 'new' })
    expect(resolveLaunchVideoRoute('edit', [], false)).toEqual({ section: 'edit' })
    expect(resolveLaunchVideoRoute('edit/job-ready', [], false)).toEqual({
      section: 'edit',
      jobId: 'job-ready',
    })
  })

  it('redirects old root, direct-ID, nested-job, and name URLs', () => {
    const projects = [{ name: 'acme-launch', jobId: 'job-acme' }]

    expect(resolveLaunchVideoRoute(undefined, projects, false).redirectTo).toBe('/launch-video/new')
    expect(resolveLaunchVideoRoute('job/job-old', projects, false).redirectTo).toBe(
      '/launch-video/edit/job-old',
    )
    expect(resolveLaunchVideoRoute('job-direct', projects, false).redirectTo).toBe(
      '/launch-video/edit/job-direct',
    )
    expect(resolveLaunchVideoRoute('acme-launch', projects, false).redirectTo).toBe(
      '/launch-video/edit/job-acme',
    )
  })
})
