import { fireEvent, render, screen, waitFor, within } from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { StudioProjectControls } from '../src/solid/studio/StudioProjectControls'

function renderControls(pinned = false) {
  const actions = {
    onNew: vi.fn(),
    onRename: vi.fn(),
    onTogglePin: vi.fn(),
    onDelete: vi.fn(),
  }
  render(() => <StudioProjectControls title="Launch film" pinned={pinned} {...actions} />)
  return actions
}

describe('StudioProjectControls', () => {
  it('starts a new chat from the top bar', () => {
    const actions = renderControls()
    const button = screen.getByRole('button', { name: 'New chat' })
    const icon = button.querySelector('svg')
    expect(icon).not.toBeNull()
    expect(icon?.getAttribute('aria-hidden')).toBe('true')
    fireEvent.click(button)
    expect(actions.onNew).toHaveBeenCalledOnce()
  })

  it('offers pin, rename, and delete actions', async () => {
    const actions = renderControls()
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Launch film' }))
    const menu = await screen.findByRole('menu', { name: 'Actions for Launch film' })

    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Pin to top' }))
    expect(actions.onTogglePin).toHaveBeenCalledOnce()

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Launch film' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit name' }))
    expect(actions.onRename).toHaveBeenCalledOnce()

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Launch film' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    expect(actions.onDelete).toHaveBeenCalledOnce()
  })

  it('changes the pin action for pinned projects and closes with Escape', async () => {
    renderControls(true)
    const trigger = screen.getByRole('button', { name: 'Actions for Launch film' })
    await userEvent.click(trigger)
    expect(await screen.findByRole('menuitem', { name: 'Unpin from top' })).toBeTruthy()

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(document.activeElement).toBe(trigger)
  })
})
