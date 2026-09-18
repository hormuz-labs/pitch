import { fireEvent, render, screen, waitFor, within } from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import type { JSX } from 'solid-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Project } from '../src/lib/studio-api'

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }))

vi.mock('@solidjs/router', () => ({
  A: (props: { href: string; children: JSX.Element }) => <a href={props.href}>{props.children}</a>,
  useLocation: () => ({ pathname: '/new' }),
  useNavigate: () => navigate,
}))
vi.mock('../src/solid/account/SidebarAccountMenu', () => ({
  SidebarAccountMenu: () => <button type="button">Account</button>,
}))

import { Sidebar } from '../src/solid/core/Sidebar'

const project = (overrides: Partial<Project> = {}): Project => ({
  id: 'project-1',
  userId: 'user-1',
  flow: 'studio',
  name: 'project-1',
  title: 'Launch film',
  prompt: '',
  options: {},
  creditsCharged: 0,
  outputs: [],
  thumbnailUrl: null,
  lastError: null,
  isPublic: false,
  shareSlug: null,
  shareViews: 0,
  source: 'app',
  pinnedAt: null,
  createdAt: '2026-09-18T10:00:00.000Z',
  updatedAt: '2026-09-18T10:00:00.000Z',
  status: 'ready',
  busy: false,
  ...overrides,
})

function renderSidebar(projects: Project[] = [project()]) {
  const actions = {
    close: vi.fn(),
    toggle: vi.fn(),
    openSettings: vi.fn(),
    renameProject: vi.fn(async () => true),
    toggleProjectPin: vi.fn(async () => undefined),
    deleteProject: vi.fn(async () => undefined),
  }
  render(() => (
    <Sidebar
      collapsed={false}
      isMobile={false}
      isAdmin={false}
      projects={projects}
      projectsLoading={false}
      selectedKey="new"
      close={actions.close}
      toggle={actions.toggle}
      openSettings={actions.openSettings}
      renameProject={actions.renameProject}
      toggleProjectPin={actions.toggleProjectPin}
      deleteProject={actions.deleteProject}
    />
  ))
  return actions
}

async function openProjectMenu(name = 'Launch film') {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: `Actions for ${name}` }))
  return { user, menu: await screen.findByRole('menu', { name: `Actions for ${name}` }) }
}

describe('Sidebar chat actions', () => {
  beforeEach(() => navigate.mockReset())

  it('puts pinned chats first, then orders the rest by recent activity', () => {
    renderSidebar([
      project({ id: 'recent', title: 'Recent', updatedAt: '2026-09-18T12:00:00.000Z' }),
      project({ id: 'pinned', title: 'Pinned', pinnedAt: '2026-09-17T12:00:00.000Z' }),
      project({ id: 'older', title: 'Older', updatedAt: '2026-09-18T11:00:00.000Z' }),
    ])

    const chatLinks = screen.getAllByRole('button', { name: /^(Pinned|Recent|Older)$/ })
    expect(chatLinks.map(link => link.getAttribute('aria-label'))).toEqual([
      'Pinned',
      'Recent',
      'Older',
    ])
  })

  it('opens a chat from its name', async () => {
    renderSidebar()
    await userEvent.click(screen.getByRole('button', { name: 'Launch film' }))
    expect(navigate).toHaveBeenCalledWith('/p/project-1')
  })

  it('renames a chat from the overflow menu', async () => {
    const { renameProject } = renderSidebar()
    const { user, menu } = await openProjectMenu()
    await user.click(within(menu).getByRole('menuitem', { name: 'Edit chat name' }))

    const input = screen.getByRole('textbox', { name: 'Chat name' })
    await user.clear(input)
    await user.type(input, 'New chat name{Enter}')

    await waitFor(() =>
      expect(renameProject).toHaveBeenCalledWith(expect.anything(), 'New chat name'),
    )
  })

  it('pins a chat through the overflow menu', async () => {
    const actions = renderSidebar()
    const { user, menu } = await openProjectMenu()
    await user.click(within(menu).getByRole('menuitem', { name: 'Pin to top' }))
    expect(actions.toggleProjectPin).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'project-1' }),
    )
  })

  it('offers to unpin an already pinned chat', async () => {
    const actions = renderSidebar([project({ pinnedAt: '2026-09-18T12:00:00.000Z' })])
    const { user, menu } = await openProjectMenu()
    await user.click(within(menu).getByRole('menuitem', { name: 'Unpin from top' }))
    expect(actions.toggleProjectPin).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'project-1' }),
    )
  })

  it('deletes only after confirmation', async () => {
    const confirm = vi.fn(() => false)
    Object.defineProperty(window, 'confirm', { configurable: true, value: confirm })
    const { deleteProject } = renderSidebar()
    let opened = await openProjectMenu()
    await opened.user.click(within(opened.menu).getByRole('menuitem', { name: 'Delete' }))
    expect(deleteProject).not.toHaveBeenCalled()

    confirm.mockReturnValue(true)
    opened = await openProjectMenu()
    await opened.user.click(within(opened.menu).getByRole('menuitem', { name: 'Delete' }))
    expect(deleteProject).toHaveBeenCalledWith(expect.objectContaining({ id: 'project-1' }))
  })

  it('keeps the menu keyboard accessible', async () => {
    renderSidebar()
    const trigger = screen.getByRole('button', { name: 'Actions for Launch film' })
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })

    const menu = await screen.findByRole('menu')
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(menu).getByRole('menuitem', { name: 'Edit chat name' }),
      ),
    )
  })
})
