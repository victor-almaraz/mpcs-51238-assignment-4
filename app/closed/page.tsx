// The closed notice after shutdown (app-flow.md, Scheduled jobs: Shutdown).
import Link from "next/link";
import { CONTACT } from "@/lib/legal";

export default function Closed() {
  const contact = process.env.CONTACT_EMAIL || CONTACT;
  return (
    <div className="mx-auto max-w-page px-6 py-10">
      <h1 className="font-display text-title">Cadmium has closed</h1>
      <p className="mt-4">Sign-in is no longer available. Stored data may be deleted at any time.</p>
      {contact && (
        <p className="mt-2">
          To request a copy or the deletion of your data, write to <a href={`mailto:${contact}`} className="text-accent underline">{contact}</a>.
        </p>
      )}
      <p className="mt-6 flex gap-4 font-ui text-control">
        <Link href="/terms">Terms</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/attribution">Attribution</Link>
      </p>
    </div>
  );
}
