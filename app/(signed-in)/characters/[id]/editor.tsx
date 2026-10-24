"use client";
import { useActionState } from "react";
import { retireCharacterAction, updateCharacterAction } from "@/lib/server/actions";
import type { FormState } from "@/lib/server/forms";
import { Button } from "@/components/ui/button";
import { Field, TextInput, described } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { DangerZone } from "@/components/ui/card";
import { Section } from "@/components/ui/page";

const QUESTIONS = [
  { key: "manner", label: "How you work" },
  { key: "look", label: "How you look" },
];

export function CharacterEditor({ id, name, profile, editable, retirable }: { id: string; name: string; profile: Record<string, string>; editable: boolean; retirable: boolean }) {
  const [saved, save, saving] = useActionState<FormState, FormData>(updateCharacterAction, { error: null });
  const [retired, retire, retiring] = useActionState<FormState, FormData>(retireCharacterAction, { error: null });
  const keys = [...QUESTIONS, ...Object.keys(profile).filter((k) => !QUESTIONS.some((q) => q.key === k)).map((k) => ({ key: k, label: k.charAt(0).toUpperCase() + k.slice(1) }))];
  const locked = editable ? undefined : "character-locked";
  return (
    <>
      <Section id="details" title="Details">
        <form action={save} className="flex flex-col gap-4 rounded-card border border-rule bg-page p-4">
          <input type="hidden" name="character_id" value={id} />
          {!editable && (
            <p id="character-locked" className="text-caption text-muted">
              The character is in a game, so its details cannot change now.
            </p>
          )}
          <Field id="character-name" label="Name">
            <TextInput {...described("character-name")} aria-describedby={locked} name="name" defaultValue={name} maxLength={40} required disabled={!editable} />
          </Field>
          {keys.map((q) => (
            <Field key={q.key} id={`character-profile-${q.key}`} label={q.label} optional>
              <TextInput {...described(`character-profile-${q.key}`)} aria-describedby={locked} name={`profile.${q.key}`} defaultValue={profile[q.key] ?? ""} maxLength={200} disabled={!editable} />
            </Field>
          ))}
          {saved.error && (
            <Notice tone="danger" live>
              {saved.error}
            </Notice>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="primary" disabled={!editable || saving} aria-describedby={locked}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </Section>
      {retirable && (
        <DangerZone id="retire" title="Retire character">
          <form action={retire} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <input type="hidden" name="character_id" value={id} />
            <p className="text-muted">A retired character can no longer join games.</p>
            <Button type="submit" variant="danger" disabled={retiring} className="shrink-0">
              {retiring ? "Retiring…" : "Retire character"}
            </Button>
            {retired.error && (
              <Notice tone="danger" live className="sm:basis-full">
                {retired.error}
              </Notice>
            )}
          </form>
        </DangerZone>
      )}
    </>
  );
}
