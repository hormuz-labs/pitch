import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { describe, expect, it } from 'vitest'
import { SlidingNumber } from '../src/solid/common/SlidingNumber'

describe('SlidingNumber', () => {
  it('renders formatted rolling digits and responds to balance changes', () => {
    const [number, setNumber] = createSignal(802591)
    const { container } = render(() => <SlidingNumber number={number()} />)
    expect(container.querySelector('.sliding-number')?.getAttribute('aria-label')).toBe('802591')
    expect(container.querySelectorAll('.sliding-number__digit')).toHaveLength(6)
    expect(container.querySelectorAll('.sliding-number__separator')).toHaveLength(1)
    expect(container.querySelector<HTMLElement>('.sliding-number')?.style.overflow).toBe('hidden')
    expect(container.querySelector<HTMLElement>('.sliding-number__digit')?.style.overflow).toBe(
      'hidden',
    )
    expect(container.querySelector('.sliding-number__separator .sliding-number__track')).toBeNull()

    setNumber(799250)
    expect(container.querySelector('.sliding-number')?.getAttribute('aria-label')).toBe('799250')
    expect(container.querySelectorAll('.sliding-number__digit')).toHaveLength(6)
  })

  it('clips each rolling digit to a single line in the credit marker', () => {
    const css = readFileSync(resolve(process.cwd(), 'apps/web/src/studio/studio.css'), 'utf8')
    expect(css).toMatch(
      /\.composer-credits \.sliding-number\s*\{[^}]*height:\s*1em;[^}]*overflow:\s*hidden;[^}]*line-height:\s*1;/s,
    )
    expect(css).toMatch(
      /\.composer-credits \.sliding-number__digit\s*\{[^}]*height:\s*1em;[^}]*overflow:\s*hidden;/s,
    )
    expect(css).toMatch(
      /\.composer-credits \.sliding-number__track\s*\{[^}]*position:\s*absolute;[^}]*height:\s*10em;/s,
    )
  })
})
