/**
 * The floating glass shape in the hero.
 *
 * Layered radial gradients with a blur behind them read as blown glass, and cost
 * nothing to load. Decoration only, so it is hidden from screen readers.
 */
export function GlassOrb({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 320" className={className} aria-hidden="true" role="presentation">
      <defs>
        <radialGradient id="orb-body" cx="38%" cy="32%" r="78%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="38%" stopColor="#97cadb" stopOpacity="0.8" />
          <stop offset="72%" stopColor="#018abe" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#02457a" stopOpacity="0.9" />
        </radialGradient>
        <radialGradient id="orb-sheen" cx="32%" cy="24%" r="34%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="orb-ribbon" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#d6e8ee" stopOpacity="0.9" />
          <stop offset="55%" stopColor="#018abe" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.2" />
        </linearGradient>
        <filter id="orb-soft" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
        <filter id="orb-haze" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>

      {/* Glow behind the glass */}
      <circle cx="160" cy="158" r="112" fill="#018abe" opacity="0.28" filter="url(#orb-soft)" />

      {/* Loose shapes drifting around it */}
      <ellipse
        cx="54"
        cy="206"
        rx="20"
        ry="13"
        fill="#97cadb"
        opacity="0.55"
        transform="rotate(-25 54 206)"
      />
      <ellipse
        cx="268"
        cy="92"
        rx="15"
        ry="10"
        fill="#018abe"
        opacity="0.45"
        transform="rotate(20 268 92)"
      />
      <circle cx="248" cy="238" r="9" fill="#02457a" opacity="0.35" />
      <circle cx="74" cy="74" r="6" fill="#018abe" opacity="0.5" />

      {/* The body */}
      <circle cx="160" cy="156" r="96" fill="url(#orb-body)" />

      {/* A ribbon of colour folded inside */}
      <path
        d="M96 172c18-46 62-70 104-54 26 10 38 34 30 58-9 27-40 44-74 40-32-4-50-20-60-44z"
        fill="url(#orb-ribbon)"
        filter="url(#orb-haze)"
        opacity="0.85"
      />

      {/* Highlights */}
      <ellipse
        cx="124"
        cy="112"
        rx="42"
        ry="30"
        fill="url(#orb-sheen)"
        transform="rotate(-24 124 112)"
      />
      <ellipse
        cx="206"
        cy="208"
        rx="20"
        ry="9"
        fill="#ffffff"
        opacity="0.35"
        transform="rotate(-18 206 208)"
      />
      <circle
        cx="160"
        cy="156"
        r="96"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.45"
        strokeWidth="1.5"
      />
    </svg>
  );
}
