// A member's answer to one session occurrence (api.md, rsvp): Yes, Maybe, and No, the current answer
// pressed and ticked. Used by the dashboard, the lobby, and the schedule.
import { Check } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { buttonClass } from "@/components/ui/button";
import { ICON_DENSE } from "@/components/ui/icon-button";
import { rsvpAction } from "@/lib/server/schedule-actions";
import { capitalize } from "@/lib/text";

export const RESPONSES = ["yes", "maybe", "no"] as const;
export type Response = (typeof RESPONSES)[number];

/** The user's answer to an occurrence, if any. */
export function answerOf(o: { rsvps: Record<Response, string[]> }, userId: string): Response | undefined {
  return RESPONSES.find((r) => o.rsvps[r].includes(userId));
}

export function Rsvp({ instanceId, occurrence: o, mine, label = "Your answer" }: { instanceId: string; occurrence: { session_id: string; occurrence_start: string }; mine: Response | undefined; label?: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      {RESPONSES.map((r) => (
        <ActionForm key={r} action={rsvpAction}>
          <input type="hidden" name="instance_id" value={instanceId} />
          <input type="hidden" name="session_id" value={o.session_id} />
          <input type="hidden" name="occurrence_start" value={o.occurrence_start} />
          <input type="hidden" name="response" value={r} />
          <button type="submit" aria-pressed={mine === r} className={mine === r ? buttonClass("quiet", "sm", "border border-accent bg-accent-soft") : buttonClass("secondary", "sm")}>
            {mine === r && <Check {...ICON_DENSE} />}
            {capitalize(r)}
          </button>
        </ActionForm>
      ))}
    </div>
  );
}
