import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url))
    }
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/globalSetup.ts'],
    setupFiles: ['test/setup.ts'],
    pool: 'forks',
    fileParallelism: false,
    teardownTimeout: 30000,
    testTimeout: 60000,
    hookTimeout: 180000,
    env: {
      NODE_ENV: 'test'
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'prisma/client/**',
        'dist/**',
        'coverage/**',
        'test/**',
        'scripts/**',
        'types/**',
        '**/*.config.*',
        '**/*.d.ts'
      ]
    }
  }
});
