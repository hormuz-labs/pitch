/** Run against a disposable, migrated database named discord_reward_test. */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const databaseUrl = process.env.DISCORD_REWARD_TEST_DATABASE_URL
const prefix = `discord_reward_test_${randomUUID()}`
let db: typeof import('../../packages/db/src/index.js')

describe.skipIf(!databaseUrl)('Discord welcome reward PostgreSQL guarantees', () => {
  beforeAll(async () => {
    if (new URL(databaseUrl!).pathname !== '/discord_reward_test') {
      throw new Error('Use a disposable database named discord_reward_test')
    }
    vi.stubEnv('DATABASE_URL', databaseUrl!)
    db = await import('../../packages/db/src/index.js')
  })

  afterAll(async () => {
    if (db) {
      const where = { userId: { startsWith: prefix } }
      await db.prisma.discordRewardClaim.deleteMany({ where })
      await db.prisma.creditTransaction.deleteMany({ where })
      await db.prisma.userProfile.deleteMany({ where: { id: { startsWith: prefix } } })
      await db.prisma.$disconnect()
    }
    vi.unstubAllEnvs()
  })

  async function user(label: string) {
    const id = `${prefix}_${label}`
    await db.prisma.userProfile.create({ data: { id, email: `${id}@example.test` } })
    return id
  }

  it('grants exactly once across eight simultaneous claims', async () => {
    const id = await user('retries')
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        db.grantDiscordWelcomeReward(id, `${prefix}_discord1`, 'guild'),
      ),
    )
    expect(results.filter(result => result.granted)).toHaveLength(1)
    expect(await db.getCreditBalance(id)).toBe(120)
    expect(await db.prisma.discordRewardClaim.count({ where: { userId: id } })).toBe(1)
    expect(await db.prisma.creditTransaction.count({ where: { userId: id } })).toBe(1)
  })

  it('lets only one Pitch account claim with the same Discord identity', async () => {
    const ids = await Promise.all([user('owner1'), user('owner2')])
    const results = await Promise.all(
      ids.map(id => db.grantDiscordWelcomeReward(id, `${prefix}_shared_discord`, 'guild')),
    )
    expect(results.filter(result => result.granted)).toHaveLength(1)
    const balances = await Promise.all(ids.map(id => db.getCreditBalance(id)))
    expect(balances.sort((a, b) => a - b)).toEqual([0, 120])
  })

  it('lets a Pitch account claim only once while two Discord links race', async () => {
    const id = await user('two_links')
    const results = await Promise.all([
      db.grantDiscordWelcomeReward(id, `${prefix}_link1`, 'guild'),
      db.grantDiscordWelcomeReward(id, `${prefix}_link2`, 'guild'),
    ])
    expect(results.filter(result => result.granted)).toHaveLength(1)
    expect(await db.getCreditBalance(id)).toBe(120)
  })

  it('rolls back the credit write if receipt creation fails, allowing a clean retry', async () => {
    const id = await user('rollback')
    await expect(
      db.grantDiscordWelcomeReward(id, `${prefix}_rollback`, undefined as unknown as string),
    ).rejects.toThrow()
    expect(await db.getCreditBalance(id)).toBe(0)
    expect(await db.prisma.discordRewardClaim.count({ where: { userId: id } })).toBe(0)
    expect((await db.grantDiscordWelcomeReward(id, `${prefix}_rollback`, 'guild')).granted).toBe(
      true,
    )
    expect(await db.getCreditBalance(id)).toBe(120)
  })

  it('retains the Discord claim after account deletion and blocks reuse', async () => {
    const original = await user('deleted')
    const discordId = `${prefix}_retained`
    await db.grantDiscordWelcomeReward(original, discordId, 'guild')
    await db.prisma.creditTransaction.deleteMany({ where: { userId: original } })
    await db.prisma.userProfile.delete({ where: { id: original } })

    const replacement = await user('replacement')
    expect((await db.grantDiscordWelcomeReward(replacement, discordId, 'guild')).granted).toBe(
      false,
    )
    expect(await db.getCreditBalance(replacement)).toBe(0)
    expect(await db.prisma.discordRewardClaim.count({ where: { userId: original } })).toBe(1)
  })
})
