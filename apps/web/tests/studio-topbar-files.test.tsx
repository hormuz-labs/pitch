import { fireEvent, render, screen } from '@solidjs/testing-library'
import { describe, expect, it, vi } from 'vitest'
import { StudioTopbarFiles } from '../src/solid/studio/StudioTopbarFiles'

describe('StudioTopbarFiles', () => {
  it('renders one Files control with a count and opens the files view', () => {
    const open = vi.fn()
    const { container } = render(() => (
      <StudioTopbarFiles count={3} active={false} onClick={open} />
    ))
    const button = screen.getByRole('button', { name: 'Files (3)' })
    expect(container.querySelectorAll('.preview-pane-tab__count')).toHaveLength(1)
    expect(container.querySelector('.preview-pane-tab__count')?.textContent).toBe('3')
    fireEvent.click(button)
    expect(open).toHaveBeenCalledOnce()
  })

  it('reflects the active files view without changing the count', () => {
    const { container } = render(() => <StudioTopbarFiles count={12} active onClick={() => {}} />)
    expect(screen.getByRole('button', { name: 'Files (12)' }).classList.contains('is-active')).toBe(
      true,
    )
    expect(container.querySelector('.preview-pane-tab__count')?.textContent).toBe('12')
  })
})
