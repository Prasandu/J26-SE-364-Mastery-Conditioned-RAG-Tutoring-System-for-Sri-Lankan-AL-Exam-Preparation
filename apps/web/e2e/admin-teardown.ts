import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

/** Removes the temporary admin data folder created for the admin browser checks. */
export default function teardown(): void {
  const dir = process.env.VLAB_ADMIN_E2E_DIR;
  if (dir && dir.startsWith(tmpdir()) && dir.includes('vlab-admin-e2e-')) {
    rmSync(dir, { recursive: true, force: true });
  }
}
