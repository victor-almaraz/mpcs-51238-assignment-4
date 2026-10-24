"use client";
// Quest's creation form and sheet view (app-flow.md, Character creation and editor; design/screens.md,
// Character creation): sentences with blanks, then abilities as a checklist counted against six.
import { useActionState, useState } from "react";
import type { AbilityOption } from "@/lib/api/characters";
import { createCharacterAction } from "@/lib/server/actions";
import type { FormState } from "@/lib/server/forms";

const blank = "border-0 border-b border-border bg-transparent px-1 font-prose text-prose focus:border-accent focus:outline-none";

export interface CreationProps {
  system: string;
  roles: string[];
  abilities: AbilityOption[];
  count: number;
}

export function QuestCreationForm({ system, roles, abilities, count }: CreationProps) {
  const [state, action, pending] = useActionState<FormState, FormData>(createCharacterAction, { error: null });
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  // Roles are informational (systems/quest.md, Character creation): matching abilities come first.
  const offered = [...abilities].sort((a, b) => Number(b.roles.includes(role)) - Number(a.roles.includes(role)));
  const missing = [
    name.trim() === "" && "a name",
    role === "" && "a role",
    chosen.length < count && `${count - chosen.length} more abilit${count - chosen.length === 1 ? "y" : "ies"}`,
  ].filter(Boolean) as string[];
  const short = abilities.length < count;
  const toggle = (ref: string) => setChosen((c) => (c.includes(ref) ? c.filter((r) => r !== ref) : [...c, ref]));
  // The role's quick start: the abilities tagged for exactly this role, when there are enough.
  const quickStart = role ? abilities.filter((a) => a.roles.length === 1 && a.roles[0] === role).map((a) => a.ref) : [];

  return (
    <form action={action} className="mt-6 flex flex-col gap-4">
      <input type="hidden" name="system" value={system} />
      <p>
        My name is <input name="name" aria-label="Name" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} className={`${blank} w-40`} />. I am a{" "}
        <select name="role" aria-label="Role" value={role} onChange={(e) => setRole(e.target.value)} className={blank}>
          <option value="">role</option>
          {roles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        , and I <input name="profile.manner" aria-label="How you work" maxLength={200} placeholder="work unseen" className={`${blank} w-48`} />.
      </p>
      <p>
        I look <input name="profile.look" aria-label="How you look" maxLength={200} placeholder="tall and scarred" className={`${blank} w-64`} />.
      </p>
      <fieldset>
        <legend className="font-ui text-label">
          Abilities: {chosen.length} of {count}
        </legend>
        {quickStart.length === count && (
          <button type="button" onClick={() => setChosen(quickStart)} className="mt-1 font-ui text-caption text-accent">
            Use the {role} quick start
          </button>
        )}
        {short && (
          <p className="mt-2 text-warning">
            The installed settings offer {abilities.length} abilit{abilities.length === 1 ? "y" : "ies"}; this system needs {count}.
          </p>
        )}
        <ul className="mt-2 flex flex-col gap-1">
          {offered.map((a) => (
            <li key={a.ref}>
              <label className="flex items-baseline gap-2">
                <input type="checkbox" name="abilities" value={a.ref} checked={chosen.includes(a.ref)} onChange={() => toggle(a.ref)} disabled={!chosen.includes(a.ref) && chosen.length >= count} />
                <span>{a.label}</span>
                <span className="font-ui text-caption text-muted">{a.setting}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      {state.error && <p className="text-danger">{state.error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={missing.length > 0 || pending} className="rounded-control bg-accent px-4 py-2 font-ui text-control text-page disabled:opacity-50">
          Create character
        </button>
        {missing.length > 0 && <span className="font-ui text-caption text-muted">Choose {missing.join(", ")}.</span>}
      </div>
    </form>
  );
}

export function QuestSheetView({ sheet, labels }: { sheet: Record<string, unknown>; labels: Record<string, string> }) {
  const s = sheet as { role: string; hp: { value: number; max: number }; ap: number; abilities: string[]; inventory: { ref: string }[]; status: string; armor?: { value: number; max: number } };
  return (
    <dl className="mt-4 grid grid-cols-[8rem_1fr] gap-x-4 gap-y-1">
      <dt className="font-ui text-label text-muted">Role</dt>
      <dd>{s.role}</dd>
      <dt className="font-ui text-label text-muted">Health</dt>
      <dd>
        {s.hp.value}/{s.hp.max} HP
      </dd>
      <dt className="font-ui text-label text-muted">AP</dt>
      <dd>{s.ap}</dd>
      {s.armor && (
        <>
          <dt className="font-ui text-label text-muted">Armor</dt>
          <dd>
            {s.armor.value}/{s.armor.max}
          </dd>
        </>
      )}
      <dt className="font-ui text-label text-muted">Status</dt>
      <dd>{s.status.replace("_", " ")}</dd>
      <dt className="font-ui text-label text-muted">Abilities</dt>
      <dd>{s.abilities.map((a) => labels[a] ?? a).join(", ")}</dd>
      <dt className="font-ui text-label text-muted">Inventory</dt>
      <dd>{s.inventory.length === 0 ? "Empty" : s.inventory.map((i) => labels[i.ref] ?? i.ref).join(", ")}</dd>
    </dl>
  );
}
