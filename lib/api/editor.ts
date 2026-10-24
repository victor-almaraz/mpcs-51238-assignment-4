// The editor's reference index from the required settings (app-flow.md, Adventure editor: Pickers
// and references): terrain, entity templates, and conditions by id and label, for pickers.

import { builtinTerrain } from "../bundle/setting";
import { listMaterials } from "./materials";
import type { Store } from "../store";
import { getDraft, requiredSettings } from "./drafts";
import { caller } from "./users";

export interface EditorReferences {
  terrain: { id: string; label: string }[];
  templates: { ref: string; label: string; kind: string }[];
  conditions: { ref: string; label: string }[];
  /** Settings the author can require, latest listed version of each. */
  settings: { id: string; version: string; title: string }[];
}

export async function editorReferences(store: Store, userId: string | null, draftId: unknown): Promise<EditorReferences> {
  const user = await caller(store, userId, "get_draft");
  const draft = await getDraft(store, user.id, draftId);
  const settings = await requiredSettings(store, draft.document);
  const terrain = new Map<string, string>(Object.entries(builtinTerrain()).map(([id, t]) => [id, t.label]));
  for (const s of settings) for (const [id, t] of Object.entries(s.manifest.terrain ?? {})) terrain.set(id, t.label);
  return {
    terrain: [...terrain].map(([id, label]) => ({ id, label })),
    templates: settings.flatMap((s) => Object.entries(s.entities).map(([id, t]) => ({ ref: `${s.namespace}:${id}`, label: (t as { label: string }).label, kind: (t as { kind: string }).kind }))),
    conditions: settings.flatMap((s) => Object.entries(s.conditions).map(([id, c]) => ({ ref: `${s.namespace}:${id}`, label: c.label }))),
    settings: (await listMaterials(store, user.id, { system: draft.system, kind: "setting" })).map((m) => ({ id: m.id, version: m.version, title: m.title })),
  };
}
