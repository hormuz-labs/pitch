import { describe, expect, it } from 'vitest'
import type { Project } from '../src/lib/studio-api'
import {
  EMPTY_PROJECT_NOTIFICATIONS,
  readProjectNotifications,
  reconcileProjectNotifications,
  writeProjectNotifications,
} from '../src/solid/core/projectNotifications'

const project = (id: string, busy: boolean): Project =>
  ({ id, busy, status: busy ? 'working' : 'ready' }) as Project

describe('project completion notifications', () => {
  it('marks only background work as pending', () => {
    const next = reconcileProjectNotifications(
      EMPTY_PROJECT_NOTIFICATIONS,
      [project('open', true), project('background', true), project('ready', false)],
      'open',
    )
    expect(next).toEqual({ pending: ['background'], unread: [] })
  })

  it('creates an unread notification when observed background work completes', () => {
    const next = reconcileProjectNotifications({ pending: ['background'], unread: [] }, [
      project('background', false),
    ])
    expect(next).toEqual({ pending: [], unread: ['background'] })
  })

  it('clears pending and unread state when the chat is opened', () => {
    const next = reconcileProjectNotifications(
      { pending: ['chat'], unread: ['chat'] },
      [project('chat', false)],
      'chat',
    )
    expect(next).toEqual(EMPTY_PROJECT_NOTIFICATIONS)
  })

  it('persists valid notification state and tolerates invalid storage', () => {
    const storage = localStorage
    writeProjectNotifications(storage, { pending: ['one'], unread: ['two'] })
    expect(readProjectNotifications(storage)).toEqual({ pending: ['one'], unread: ['two'] })

    storage.setItem('pitch:project-notifications', '{broken')
    expect(readProjectNotifications(storage)).toEqual(EMPTY_PROJECT_NOTIFICATIONS)
  })
})
