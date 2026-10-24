// The Cadmium mark: the element's periodic-table tile with its symbol, Cd, drawn like a Lucide icon
// (24-unit grid, round-capped 2-unit stroke, a rounded square like Lucide's `square`) with the symbol
// centred in the system font, in the accent colour, which follows light and dark mode. app/icon.svg
// draws the same. Decorative beside the product name; named when alone.

const SYSTEM_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export function LogoMark({ size = 28, strokeWidth = 2, title }: { size?: number; strokeWidth?: number; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className="shrink-0 text-accent"
    >
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <text x="12" y="12.5" textAnchor="middle" dominantBaseline="central" fill="currentColor" stroke="none" fontFamily={SYSTEM_FONT} fontSize="9.5" fontWeight="600" letterSpacing="-0.2">
        Cd
      </text>
    </svg>
  );
}

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark />
      <span className="text-heading font-semibold tracking-tight text-ink" style={{ fontFamily: SYSTEM_FONT }}>
        Cadmium
      </span>
    </span>
  );
}
