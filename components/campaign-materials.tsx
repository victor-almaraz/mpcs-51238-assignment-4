"use client";
// Material and module pickers for campaign forms (app-flow.md, Route map: /campaigns/new; Campaign
// editor, Materials): one adventure and its settings; modules preselected from what the materials
// require; settings the adventure does not need stay available. What the chosen materials require is
// locked on: the adventure's settings (one version of each) and the modules of every chosen material,
// which check_materials would otherwise refuse. A locked box is disabled, so a hidden field submits it.
import { useState } from "react";
import { satisfies } from "@/lib/materials/semver";
import { Choice, Field, Select, described } from "./ui/field";
import { Notice } from "./ui/notice";

export interface MaterialOption {
  kind: "setting" | "adventure";
  id: string;
  version: string;
  title: string;
  modules: string[];
  requires_settings?: { id: string; versions: string }[];
}

const key = (m: { id: string; version: string }) => `${m.id}@${m.version}`;

/**
 * `modules` lists the system's modules to choose from; with `requiredOnly` (the campaign editor's
 * Materials tab, where Details holds the module choice) only the modules the materials require are
 * shown, locked on, and saving enables them.
 */
export function MaterialPicker({ materials, modules, chosen, enabled, requiredOnly = false }: { materials: MaterialOption[]; modules: { id: string; title: string }[]; chosen: { kind: string; id: string; version: string }[]; enabled: string[]; requiredOnly?: boolean }) {
  const adventures = materials.filter((m) => m.kind === "adventure");
  const settings = materials.filter((m) => m.kind === "setting");
  const [adventure, setAdventure] = useState(chosen.find((m) => m.kind === "adventure") ? key(chosen.find((m) => m.kind === "adventure")!) : "");
  // A new campaign starts with every setting, so the abilities characters chose are in its materials.
  const [picked, setPicked] = useState<string[]>(chosen.length > 0 ? chosen.filter((m) => m.kind === "setting").map(key) : settings.map(key));
  const [on, setOn] = useState<string[]>(enabled);
  const needed = adventures.find((a) => key(a) === adventure)?.requires_settings ?? [];
  const chosenMaterials = materials.filter((m) => key(m) === adventure || picked.includes(key(m)));
  /** Each module the chosen materials require, with the titles of those that require it. */
  const requiredBy = new Map<string, string[]>();
  for (const m of chosenMaterials) for (const mod of m.modules) requiredBy.set(mod, [...(requiredBy.get(mod) ?? []), m.title]);
  // SPEC_ISSUES.md#generation-order: the form submits settings in this order. The adventure's own
  // settings come first, because the generator takes doors and locks from the first setting that
  // declares them.
  const isNeeded = (s: MaterialOption) => needed.some((r) => r.id === s.id && satisfies(s.version, r.versions));
  // A required setting stays on while it is the only chosen version of that setting in the range.
  const locked = (s: MaterialOption) => isNeeded(s) && picked.includes(key(s)) && settings.filter((o) => o.id === s.id && isNeeded(o) && picked.includes(key(o))).length === 1;
  /** Required settings no listed version satisfies, which no choice here can fix. */
  const unavailable = needed.filter((r) => !settings.some((s) => s.id === r.id && satisfies(s.version, r.versions)));
  const ordered = [...settings].sort((a, b) => Number(isNeeded(b)) - Number(isNeeded(a)));

  function chooseAdventure(v: string) {
    setAdventure(v);
    const a = adventures.find((x) => key(x) === v);
    // Select a listed version in range of each required setting that has none chosen yet.
    const inRange = (r: { id: string; versions: string }) => (s: MaterialOption) => s.id === r.id && satisfies(s.version, r.versions);
    const add = (a?.requires_settings ?? []).filter((r) => !settings.some((s) => inRange(r)(s) && picked.includes(key(s)))).map((r) => settings.find(inRange(r))).filter((s): s is MaterialOption => !!s);
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
      {unavailable.length > 0 && (
        <Notice tone="warning">
          This adventure needs {unavailable.map((r) => `${r.id} ${r.versions}`).join(" and ")}, which no installed setting provides, so it cannot be used yet.
        </Notice>
      )}
      <fieldset className="flex flex-col">
        <legend className="mb-1 text-label font-medium text-muted">Settings</legend>
        {settings.length === 0 && <p className="text-muted">No settings are installed for this system.</p>}
        {ordered.map((s) => (
          <div key={key(s)}>
            {locked(s) && <input type="hidden" name="settings" value={key(s)} />}
            <Choice
              name={locked(s) ? undefined : "settings"}
              value={key(s)}
              checked={picked.includes(key(s))}
              disabled={locked(s)}
              onChange={() => setPicked(picked.includes(key(s)) ? picked.filter((p) => p !== key(s)) : [...picked, key(s)])}
              label={
                <>
                  {s.title} <span className="text-muted">{s.version}</span>
                </>
              }
              hint={isNeeded(s) ? "Required by the adventure; it cannot be removed" : undefined}
            />
          </div>
        ))}
      </fieldset>
      {requiredOnly
        ? requiredBy.size > 0 && (
            <fieldset className="flex flex-col">
              <legend className="mb-1 text-label font-medium text-muted">Modules</legend>
              {modules
                .filter((m) => requiredBy.has(m.id))
                .map((m) => (
                  <ModuleChoice key={m.id} module={m} requiredBy={requiredBy.get(m.id)} />
                ))}
              <p className="text-caption text-muted">Saving turns these on. Other modules are on the Details tab.</p>
            </fieldset>
          )
        : modules.length > 0 && (
            <fieldset className="flex flex-col">
              <legend className="mb-1 text-label font-medium text-muted">Modules</legend>
              {modules.map((m) => (
                <ModuleChoice key={m.id} module={m} checked={on.includes(m.id)} requiredBy={requiredBy.get(m.id)} onChange={() => setOn(on.includes(m.id) ? on.filter((x) => x !== m.id) : [...on, m.id])} />
              ))}
            </fieldset>
          )}
    </>
  );
}

/**
 * A module checkbox. A module the materials require (`requiredBy`, their titles) is checked and
 * locked, and submitted by a hidden field.
 */
export function ModuleChoice({ module: m, checked, defaultChecked, requiredBy, onChange }: { module: { id: string; title: string }; checked?: boolean; defaultChecked?: boolean; requiredBy?: string[]; onChange?: () => void }) {
  if (requiredBy && requiredBy.length > 0) {
    return (
      <div>
        <input type="hidden" name="modules" value={m.id} />
        <Choice value={m.id} checked disabled readOnly label={m.title} hint={`Required by ${requiredBy.join(" and ")}; it cannot be removed`} />
      </div>
    );
  }
  return <Choice name="modules" value={m.id} checked={checked} defaultChecked={defaultChecked} onChange={onChange} label={m.title} />;
}
