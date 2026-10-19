import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: { outDir: 'dist', chunkSizeWarningLimit: 2000 },
  test: { include: ['src/**/*.test.ts'] },
});
