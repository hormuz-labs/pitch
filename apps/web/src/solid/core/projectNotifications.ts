import type { Project } from '../../lib/studio-api'

export interface ProjectNotificationState {
  pending: string[]
  unread: string[]
}

export const EMPTY_PROJECT_NOTIFICATIONS: ProjectNotificationState = { pending: [], unread: [] }

export function reconcileProjectNotifications(
  state: ProjectNotificationState,
  projects: Project[],
  selectedProjectId?: string,
): ProjectNotificationState {
  const existing = new Set(projects.map(project => project.id))
  const pending = new Set(state.pending.filter(id => existing.has(id)))
  const unread = new Set(state.unread.filter(id => existing.has(id)))

  for (const project of projects) {
    if (project.id === selectedProjectId) {
      pending.delete(project.id)
      unread.delete(project.id)
    } else if (project.busy) {
      pending.add(project.id)
      unread.delete(project.id)
    } else if (pending.delete(project.id)) {
      unread.add(project.id)
    }
  }

  return { pending: [...pending], unread: [...unread] }
}

export function readProjectNotifications(storage: Storage): ProjectNotificationState {
  try {
    const value = JSON.parse(storage.getItem('pitch:project-notifications') ?? '{}')
    return {
      pending: Array.isArray(value.pending) ? value.pending.filter(isString) : [],
      unread: Array.isArray(value.unread) ? value.unread.filter(isString) : [],
    }
  } catch {
    return EMPTY_PROJECT_NOTIFICATIONS
  }
}

export function writeProjectNotifications(storage: Storage, state: ProjectNotificationState) {
  storage.setItem('pitch:project-notifications', JSON.stringify(state))
}

const isString = (value: unknown): value is string => typeof value === 'string'
