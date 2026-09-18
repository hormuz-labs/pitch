import { fireEvent, render, screen } from '@solidjs/testing-library'
import { describe, expect, it, vi } from 'vitest'
import { NewProjectPreferences } from '../src/solid/account/NewProjectPreferences'

describe('NewProjectPreferences', () => {
  it('does not render default preferences', () => {
    render(() => (
      <NewProjectPreferences
        ratio="16:9"
        duration={null}
        onResetRatio={vi.fn()}
        onResetDuration={vi.fn()}
      />
    ))

    expect(screen.queryByLabelText('Project preferences')).toBeNull()
  })

  it('renders selected ratio and duration as inline prompt tokens', () => {
    render(() => (
      <NewProjectPreferences
        ratio="9:16"
        duration={15}
        onResetRatio={vi.fn()}
        onResetDuration={vi.fn()}
      />
    ))

    const tokens = screen.getByLabelText('Project preferences')
    expect(tokens.textContent).toContain('9:16')
    expect(tokens.textContent).toContain('15s')
  })

  it('lets users clear each preference independently', () => {
    const resetRatio = vi.fn()
    const resetDuration = vi.fn()
    render(() => (
      <NewProjectPreferences
        ratio="4:5"
        duration={30}
        onResetRatio={resetRatio}
        onResetDuration={resetDuration}
      />
    ))

    fireEvent.click(screen.getByRole('button', { name: 'Remove aspect ratio 4:5' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove duration 30 seconds' }))
    expect(resetRatio).toHaveBeenCalledOnce()
    expect(resetDuration).toHaveBeenCalledOnce()
  })
})
