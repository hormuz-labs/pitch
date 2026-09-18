import { fireEvent, render, screen } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { describe, expect, it } from 'vitest'
import {
  SelectedSkillMode,
  type Skill,
  SkillPicker,
} from '../src/solid/account/NewProjectSkillPicker'

function Harness() {
  const [skill, setSkill] = createSignal<Skill | null>(null)
  return (
    <>
      <div class="composer-add">
        <button type="button" aria-label="Add files and preferences">
          +
        </button>
        <SelectedSkillMode skill={skill()} onClear={() => setSkill(null)} />
      </div>
      <SkillPicker skill={skill()} onSelect={setSkill} />
    </>
  )
}

describe('new project outcome selection', () => {
  it('shows the selected outcome inline beside the add control', () => {
    render(() => <Harness />)

    fireEvent.click(screen.getByRole('button', { name: 'Launch video' }))

    const selected = screen.getByRole('button', { name: 'Clear Launch video' })
    expect(selected.parentElement?.classList.contains('composer-add')).toBe(true)
    expect(selected.classList.contains('new-composer-mode')).toBe(true)
    expect(selected.querySelector('svg')).not.toBeNull()
    expect(selected.querySelector('.new-composer-mode__clear svg')).not.toBeNull()
  })

  it('updates the inline outcome and accessible pressed state when switching', () => {
    render(() => <Harness />)

    const launch = screen.getByRole('button', { name: 'Launch video' })
    const slides = screen.getByRole('button', { name: 'Slide deck' })
    fireEvent.click(launch)
    fireEvent.click(slides)

    expect(screen.queryByRole('button', { name: 'Clear Launch video' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Clear Slide deck' })).not.toBeNull()
    expect(launch.getAttribute('aria-pressed')).toBe('false')
    expect(slides.getAttribute('aria-pressed')).toBe('true')
  })

  it('clears the selected outcome from the inline hover/focus control', () => {
    render(() => <Harness />)
    const launch = screen.getByRole('button', { name: 'Launch video' })

    fireEvent.click(launch)
    fireEvent.click(screen.getByRole('button', { name: 'Clear Launch video' }))

    expect(screen.queryByRole('button', { name: 'Clear Launch video' })).toBeNull()
    expect(launch.getAttribute('aria-pressed')).toBe('false')
  })

  it('keeps the clear action accessible when mobile CSS hides the visible label', () => {
    render(() => <Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Product demo' }))

    const clear = screen.getByRole('button', { name: 'Clear Product demo' })
    expect(clear.querySelector('.new-composer-mode__icon')).not.toBeNull()
    expect(clear.querySelector('.new-composer-mode__clear')).not.toBeNull()
    fireEvent.click(clear)
    expect(screen.queryByRole('button', { name: 'Clear Product demo' })).toBeNull()
  })
})
