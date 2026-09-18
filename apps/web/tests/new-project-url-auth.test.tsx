import { render, screen } from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import type { JSX } from 'solid-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }))

vi.mock('@solidjs/router', () => ({
  A: (props: { href: string; children: JSX.Element }) => <a href={props.href}>{props.children}</a>,
  useNavigate: () => navigate,
}))

import { NewProjectUrlAuth } from '../src/solid/account/NewProjectUrlAuth'

describe('NewProjectUrlAuth', () => {
  beforeEach(() => {
    navigate.mockReset()
    sessionStorage.clear()
  })

  it('asks about authentication when the prompt contains a URL', () => {
    render(() => (
      <NewProjectUrlAuth
        prompt="Make a demo for https://app.example.com/dashboard"
        authenticatedOrigins={[]}
      />
    ))

    expect(screen.getByText('Does app.example.com need a login?')).not.toBeNull()
  })

  it('does not ask again when the domain already has a saved login', () => {
    render(() => (
      <NewProjectUrlAuth
        prompt="Make a demo for https://app.example.com/dashboard"
        authenticatedOrigins={['https://auth.example.com']}
      />
    ))

    expect(screen.queryByLabelText('Website authentication')).toBeNull()
  })

  it('dismisses a public site suggestion', async () => {
    render(() => (
      <NewProjectUrlAuth prompt="Make a launch film for example.com" authenticatedOrigins={[]} />
    ))

    await userEvent.click(screen.getByRole('button', { name: 'Public site' }))
    expect(screen.queryByLabelText('Website authentication')).toBeNull()
  })

  it('preserves the draft and opens authentication for the detected URL', async () => {
    const prompt = 'Record https://app.example.com/settings after login'
    render(() => <NewProjectUrlAuth prompt={prompt} authenticatedOrigins={[]} />)

    await userEvent.click(screen.getByRole('button', { name: 'Authenticate' }))

    expect(sessionStorage.getItem('pitch:new-project-auth-draft')).toBe(prompt)
    expect(navigate).toHaveBeenCalledWith(
      `/sessions?url=${encodeURIComponent('https://app.example.com/settings')}&from=new`,
    )
  })
})
