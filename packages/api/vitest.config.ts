import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Route tests need MySQL; they self-skip when TEST_DATABASE_URL is unset.
    testTimeout: 20_000,
    fileParallelism: false,
  },
});
