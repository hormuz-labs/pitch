/**
 * The credit ledger against real PostgreSQL: row locks, holds and concurrent
 * turns. Run against a disposable, migrated database named credit_ledger_test:
 *
 *   CREDIT_LEDGER_TEST_DATABASE_URL=postgresql://…/credit_ledger_test \
 *     bunx vitest run --project integration tests/integration/credit-ledger.integration.test.ts
 */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const databaseUrl = process.env.CREDIT_LEDGER_TEST_DATABASE_URL
const prefix = `ledger_test_${randomUUID()}`
let db: typeof import('../../packages/db/src/index.js')

describe.skipIf(!databaseUrl)('credit ledger PostgreSQL guarantees', () => {
  beforeAll(async () => {
    if (new URL(databaseUrl!).pathname !== '/credit_ledger_test') {
      throw new Error('Use a disposable database named credit_ledger_test')
    }
    vi.stubEnv('DATABASE_URL', databaseUrl!)
    db = await import('../../packages/db/src/index.js')
  })

  afterAll(async () => {
    if (db) {
      const where = { userId: { startsWith: prefix } }
      await db.prisma.creditReservation.deleteMany({ where })
      await db.prisma.creditTransaction.deleteMany({ where })
      await db.prisma.project.deleteMany({ where })
      await db.prisma.userProfile.deleteMany({ where: { id: { startsWith: prefix } } })
      await db.prisma.$disconnect()
    }
    vi.unstubAllEnvs()
  })

  let n = 0
  async function account(credits: number) {
    const id = `${prefix}_${++n}`
    await db.prisma.userProfile.create({ data: { id, email: `${id}@example.test` } })
    if (credits) await db.addCredits(id, credits, 'purchase', 'test grant')
    return id
  }

  async function hold(userId: string, project: string, credits: number, minCredits = 40) {
    const projectId = `${prefix}_${project}`
    await db.prisma.project.upsert({
      where: { id: projectId },
      create: { id: projectId, userId, flow: 'studio', name: projectId, title: project },
      update: {},
    })
    return db.reserveCredits({
      key: `${prefix}:${project}`,
      userId,
      projectId,
      kind: 'cinematic',
      credits,
      minCredits,
    })
  }

  it('L1 lets only one of two simultaneous jobs hold the same credits', async () => {
    const id = await account(300)
    const results = await Promise.allSettled([hold(id, 'l1a', 300), hold(id, 'l1b', 300)])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(await db.getAvailableCreditBalance(id)).toBe(0)
  })

  it('L2 shrinks a hold to the balance and refuses below the minimum', async () => {
    const id = await account(231)
    await expect(hold(id, 'l2a', 313)).resolves.toMatchObject({ credits: 231 })
    const low = await account(39)
    await expect(hold(low, 'l2b', 313)).rejects.toThrow('need 40')
  })

  it('L3 settles an overshoot to exactly zero, never below', async () => {
    const id = await account(300)
    await hold(id, 'l3', 300)
    const charged = await db.settleCreditReservation(`${prefix}:l3`, 500, { capAtAvailable: true })
    expect(charged).toBe(300)
    expect(await db.getCreditBalance(id)).toBe(0)
  })

  it('L4 charges a hold once even when settled twice at the same moment', async () => {
    const id = await account(1000)
    await hold(id, 'l4', 313)
    const results = await Promise.all([
      db.settleCreditReservation(`${prefix}:l4`, 200, { capAtAvailable: true }),
      db.settleCreditReservation(`${prefix}:l4`, 200, { capAtAvailable: true }),
    ])
    expect(results).toEqual([200, 200])
    expect(await db.getCreditBalance(id)).toBe(800)
  })

  it('L5 never goes below zero when many turns finish at once', async () => {
    const id = await account(100)
    const charged = await Promise.all(
      Array.from({ length: 5 }, () => db.deductUpTo(id, 40, 'Usage: race')),
    )
    expect(charged.reduce((a, b) => a + b, 0)).toBe(100)
    expect(await db.getCreditBalance(id)).toBe(0)
  })

  it('L6 does not spend credits another job is holding', async () => {
    const id = await account(100)
    await hold(id, 'l6', 70)
    expect(await db.deductUpTo(id, 50, 'Usage: follow-up')).toBe(30)
    expect(await db.getCreditBalance(id)).toBe(70)
    // The holding job can still settle what it held.
    expect(await db.settleCreditReservation(`${prefix}:l6`, 70, { capAtAvailable: true })).toBe(70)
    expect(await db.getCreditBalance(id)).toBe(0)
  })

  it('L7 gives a released hold back in full', async () => {
    const id = await account(500)
    await hold(id, 'l7', 313)
    expect(await db.getAvailableCreditBalance(id)).toBe(187)
    await db.releaseCreditReservation(`${prefix}:l7`)
    expect(await db.getAvailableCreditBalance(id)).toBe(500)
    expect(await db.getCreditBalance(id)).toBe(500)
  })

  it('L8 a settlement racing a follow-up charge still ends at zero, not below', async () => {
    const id = await account(100)
    await hold(id, 'l8', 60)
    const [settled, deducted] = await Promise.all([
      db.settleCreditReservation(`${prefix}:l8`, 90, { capAtAvailable: true }),
      db.deductUpTo(id, 90, 'Usage: follow-up'),
    ])
    expect(settled + deducted).toBe(100)
    expect(await db.getCreditBalance(id)).toBe(0)
  })

  it('L9 a fixed-price charge racing itself cannot overdraw', async () => {
    const id = await account(10)
    const results = await Promise.allSettled([
      db.deductCredit(id, 10, 'Browser authentication session'),
      db.deductCredit(id, 10, 'Browser authentication session'),
    ])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(await db.getCreditBalance(id)).toBe(0)
  })
})
