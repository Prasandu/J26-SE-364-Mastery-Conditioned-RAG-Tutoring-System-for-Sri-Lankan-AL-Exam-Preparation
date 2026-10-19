import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // Read VITE_* variables from the repository-root .env (only VITE_* keys reach the browser).
  envDir: '../..',
  server: { port: 5173, strictPort: true },
  // M1 technical debt: the lazily loaded 3D chunk (~0.9 MB minified, mostly three.js) and the main
  // bundle exceed Vite's 500 kB default. No bundle analysis has been done yet; see docs/STATUS.md.
  build: { chunkSizeWarningLimit: 1000 },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // Full-page jsdom flows are slow only when the whole suite runs in parallel.
    testTimeout: 15_000,
  },
});
