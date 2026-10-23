"use client";
import { useActionState } from "react";
import { retireCharacterAction, updateCharacterAction } from "@/lib/server/actions";
import type { FormState } from "@/lib/server/forms";

const field = "w-full rounded-control border border-border bg-page px-2 py-1 font-prose text-prose";
const QUESTIONS = [
  { key: "manner", label: "How you work" },
  { key: "look", label: "How you look" },
];

export function CharacterEditor({ id, name, profile, editable, retirable }: { id: string; name: string; profile: Record<string, string>; editable: boolean; retirable: boolean }) {
  const [saved, save, saving] = useActionState<FormState, FormData>(updateCharacterAction, { error: null });
  const [retired, retire, retiring] = useActionState<FormState, FormData>(retireCharacterAction, { error: null });
  const keys = [...QUESTIONS, ...Object.keys(profile).filter((k) => !QUESTIONS.some((q) => q.key === k)).map((k) => ({ key: k, label: k }))];
  return (
    <>
      <form action={save} className="mt-8 flex flex-col gap-3">
        <h2 className="font-display text-heading">Details</h2>
        <input type="hidden" name="character_id" value={id} />
        <label className="flex flex-col gap-1">
          <span className="font-ui text-label">Name</span>
          <input name="name" defaultValue={name} maxLength={40} required disabled={!editable} className={field} />
        </label>
        {keys.map((q) => (
          <label key={q.key} className="flex flex-col gap-1">
            <span className="font-ui text-label">{q.label}</span>
            <input name={`profile.${q.key}`} defaultValue={profile[q.key] ?? ""} maxLength={200} disabled={!editable} className={field} />
          </label>
        ))}
        {saved.error && <p className="text-danger">{saved.error}</p>}
        <div>
          <button type="submit" disabled={!editable || saving} className="rounded-control bg-accent px-4 py-2 font-ui text-control text-page disabled:opacity-50">
            Save
          </button>
          {!editable && <span className="ml-3 font-ui text-caption text-muted">The character is in an instance.</span>}
        </div>
      </form>
      {retirable && (
        <form action={retire} className="mt-8">
          <input type="hidden" name="character_id" value={id} />
          {retired.error && <p className="text-danger">{retired.error}</p>}
          <button type="submit" disabled={retiring} className="rounded-control border border-danger px-4 py-2 font-ui text-control text-danger">
            Retire
          </button>
        </form>
      )}
    </>
  );
}
