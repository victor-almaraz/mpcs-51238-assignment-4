// Status badges: a word on a tint, never colour alone (docs/design/README.md, Components).
import type { ReactNode } from "react";
import { cx } from "./cx";

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "pigment";

const tones: Record<Tone, string> = {
  neutral: "bg-desk text-muted",
  accent: "bg-accent-soft text-accent",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  /** Now: your turn, live, due. Cadmium yellow behind dark text. */
  pigment: "bg-pigment text-pigment-ink",
};

export function Badge({ tone = "neutral", children, dot = false }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={cx("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-caption font-medium", tones[tone])}>
      {dot && <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/** The badge tone for an instance, campaign, or character status word. */
export function statusTone(status: string): Tone {
  if (["active", "available", "accepted", "published", "ready", "yes"].includes(status)) return "success";
  if (["paused", "lobby", "pending", "maybe", "draft", "in_instance"].includes(status)) return "warning";
  if (["ended", "archived", "retired", "declined", "revoked", "expired", "no"].includes(status)) return "neutral";
  if (["dead", "error", "suspended"].includes(status)) return "danger";
  return "accent";
}

/** A status word in sentence case: `in_instance` reads "In a game". */
export function statusWord(status: string): string {
  const words = status === "in_instance" ? "in a game" : status.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <Badge tone={statusTone(status)}>{label ?? statusWord(status)}</Badge>;
}
