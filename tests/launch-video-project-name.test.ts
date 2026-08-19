import { describe, expect, it } from 'vitest'
import {
  launchVideoDisplayName,
  launchVideoProjectName,
  websiteHostFromPrompt,
} from '../apps/web/src/launch-video/project-name'

describe('launch-video project naming', () => {
  it('prefers the target website host over generic prompt words', () => {
    expect(websiteHostFromPrompt('Make a launch video for siodelhi.org')).toBe('siodelhi.org')
    expect(launchVideoProjectName('Make a launch video for siodelhi.org', [])).toBe('siodelhi.org')
    expect(launchVideoProjectName('Show https://www.example.com/pricing', [])).toBe('example.com')
  })

  it('adds a suffix when the website already has a project', () => {
    expect(launchVideoProjectName('A second video for siodelhi.org', ['siodelhi.org'])).toBe(
      'siodelhi.org-2',
    )
  })

  it('shows the target website on dashboard cards without relying on the internal name', () => {
    expect(
      launchVideoDisplayName({
        prompt: 'Make a launch video for siodelhi.org',
        projectName: 'make-launch-video-for',
      }),
    ).toBe('siodelhi.org')
    expect(launchVideoDisplayName({ projectName: 'legacy-project' })).toBe('legacy-project')
  })

  it('falls back to a short prompt slug when no website is present', () => {
    expect(launchVideoProjectName('Launch the new analytics dashboard', [])).toBe(
      'launch-the-new-analytics',
    )
  })
})
