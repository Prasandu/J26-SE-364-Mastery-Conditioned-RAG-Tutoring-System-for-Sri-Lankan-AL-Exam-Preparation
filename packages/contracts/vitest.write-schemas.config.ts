import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { include: ['scripts/write-schemas.test.ts'] } });
