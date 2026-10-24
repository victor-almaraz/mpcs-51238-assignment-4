"use client";
// Material and module pickers for campaign forms (app-flow.md, Route map: /campaigns/new; Campaign
// editor, Materials): one adventure and its settings; modules preselected from what the materials
// require; settings the adventure does not need stay available.
import { useState } from "react";
import { Choice, Field, Select, described } from "./ui/field";

export interface MaterialOption {
  kind: "setting" | "adventure";
  id: string;
  version: string;
  title: string;
  modules: string[];
  requires_settings?: { id: string; versions: string }[];
}

const key = (m: { id: string; version: string }) => `${m.id}@${m.version}`;

export function MaterialPicker({ materials, modules, chosen, enabled }: { materials: MaterialOption[]; modules: { id: string; title: string }[]; chosen: { kind: string; id: string; version: string }[]; enabled: string[] }) {
  const adventures = materials.filter((m) => m.kind === "adventure");
  const settings = materials.filter((m) => m.kind === "setting");
  const [adventure, setAdventure] = useState(chosen.find((m) => m.kind === "adventure") ? key(chosen.find((m) => m.kind === "adventure")!) : "");
  // A new campaign starts with every setting, so the abilities characters chose are in its materials.
  const [picked, setPicked] = useState<string[]>(chosen.length > 0 ? chosen.filter((m) => m.kind === "setting").map(key) : settings.map(key));
  const [on, setOn] = useState<string[]>(enabled);
  const required = new Set([...materials.filter((m) => key(m) === adventure || picked.includes(key(m))).flatMap((m) => m.modules)]);
  const needed = adventures.find((a) => key(a) === adventure)?.requires_settings ?? [];
  // SPEC_ISSUES.md#generation-order: the form submits settings in this order. The adventure's own
  // settings come first, because the generator takes doors and locks from the first setting that
  // declares them.
  const isNeeded = (s: MaterialOption) => needed.some((r) => r.id === s.id);
  const ordered = [...settings].sort((a, b) => Number(isNeeded(b)) - Number(isNeeded(a)));

  function chooseAdventure(v: string) {
    setAdventure(v);
    const a = adventures.find((x) => key(x) === v);
    // Select the newest listed version of each required setting that is not chosen yet.
    const add = (a?.requires_settings ?? []).map((r) => settings.find((s) => s.id === r.id)).filter((s): s is MaterialOption => !!s && !picked.some((p) => p.startsWith(`${s.id}@`)));
    if (add.length > 0) setPicked([...picked, ...add.map(key)]);
    setOn([...new Set([...on, ...(a?.modules ?? []), ...add.flatMap((s) => s.modules)])]);
  }

  return (
    <>
      <Field id="materials-adventure" label="Adventure" hint="Choosing one adds the settings and modules it needs.">
        <Select {...described("materials-adventure", { hint: true })} name="adventure" value={adventure} onChange={(e) => chooseAdventure(e.target.value)}>
          <option value="">Choose an adventure</option>
          {adventures.map((a) => (
            <option key={key(a)} value={key(a)}>
              {a.title} {a.version}
            </option>
          ))}
        </Select>
      </Field>
      <fieldset className="flex flex-col">
        <legend className="mb-1 text-label font-medium text-muted">Settings</legend>
        {settings.length === 0 && <p className="text-muted">No settings are installed for this system.</p>}
        {ordered.map((s) => (
          <Choice
            key={key(s)}
            name="settings"
            value={key(s)}
            checked={picked.includes(key(s))}
            onChange={() => setPicked(picked.includes(key(s)) ? picked.filter((p) => p !== key(s)) : [...picked, key(s)])}
            label={
              <>
                {s.title} <span className="text-muted">{s.version}</span>
              </>
            }
            hint={isNeeded(s) ? "Required by the adventure" : undefined}
          />
        ))}
      </fieldset>
      {modules.length > 0 && (
        <fieldset className="flex flex-col">
          <legend className="mb-1 text-label font-medium text-muted">Modules</legend>
          {modules.map((m) => (
            <Choice
              key={m.id}
              name="modules"
              value={m.id}
              checked={on.includes(m.id)}
              onChange={() => setOn(on.includes(m.id) ? on.filter((x) => x !== m.id) : [...on, m.id])}
              label={m.title}
              hint={required.has(m.id) ? "Required by a chosen material" : undefined}
            />
          ))}
        </fieldset>
      )}
    </>
  );
}
