"use client";
import { ActionForm } from "@/components/action-form";
import { updateCharacterAction } from "@/lib/server/actions";
import { Button } from "@/components/ui/button";
import { Field, TextInput, described } from "@/components/ui/field";
import { Section } from "@/components/ui/page";
import { capitalize } from "@/lib/text";

const QUESTIONS = [
  { key: "manner", label: "How you work" },
  { key: "look", label: "How you look" },
];

export function CharacterEditor({ id, name, profile, editable }: { id: string; name: string; profile: Record<string, string>; editable: boolean }) {
  const keys = [...QUESTIONS, ...Object.keys(profile).filter((k) => !QUESTIONS.some((q) => q.key === k)).map((k) => ({ key: k, label: capitalize(k) }))];
  const locked = editable ? undefined : "character-locked";
  return (
    <Section id="details" title="Details">
        <ActionForm action={updateCharacterAction} className="flex flex-col gap-4 rounded-card border border-rule bg-page p-4">
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
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="primary" disabled={!editable} aria-describedby={locked}>
              Save
            </Button>
          </div>
        </ActionForm>
    </Section>
  );
}
