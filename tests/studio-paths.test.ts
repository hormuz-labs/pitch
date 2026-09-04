import { describe, expect, it } from 'vitest'
import {
  internalName,
  isValidProjectName,
  ownsInternal,
  parseInternal,
  slugify,
  workspaceFor,
} from '../apps/studio/src/studio/paths'

describe('studio workspace naming', () => {
  it('keeps the historical launch-video layout and prefixes other flows', () => {
    expect(internalName('launch-video', 'user_1', 'acme')).toBe('user_1--acme')
    expect(internalName('deck', 'user_1', 'q3-review')).toBe('deck--user_1--q3-review')
  })

  it('round-trips through parseInternal', () => {
    for (const [flow, name] of [
      ['launch-video', 'acme'],
      ['demo-video', 'acme-demo'],
      ['deck', 'q3'],
      ['recording-edit', 'walkthrough'],
    ] as const) {
      const ws = workspaceFor(flow, 'user_9', name)
      expect(parseInternal(ws.internal)).toMatchObject({ flow, userId: 'user_9', name })
    }
    expect(parseInternal('not-a-workspace')).toBeNull()
    expect(parseInternal('mystery--user_1--x')).toBeNull()
  })

  it('isolates directories per user', () => {
    expect(ownsInternal('user_1', 'user_1--acme')).toBe(true)
    expect(ownsInternal('user_2', 'user_1--acme')).toBe(false)
    expect(ownsInternal('user_1', 'deck--user_1--q3')).toBe(true)
    expect(ownsInternal('user_1', 'deck--user_2--q3')).toBe(false)
  })

  it('rejects names that could escape projects/', () => {
    expect(isValidProjectName('acme-launch')).toBe(true)
    expect(isValidProjectName('..')).toBe(false)
    expect(isValidProjectName('a/b')).toBe(false)
    expect(isValidProjectName('a--b')).toBe(false)
    expect(isValidProjectName('.hidden')).toBe(false)
  })

  it('slugifies prompts around the product host', () => {
    expect(slugify('A launch video for https://www.acme.io/pricing today')).toBe(
      'launch-acme-io-today',
    )
    expect(slugify('Make a deck about quarterly revenue growth')).toBe(
      'deck-quarterly-revenue-growth',
    )
    expect(slugify('!!!', 'fallback')).toBe('fallback')
  })
})
