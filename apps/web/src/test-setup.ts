import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Test boundary only: jsdom has no WebGL. Returning null exercises the production fallback path.
HTMLCanvasElement.prototype.getContext = (() =>
  null) as typeof HTMLCanvasElement.prototype.getContext;

afterEach(() => {
  cleanup();
  document.documentElement.lang = '';
});
