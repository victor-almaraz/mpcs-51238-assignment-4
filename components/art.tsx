// Art in lists (design/components.md, Art: inventory, abilities, and lists request an icon and fall
// back to the default content icon for the kind). Images only, never inline SVG; alt text always.
import type { ArtSet } from "@/lib/engine/view";

export function ArtIcon({ art, size = 20 }: { art?: ArtSet; size?: number }) {
  const a = art?.icon ?? art?.portrait;
  if (!a?.hash) return <span aria-hidden className="inline-block text-center text-muted" style={{ width: size }}>◆</span>;
  // eslint-disable-next-line @next/next/no-img-element -- assets are served by hash with long-lived caching.
  return <img src={`/v1/assets/${a.hash}`} alt={a.alt} width={size} height={size} className="inline-block object-contain align-middle" />;
}
