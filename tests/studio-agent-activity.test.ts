import { describe, expect, it } from 'vitest'
import { agentActivity } from '../apps/web/src/solid/studio/agent-activity'
import type { Entry } from '../apps/web/src/solid/studio/types'

const prompt: Entry = { id: 'user', role: 'user', text: 'Create a launch video' }
const search: Entry = {
  id: 'search',
  role: 'tool',
  text: 'Searching',
  tool: { name: 'media_search', status: 'running' },
}
const question: Entry = {
  id: 'question',
  role: 'question',
  text: '',
  ask: { questions: [] },
}

describe('studio agent activity', () => {
  it('recognizes lookups dispatched through the studio pitch CLI', () => {
    const shell: Entry = {
      id: 'shell',
      role: 'tool',
      text: 'bash · pitch motion recon --url https://example.com',
      tool: { name: 'bash', status: 'running' },
    }
    expect(agentActivity([prompt, shell], true)).toBe('searching')
    expect(
      agentActivity([prompt, { ...shell, text: 'bash · pitch icons search slack' }], true),
    ).toBe('searching')
    expect(agentActivity([prompt, { ...shell, text: 'bash · pitch motion render' }], true)).toBe(
      'solving',
    )
  })

  it('follows a turn from receiving the request through lookup, creation, and completion', () => {
    expect(agentActivity([], true)).toBe('listening')
    expect(agentActivity([prompt], true)).toBe('listening')
    expect(agentActivity([prompt, search], true)).toBe('searching')
    const done: Entry = { ...search, tool: { name: 'media_search', status: 'done' } }
    expect(agentActivity([prompt, done], true)).toBe('solving')
    expect(agentActivity([prompt, done], false)).toBeNull()
  })

  it('keeps listening for unanswered questions after the agent ends its turn', () => {
    const ending: Entry = { id: 'ending', role: 'assistant', text: 'Which product should I cover?' }
    expect(agentActivity([prompt, question, ending], false)).toBe('listening')
    expect(agentActivity([prompt, question, ending, { ...prompt, id: 'answer' }], true)).toBe(
      'listening',
    )
    expect(agentActivity([prompt, question, ending, { ...prompt, id: 'answer' }], false)).toBeNull()
  })

  it('ignores queued and cancelled follow-ups when describing active work', () => {
    expect(
      agentActivity([prompt, search, { ...prompt, id: 'queued', pending: 'queued' }], true),
    ).toBe('searching')
    expect(
      agentActivity([prompt, search, { ...prompt, id: 'cancelled', pending: 'cancelled' }], true),
    ).toBe('searching')
  })

  it('does not reuse stale tools from a previous turn', () => {
    expect(agentActivity([prompt, search, { ...prompt, id: 'next' }], true)).toBe('listening')
    expect(agentActivity([prompt, search], false)).toBeNull()
  })

  it('keeps searching while a lookup runs alongside generation', () => {
    const render: Entry = {
      id: 'render',
      role: 'tool',
      text: 'Rendering',
      tool: { name: 'motion_render', status: 'running' },
    }
    expect(agentActivity([prompt, render], true)).toBe('solving')
    expect(agentActivity([prompt, search, render], true)).toBe('searching')
  })
})
