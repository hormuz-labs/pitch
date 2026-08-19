import type { Project } from '../types'

type LaunchRouteProject = Pick<Project, 'id' | 'status' | 'parameters'>

interface NamedLaunchProject {
  name: string
  jobId?: string
}

/** Match the regular editor convention: the stable job ID is the route identity. */
export function launchVideoDestination(project: LaunchRouteProject): string {
  return `/launch-video/edit/${encodeURIComponent(project.id)}`
}

/** Filesystem-only legacy projects have no job ID and keep an explicit fallback route. */
export function launchVideoProjectDestination(project: NamedLaunchProject): string {
  return project.jobId
    ? `/launch-video/edit/${encodeURIComponent(project.jobId)}`
    : `/launch-video/edit/project/${encodeURIComponent(project.name)}`
}

export interface LaunchVideoRouteState {
  section: 'new' | 'edit'
  jobId?: string
  projectName?: string
  redirectTo?: string
  resolving?: boolean
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/** Resolve canonical section routes and migrate the two previous URL formats. */
export function resolveLaunchVideoRoute(
  splat: string | undefined,
  projects: NamedLaunchProject[],
  projectsLoading: boolean,
): LaunchVideoRouteState {
  if (!splat) return { section: 'new', redirectTo: '/launch-video/new' }
  if (splat === 'new') return { section: 'new' }
  if (splat === 'edit') return { section: 'edit' }

  if (splat.startsWith('edit/project/')) {
    return { section: 'edit', projectName: safeDecode(splat.slice('edit/project/'.length)) }
  }
  if (splat.startsWith('edit/')) {
    return { section: 'edit', jobId: safeDecode(splat.slice('edit/'.length)) }
  }

  if (splat.startsWith('job/')) {
    const jobId = safeDecode(splat.slice('job/'.length))
    return {
      section: 'edit',
      jobId,
      redirectTo: `/launch-video/edit/${encodeURIComponent(jobId)}`,
    }
  }
  if (splat.startsWith('project/')) {
    const projectName = safeDecode(splat.slice('project/'.length))
    return {
      section: 'edit',
      projectName,
      redirectTo: `/launch-video/edit/project/${encodeURIComponent(projectName)}`,
    }
  }

  // Bare values are from the immediately previous /launch-video/:id-or-name
  // route. Wait for the project list so a readable legacy name is not mistaken
  // for an opaque job ID.
  if (projectsLoading) return { section: 'edit', resolving: true }
  const identifier = safeDecode(splat)
  const legacyProject = projects.find(project => project.name === identifier)
  if (legacyProject?.jobId) {
    return {
      section: 'edit',
      jobId: legacyProject.jobId,
      redirectTo: `/launch-video/edit/${encodeURIComponent(legacyProject.jobId)}`,
    }
  }
  if (legacyProject) {
    return {
      section: 'edit',
      projectName: legacyProject.name,
      redirectTo: `/launch-video/edit/project/${encodeURIComponent(legacyProject.name)}`,
    }
  }
  return {
    section: 'edit',
    jobId: identifier,
    redirectTo: `/launch-video/edit/${encodeURIComponent(identifier)}`,
  }
}
