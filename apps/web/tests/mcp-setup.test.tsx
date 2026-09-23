import { fireEvent, render, screen } from '@solidjs/testing-library'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { API_URL, MCP_URL, McpSetup } from '../src/solid/public/McpSetup'

describe('McpSetup', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(async () => undefined) },
    })
  })

  it('renders accessible client tabs and valid Claude setup instructions', () => {
    const { container } = render(() => <McpSetup instant />)

    expect(screen.getAllByRole('tab')).toHaveLength(8)
    expect(screen.getByRole('tab', { name: 'Claude' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tabpanel')).not.toBeNull()

    const command = container.querySelector('.mcp-code')?.textContent ?? ''
    expect(command).toContain(`  ${MCP_URL} \\`)
    expect(command).toContain('Authorization: Bearer pk_your_key')
    expect(command).not.toContain('\n+')
  })

  it('shows the current one-studio REST contract without legacy flow guidance', () => {
    render(() => <McpSetup instant />)
    fireEvent.click(screen.getByRole('tab', { name: 'API' }))

    expect(screen.getByText('use the pitch rest api')).not.toBeNull()
    expect(screen.getAllByText(new RegExp(`${API_URL}/projects`))).toHaveLength(2)
    expect(screen.getByText(/Creation, prompts, and exports are usage-metered/)).not.toBeNull()
    expect(document.body.textContent).not.toContain('"flow"')
    expect(document.body.textContent).not.toContain('Follow-up prompts are free')
  })

  it('copies both endpoint URLs and commands', () => {
    const { container } = render(() => <McpSetup instant />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy command' }))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('claude mcp add --transport http pitch'),
    )

    fireEvent.click(screen.getByRole('tab', { name: 'ChatGPT' }))
    fireEvent.click(screen.getByRole('button', { name: 'Copy MCP URL' }))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(MCP_URL)
    expect(container.querySelector('.mcp-setup')).not.toBeNull()
  })
})
