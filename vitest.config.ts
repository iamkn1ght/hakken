import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // Real-DB integration tests share a single Postgres instance and a shared
    // table schema. Running test files in parallel produces races on TRUNCATE
    // / SELECT timing. Serialise file execution so each test file owns the
    // DB exclusively from its first beforeEach to its last afterAll.
    // Unit tests don't need this but pay no extra cost from it.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/db/migrations/**'],
    },
  },
});
