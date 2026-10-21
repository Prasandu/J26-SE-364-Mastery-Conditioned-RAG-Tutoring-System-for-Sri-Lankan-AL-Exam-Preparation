import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Real-browser check of the admin console against the real API (development admin mode,
 * loopback only). Storage is a fresh temporary folder; embeddings are the deterministic fake
 * provider; no AI provider, network service or database is used. Uses the installed Chrome.
 */
const API = 8013;
const WEB = 5197;
process.env.VLAB_ADMIN_E2E_DIR ??= join(tmpdir(), `vlab-admin-e2e-${Date.now()}`);
const DATA = process.env.VLAB_ADMIN_E2E_DIR;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.admin-e2e.ts',
  outputDir: './final-screens/checkpoint-a',
  timeout: 120_000,
  workers: 1,
  reporter: [['list']],
  globalTeardown: './e2e/admin-teardown.ts',
  use: {
    baseURL: `http://127.0.0.1:${WEB}`,
    channel: 'chrome',
    headless: true,
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'laptop', use: { viewport: { width: 1366, height: 768 } } },
    {
      name: 'mobile',
      use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
    },
  ],
  webServer: [
    {
      command: `uv run uvicorn app.main:app --host 127.0.0.1 --port ${API}`,
      cwd: '../api',
      url: `http://127.0.0.1:${API}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        PYTHONIOENCODING: 'utf-8',
        LAB_ENVIRONMENT: 'development',
        LAB_ADMIN_MODE: 'development',
        LAB_ADMIN_DATA_DIR: DATA,
        LAB_EMBEDDING_PROVIDER: 'fake',
        LAB_KNOWLEDGE_MANIFEST: join(DATA, 'no-manifest.json'),
        LAB_LLM_PROVIDER: 'disabled',
        LAB_CORS_ORIGINS: `["http://127.0.0.1:${WEB}"]`,
      },
    },
    {
      command: `npx vite --port ${WEB} --strictPort --host 127.0.0.1`,
      url: `http://127.0.0.1:${WEB}`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { VITE_ENGINE_ADAPTER: 'api', VITE_API_BASE_URL: `http://127.0.0.1:${API}` },
    },
  ],
});
