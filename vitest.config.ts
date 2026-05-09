import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Run tests sequentially — many share mocked module state
    sequence: { concurrent: false },
    testTimeout: 15000,
  },
});
