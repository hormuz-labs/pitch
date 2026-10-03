import { SessionManager } from '@earendil-works/pi-coding-agent'
import { describe, expect, it } from 'vitest'
import { sessionEntriesFromTranscript } from '../apps/api/src/studio/session.js'

const userMessage = (content: string, timestamp: number) =>
  ({ role: 'user', content: [{ type: 'text', text: content }], timestamp }) as any

const assistantMessage = (text: string, timestamp: number) =>
  ({
    role: 'assistant',
    content: [{ type: 'text', text }],
    provider: 'test',
    model: 'test',
    usage: { cost: { total: 0 } },
    stopReason: 'stop',
    timestamp,
  }) as any

describe('studio transcript projection', () => {
  it('restores the active branch with display text and checkpoint ids', () => {
    const manager = SessionManager.inMemory('/workspace')
    const first = manager.appendMessage(
      userMessage('<studio-context>\nfiles\n</studio-context>\n\nMake a deck', 1),
    )
    manager.appendMessage(assistantMessage('First result', 2))
    const second = manager.appendMessage(userMessage('Change the title', 3))
    manager.appendMessage(assistantMessage('Changed', 4))
    const turns = new Map([
      [first, { entryId: first, uiId: 'e1', text: 'Make a deck', checkpointId: 'one', at: 1 }],
      [
        second,
        { entryId: second, uiId: 'e2', text: 'Change the title', checkpointId: 'two', at: 3 },
      ],
    ])

    expect(sessionEntriesFromTranscript(manager, turns)).toMatchObject([
      { id: 'e1', role: 'user', text: 'Make a deck', sessionEntryId: first, checkpointId: 'one' },
      { role: 'assistant', text: 'First result' },
      {
        id: 'e2',
        role: 'user',
        text: 'Change the title',
        sessionEntryId: second,
        checkpointId: 'two',
      },
      { role: 'assistant', text: 'Changed' },
    ])
  })

  it('keeps a rollback branch active after a marker is appended', () => {
    const manager = SessionManager.inMemory('/workspace')
    manager.appendMessage(userMessage('First', 1))
    const firstAnswer = manager.appendMessage(assistantMessage('Done', 2))
    const second = manager.appendMessage(userMessage('Second', 3))
    manager.appendMessage(assistantMessage('Also done', 4))

    manager.branch(firstAnswer)
    manager.appendCustomEntry('pitch-rollback', { sessionEntryId: second })

    expect(sessionEntriesFromTranscript(manager, new Map()).map(entry => entry.text)).toEqual([
      'First',
      'Done',
    ])
  })

  it('marks an interrupted tool call as failed when restoring an idle session', () => {
    const manager = SessionManager.inMemory('/workspace')
    manager.appendMessage(userMessage('Build it', 1))
    manager.appendMessage({
      ...assistantMessage('', 2),
      content: [{ type: 'toolCall', id: 'tool-1', name: 'bash', arguments: { command: 'build' } }],
    } as any)

    expect(sessionEntriesFromTranscript(manager, new Map()).at(-1)).toMatchObject({
      role: 'tool',
      tool: { name: 'bash', status: 'error' },
    })
  })

  it('shows the failed model call that ended a turn, not the ones pi retried past', () => {
    const manager = SessionManager.inMemory('/workspace')
    const failed = (errorMessage: string, timestamp: number) =>
      ({
        ...assistantMessage('', timestamp),
        content: [],
        stopReason: 'error',
        errorMessage,
      }) as any
    manager.appendMessage(userMessage('First', 1))
    manager.appendMessage(failed('overloaded', 2))
    manager.appendMessage(assistantMessage('Done', 3))
    manager.appendMessage(userMessage('Second', 4))
    manager.appendMessage(failed('API key auth failed', 5))

    expect(sessionEntriesFromTranscript(manager, new Map()).map(entry => entry.text)).toEqual([
      'First',
      'Done',
      'Second',
      '⚠ API key auth failed',
    ])
  })
})
