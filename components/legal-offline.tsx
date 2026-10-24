// Shown at /terms and /privacy while the documents are being revised (lib/legal.ts).
export function LegalOffline({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-page px-6 py-10">
      <h1 className="font-display text-title">{title}</h1>
      <p className="mt-4">This document is being revised and will be published again shortly.</p>
    </div>
  );
}
