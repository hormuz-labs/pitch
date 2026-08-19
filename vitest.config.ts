import { configDefaults, defineConfig } from 'vitest/config'

// Two test tiers in ONE config, via vitest projects:
//   • unit        — fast, pure, no browser (everything except tests/integration/)
//   • integration — browser-driven (playwright-cli), slow, serial
// Select with `vitest --project unit` / `--project integration` (see package.json
// scripts). Running bare `vitest` runs both.
export default defineConfig({
  test: {
    projects: [
      {
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
