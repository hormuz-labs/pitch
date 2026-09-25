/**
 * The affiliate pages quote reward amounts from the web copy of the numbers;
 * the API pays out of its own config. They must never disagree.
 */

import { describe, expect, it } from 'vitest'
import {
  REFERRAL_REWARDS as API,
  CREDITS_PER_VIDEO as API_CREDITS_PER_VIDEO,
  SIGNUP_BONUS_CREDITS,
} from '../apps/api/src/config.js'
import { CREDITS_PER_VIDEO, REFERRAL_REWARDS as WEB } from '../apps/web/src/lib/referral.js'

describe('referral rewards', () => {
  it('quotes what the API actually pays the referrer', () => {
    expect(WEB.signup).toBe(API.referrerSignup)
    expect(WEB.purchase).toBe(API.referrerPurchase)
  })

  it('promises the referred user nothing, because the API grants nothing', () => {
    expect(API.newUserBonus).toBe(0)
    expect(SIGNUP_BONUS_CREDITS).toBe(0)
  })

  it('converts credits to videos at the demo-video rate', () => {
    expect(CREDITS_PER_VIDEO).toBe(120)
    expect(API_CREDITS_PER_VIDEO).toBe(CREDITS_PER_VIDEO)
  })
})
