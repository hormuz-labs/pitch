/**
 * The new-project screen decides whether to warn about credits before the API
 * refuses; both sides must use the same start minimum, or the screen invites
 * a request that fails (or blocks one that would work).
 */
import { describe, expect, it } from 'vitest'
import { MIN_BALANCE } from '../apps/api/src/projects/usage.js'
import {
  creditsNeededToStart,
  START_MIN_CREDITS,
  DISCORD_WELCOME_CREDITS as WEB_WELCOME,
} from '../apps/web/src/lib/plans.js'
import { DISCORD_WELCOME_CREDITS } from '../packages/db/src/index.js'

describe('start minimum', () => {
  it('is the same number on the screen and on the server', () => {
    expect(START_MIN_CREDITS).toBe(MIN_BALANCE)
  })

  it('advertises the Discord welcome amount the server actually grants', () => {
    expect(WEB_WELCOME).toBe(DISCORD_WELCOME_CREDITS)
    expect(DISCORD_WELCOME_CREDITS).toBe(1500)
  })

  it('asks for the difference only below the minimum', () => {
    expect(creditsNeededToStart(12)).toBe(28)
    expect(creditsNeededToStart(39)).toBe(1)
    expect(creditsNeededToStart(40)).toBe(0)
    expect(creditsNeededToStart(231)).toBe(0)
  })

  it('never blocks on an estimate: a big balance or an unknown one needs nothing', () => {
    expect(creditsNeededToStart(1_000_000)).toBe(0)
    expect(creditsNeededToStart(null)).toBe(0)
  })

  it('treats an empty or overdrawn balance as needing the whole minimum', () => {
    expect(creditsNeededToStart(0)).toBe(40)
    expect(creditsNeededToStart(-5)).toBe(40)
  })
})
