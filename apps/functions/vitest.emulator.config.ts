import { defineConfig } from 'vitest/config';

// Runs against the Firebase emulators (see root `npm run test:emulator`).
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
