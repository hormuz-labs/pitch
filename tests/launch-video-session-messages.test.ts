import { describe, expect, it } from 'vitest'
import {
  describeLaunchVideoToolActivity,
  launchVideoActivityStage,
} from '../apps/web/src/launch-video/activity'
import {
  mergeSessionChat,
  sessionChatSnapshot,
} from '../apps/web/src/launch-video/session-messages'

describe('launch-video persisted scene chat', () => {
  it('rebuilds scene chat from user prefixes and assistant parent IDs', () => {
    const snapshot = sessionChatSnapshot([
      {
        info: { id: 'initial', role: 'user', time: { created: 1 } },
        parts: [{ id: 'p0', type: 'text', text: 'Create a launch video' }],
      },
      {
        info: { id: 'edit-user', role: 'user', time: { created: 2 } },
        parts: [{ id: 'p1', type: 'text', text: 'Update scene1: use the original font' }],
      },
      {
        info: { id: 'edit-tool', role: 'assistant', parentID: 'edit-user', time: { created: 3 } },
        parts: [
          {
            id: 'p2',
            type: 'tool',
            tool: 'edit',
            state: { status: 'completed', input: {} },
          },
        ],
      },
      {
        info: {
          id: 'edit-answer',
          role: 'assistant',
          parentID: 'edit-user',
          time: { created: 4, completed: 5 },
        },
        parts: [{ id: 'p3', type: 'text', text: 'The original font is now applied.' }],
      },
    ])

    expect(snapshot.messages.map(message => Object.values(message.partTexts).join(''))).toEqual([
      'Create a launch video',
    ])
    expect(
      snapshot.sceneMessages
        .get('scene1')
        ?.map(message => Object.values(message.partTexts).join('')),
    ).toEqual([
      'use the original font',
      '✓ Updating scene files',
      'The original font is now applied.',
    ])
  })

  it('keeps an optimistic message only until the persisted copy arrives', () => {
    const local = {
      id: 'local-1',
      role: 'user' as const,
      partTexts: { local: 'change the font' },
    }
    const saved = {
      id: 'saved-1',
      role: 'user' as const,
      partTexts: { saved: 'change the font' },
    }

    expect(mergeSessionChat([local], [])).toEqual([local])
    expect(mergeSessionChat([local], [saved])).toEqual([saved])
  })

  it('turns live render tools into meaningful progress stages', () => {
    const part = {
      tool: 'bash',
      state: {
        status: 'running',
        input: { command: 'node capture.mjs index.html --from=0 --to=6.3' },
      },
    }
    const activity = describeLaunchVideoToolActivity(part)
    expect(activity).toBe('Rendering the scene preview…')
    expect(launchVideoActivityStage(activity)).toEqual({ label: 'Scene preview', progress: 58 })
  })
})
