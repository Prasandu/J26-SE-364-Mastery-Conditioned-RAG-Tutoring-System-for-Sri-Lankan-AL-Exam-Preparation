import './r1.css';
import { R1Stage } from './R1Stage';

/**
 * R1 — advanced simulation graphics proof-of-quality prototype (chemistry-lab-advanced-sim-r1).
 * Reachable only in a dev build at `/?r1=1` (see `App.tsx`); never mounted in production and
 * never replaces `LaboratoryViewport`. Exists purely so the new illustration/animation approach
 * can be visually compared against the shipped renderer before any decision to adopt it further.
 */
export function R1Prototype() {
  return (
    <div className="r1-page">
      <header className="r1-page__header">
        <h1>R1 prototype — advanced apparatus illustration</h1>
        <p>
          Isolated proof-of-quality prototype. Driven by the real deterministic engine (same local
          adapter as production); the production laboratory is unchanged and unaffected by this
          page.
        </p>
      </header>
      <R1Stage />
    </div>
  );
}
