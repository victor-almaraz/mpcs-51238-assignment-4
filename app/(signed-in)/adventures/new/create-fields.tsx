"use client";
// The new draft's fields with its required settings, and its Create button, which stays disabled, with
// its reason, until at least one setting is chosen.
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Choice, FieldGroup } from "@/components/ui/field";

export function DraftFields({ settings, system, children }: { settings: { id: string; version: string; title: string }[]; system: string; children: ReactNode }) {
  const [chosen, setChosen] = useState<string[]>([]);
  const why = settings.length === 0 ? `Create needs a setting, and none is installed for ${system}.` : chosen.length === 0 ? "Choose at least one setting." : null;
  return (
    <>
      <FieldGroup legend="Draft">
        {children}
        <fieldset className="flex flex-col">
          <legend className="mb-1 text-label font-medium text-ink">Required settings</legend>
          {settings.length === 0 && <p className="text-muted">No settings are installed for {system}.</p>}
          {settings.map((s) => {
            const value = `${s.id}@${s.version}`;
            return (
              <Choice
                key={s.id}
                name="settings"
                value={value}
                checked={chosen.includes(value)}
                onChange={(e) => setChosen((c) => (e.target.checked ? [...c, value] : c.filter((v) => v !== value)))}
                label={
                  <>
                    {s.title} <span className="text-muted">{s.version}</span>
                  </>
                }
              />
            );
          })}
        </fieldset>
      </FieldGroup>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={!!why} aria-describedby={why ? "create-draft-why" : undefined}>
          Create draft
        </Button>
        {why && (
          <p id="create-draft-why" className="text-caption text-muted">
            {why}
          </p>
        )}
      </div>
    </>
  );
}
