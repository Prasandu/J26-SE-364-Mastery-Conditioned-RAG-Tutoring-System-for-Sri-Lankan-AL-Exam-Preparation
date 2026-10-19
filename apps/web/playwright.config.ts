import { defineConfig } from '@playwright/test';

/**
 * Real-browser checks for the laboratory. Uses the locally installed Google Chrome (`channel:
 * 'chrome'`), so no Playwright browser download is needed. The app runs with the offline engine;
 * nothing here calls the API, a database or an AI provider.
 */
const PORT = 5198;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel: 'chrome',
    headless: true,
    launchOptions: {
      // Software WebGL so the 3D renderer is exercised on machines without a usable GPU.
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'tablet', use: { viewport: { width: 834, height: 1112 }, hasTouch: true } },
    {
      name: 'mobile',
      use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
    },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { VITE_ENGINE_ADAPTER: 'local' },
  },
});
