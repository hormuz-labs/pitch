import { fireEvent, render, screen } from '@solidjs/testing-library'
import { describe, expect, it, vi } from 'vitest'
import { GenerateButton } from '../src/components/ui/generate-button'

describe('GenerateButton', () => {
  it('exposes the unavailable state and does not submit while disabled', () => {
    const submit = vi.fn()
    render(() => <GenerateButton isReady={false} disabled onClick={submit} />)

    const button = screen.getByRole('button', { name: 'Generate' })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    expect(button.getAttribute('data-ready')).toBe('false')
    fireEvent.click(button)
    expect(submit).not.toHaveBeenCalled()
  })

  it('submits when ready and preserves a caller-provided accessible name', () => {
    const submit = vi.fn()
    render(() => <GenerateButton isReady aria-label="Generate project" onClick={submit} />)

    const button = screen.getByRole('button', { name: 'Generate project' })
    expect(button.getAttribute('data-ready')).toBe('true')
    fireEvent.click(button)
    expect(submit).toHaveBeenCalledOnce()
  })

  it('announces generation and replaces the arrow with progress', () => {
    const { container } = render(() => <GenerateButton isReady isGenerating disabled />)

    const button = screen.getByRole('button', { name: 'Generating' })
    expect(button.getAttribute('aria-busy')).toBe('true')
    expect(button.getAttribute('data-generating')).toBe('true')
    expect(container.querySelector('svg')).toBeNull()
    expect(container.querySelector('.generate-button__spinner')).not.toBeNull()
  })
})
