import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      // The real plugin runtime only exists inside the OpenCode process the
      // worker spawns per job, so it is not in node_modules. Alias it to a
      // stub so `.opencode/tools/*.ts` can be imported and unit-tested.
      '@opencode-ai/plugin': path.resolve(__dirname, 'tests/stubs/opencode-plugin.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Run tests sequentially — many share mocked module state
    sequence: { concurrent: false },
    testTimeout: 15000,
  },
})
