import { render, screen } from '@solidjs/testing-library'
import { describe, expect, it } from 'vitest'
import { ComposerShell } from '../src/solid/common/ComposerShell'

describe('ComposerShell', () => {
  it('renders shared content and two responsive control groups', () => {
    const { container } = render(() => (
      <ComposerShell
        class="specific-composer"
        footerClass="specific-footer"
        leadingClass="specific-leading"
        trailingClass="specific-trailing"
        leading={<button>Attach</button>}
        trailing={<button>Send</button>}
      >
        <textarea aria-label="Prompt" />
      </ComposerShell>
    ))

    expect(screen.getByLabelText('Prompt')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Attach' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy()
    expect(container.querySelector('.composer-shell.specific-composer')).toBeTruthy()
    expect(container.querySelector('.composer-shell__footer.specific-footer')).toBeTruthy()
    expect(container.querySelector('.composer-shell__leading.specific-leading')).toBeTruthy()
    expect(container.querySelector('.composer-shell__trailing.specific-trailing')).toBeTruthy()
  })

  it('exposes invalid state without changing its reusable structure', () => {
    const { container } = render(() => (
      <ComposerShell invalid leading={<span>Left</span>} trailing={<span>Right</span>}>
        Body
      </ComposerShell>
    ))

    expect(container.querySelector('.composer-shell.invalid')).toBeTruthy()
    expect(container.querySelectorAll('.composer-shell__group')).toHaveLength(2)
  })
})
