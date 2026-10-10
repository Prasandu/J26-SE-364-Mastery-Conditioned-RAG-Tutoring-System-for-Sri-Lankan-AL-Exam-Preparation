import { defineConfig } from 'vite';

/** Bundles the verifier CLI (engine + contracts + zod) into one self-contained Node ES module. */
export default defineConfig({
  build: {
    ssr: 'cli/verifier.ts',
    outDir: 'dist',
    emptyOutDir: true,
    target: 'node22',
    minify: false,
    rollupOptions: { output: { entryFileNames: 'verifier.mjs', format: 'es' } },
  },
  ssr: { noExternal: true },
});
