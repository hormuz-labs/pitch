import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'

const root = path.dirname(fileURLToPath(import.meta.url))
const generatedPrismaClient = path.resolve(root, 'packages/db/node_modules/@prisma/client')

/**
 * The bun workspace layout exposes one physical copy of a dependency at two
 * paths: node_modules/x for files under tests/, and apps/<app>/node_modules/x
 * for files under apps/. Vitest keys its mock registry by resolved id, so
 * `vi.mock('@clerk/express')` in a test never reached the copy that apps/api
 * loaded and the real getAuth ran instead. Collapsing both onto one id makes
 * bare-specifier mocks work.
 */
const dedupedAliases = {
  '@clerk/express': path.resolve(root, 'node_modules/@clerk/express'),
  '@clerk/react': path.resolve(root, 'node_modules/@clerk/react'),
  standardwebhooks: path.resolve(root, 'node_modules/standardwebhooks'),
  dodopayments: path.resolve(root, 'node_modules/dodopayments'),
  // Prisma is the same problem with one extra constraint: only the copy under
  // packages/db has been `prisma generate`d, so both ids must collapse onto
  // THAT one — pointing at the root copy makes unmocked tests fail to boot a
  // client. Some installs don't nest it at all, hence the existence check.
  ...(fs.existsSync(generatedPrismaClient) ? { '@prisma/client': generatedPrismaClient } : {}),
}

// Two test tiers in ONE config, via vitest projects:
//   • unit        — fast, pure, no browser (everything except tests/integration/)
//   • integration — browser-driven (playwright-cli), slow, serial
// Select with `vitest --project unit` / `--project integration` (see package.json
// scripts). Running bare `vitest` runs both.
export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias: dedupedAliases },
        test: {
          name: 'unit',
          globals: true,
          environment: 'node',
          include: ['tests/**/*.test.ts'],
          exclude: [...configDefaults.exclude, 'tests/integration/**'],
          // Run sequentially — many share mocked module state.
          sequence: { concurrent: false },
          testTimeout: 15000,
        },
      },
      {
        test: {
          name: 'integration',
          globals: true,
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          // A real browser, one session at a time — serial, generous timeouts.
          testTimeout: 60_000,
          hookTimeout: 60_000,
          fileParallelism: false,
          sequence: { concurrent: false },
        },
      },
    ],
  },
})
