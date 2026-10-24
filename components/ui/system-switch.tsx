// The rules-system choice at the top of a form whose fields depend on the system (new campaign, new
// adventure): one link per system, the current one marked, with its credit line underneath.
import { Check } from "lucide-react";
import Link from "next/link";
import { cx } from "./cx";
import { ICON_DENSE } from "./icon-button";

export function SystemSwitch({ systems, current, base, label = "System" }: { systems: { id: string; title: string; credit: string }[]; current: string; base: string; label?: string }) {
  const chosen = systems.find((s) => s.id === current);
  return (
    <div className="flex flex-col gap-2">
      <p id="system-switch-label" className="text-label font-medium text-ink">
        {label}
      </p>
      <nav aria-labelledby="system-switch-label">
        <ul className="flex flex-wrap gap-2">
          {systems.map((s) => {
            const on = s.id === current;
            return (
              <li key={s.id}>
                <Link
                  href={`${base}${s.id}`}
                  aria-current={on ? "true" : undefined}
                  className={cx("inline-flex h-10 items-center gap-2 rounded-control border px-4 text-control font-medium", on ? "border-accent bg-accent-soft text-accent" : "border-border bg-page text-ink hover:bg-desk")}
                >
                  {on && <Check {...ICON_DENSE} />}
                  {s.title}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {chosen && <p className="text-caption text-muted">{chosen.credit}</p>}
    </div>
  );
}
