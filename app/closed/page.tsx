// The closed notice after shutdown (app-flow.md, Scheduled jobs: Shutdown).
import Link from "next/link";
import { DoorClosed } from "lucide-react";
import { ICON } from "@/components/ui/icon-button";
import { Standalone } from "@/components/ui/standalone";
import { CONTACT } from "@/lib/legal";

export default function Closed() {
  const contact = process.env.CONTACT_EMAIL || CONTACT;
  return (
    <Standalone
      icon={<DoorClosed {...ICON} />}
      title="Cadmium has closed"
      description="Sign-in is no longer available. Stored data may be deleted at any time."
      footer={
        <nav aria-label="Legal" className="flex flex-wrap gap-x-6 gap-y-2">
          <Link href="/terms" className="hover:text-ink hover:underline">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-ink hover:underline">
            Privacy
          </Link>
          <Link href="/attribution" className="hover:text-ink hover:underline">
            Attribution
          </Link>
        </nav>
      }
    >
      {contact && (
        <p>
          To request a copy or the deletion of your data, write to{" "}
          <a href={`mailto:${contact}`} className="font-medium text-accent underline">
            {contact}
          </a>
          .
        </p>
      )}
    </Standalone>
  );
}
