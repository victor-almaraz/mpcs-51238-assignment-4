// Adventure drafts (api.md, Adventure drafts; data-model.md, Material draft; app-flow.md, Adventure
// editor: Validation, Saving, Publishing). Validation and publication run the shared Content Compiler.

import { inflateRawSync } from "node:zlib";
import { renameNamespace } from "../../components/editor/doc";
import type { AdventureBundle } from "../bundle/adventure";
import type { SettingBundle } from "../bundle/setting";
import { zip, unzip } from "../export/zip";
import { compileDraft, draftFiles } from "../materials";
import { filesToDraft, toDraftDiagnostics, type DraftDiagnostic } from "../materials/draft-io";
import { plotWarnings } from "../materials/plot";
import { compareVersions, parseVersion, satisfies } from "../materials/semver";
import type { DraftRecord, Store } from "../store";
import { SYSTEMS } from "../systems";
import { cryptoEntropy, type Entropy } from "./entropy";
import { withStages } from "./deletion";
import { ApiError, onlyFields } from "./errors";
import { materialView } from "./materials";
import { systemOrThrow } from "./systems";
import { caller } from "./users";

const ID = /^[a-z][a-z0-9_]{0,63}$/;
const DAY = 86_400_000;
/** The largest draft document save_draft accepts, as JSON. */
const MAX_DRAFT = 2_000_000;
/** An imported archive's limits: files, and their unpacked size together (a ZIP bomb stops here). */
const MAX_FILES = 500;
const MAX_UNPACKED = 4 * MAX_DRAFT;

/** The draft summary of `list_drafts`: everything but the document, with problem counts. */
export function draftSummary(d: Omit<DraftRecord, "document">) {
  const { diagnostics, ...rest } = d;
  return { ...rest, problems: diagnostics.filter((x) => x.severity === "error").length, warnings: diagnostics.filter((x) => x.severity === "warning").length };
}

async function owned(store: Store, userId: string, draftId: unknown): Promise<DraftRecord> {
  if (typeof draftId !== "string") throw new ApiError("invalid_request", "draft_id must be a string");
  const d = await store.getDraft(draftId);
  if (!d || d.owner_id !== userId) throw new ApiError("not_found", "no such draft");
  return d;
}

function requirements(v: unknown): { id: string; versions: string }[] {
  if (!Array.isArray(v) || v.length === 0) throw new ApiError("invalid_request", "choose at least one setting for the adventure to require");
  return v.map((r, i) => {
    const x = onlyFields(r, ["id", "versions"]);
    if (typeof x.id !== "string" || typeof x.versions !== "string") throw new ApiError("invalid_request", `requires_settings[${i}] needs id and versions`);
    return { id: x.id, versions: x.versions };
  });
}

/**
 * The newest listed operator version of each required setting within its range, for compiling. A
 * requirement no installed setting satisfies is reported by the compiler.
 */
export async function requiredSettings(store: Store, draft: Record<string, unknown>): Promise<SettingBundle[]> {
  const reqs = ((draft.adventure as { requires_settings?: { id: string; versions: string }[] } | undefined)?.requires_settings ?? []).filter((r) => r && typeof r.id === "string");
  const all = (await store.allBundles()).filter((b) => b.kind === "setting" && b.origin === "operator" && b.listed);
  const out: SettingBundle[] = [];
  for (const r of reqs) {
    const fit = all.filter((b) => b.id === r.id && typeof r.versions === "string" && satisfies(b.version, r.versions)).sort((a, b) => compareVersions(parseVersion(b.version)!, parseVersion(a.version)!))[0];
    if (fit) out.push((await store.getBundle("setting", fit.id, fit.version)) as SettingBundle);
  }
  return out;
}

/**
 * The compiler's diagnostics for a draft document, as draft diagnostics, then warnings for endings and
 * stages the plot cannot reach (app-flow.md, Validation: ending reachability).
 */
export async function diagnose(store: Store, document: Record<string, unknown>): Promise<DraftDiagnostic[]> {
  const r = compileDraft(document, await requiredSettings(store, document));
  return [...toDraftDiagnostics(r.diagnostics), ...plotWarnings(document)];
}

/**
 * Gives a never-published draft the adventure id its document now has. Ids that are not valid are
 * left to the compiler's diagnostics; after the first publication the id is fixed.
 */
async function followId(store: Store, d: DraftRecord, id: unknown): Promise<void> {
  if (d.last_published_version || typeof id !== "string" || !ID.test(id) || id === d.material_id) return;
  try {
    await store.setDraftMaterial(d.id, id);
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new ApiError("conflict", `another of your drafts already has the adventure id ${id}; choose a different id`);
    throw e;
  }
}

export async function createDraft(store: Store, userId: string | null, input: unknown, entropy: Entropy = cryptoEntropy) {
  const user = await caller(store, userId, "create_draft");
  const req = onlyFields(input, ["material_id", "title", "system", "requires_settings"]);
  if (typeof req.material_id !== "string" || !ID.test(req.material_id)) throw new ApiError("invalid_request", "material_id must be a lowercase identifier");
  if (typeof req.title !== "string" || req.title.trim() === "" || req.title.length > 80) throw new ApiError("invalid_request", "title must have 1 to 80 characters");
  const system = systemOrThrow(req.system);
  const [major, minor] = system.VERSION.split(".");
  const document = {
    adventure: {
      format_version: 2,
      kind: "adventure",
      id: req.material_id,
      version: "0.1.0",
      title: req.title,
      system: { id: system.ID, versions: `^${major}.${minor}` },
      requires_settings: requirements(req.requires_settings),
      players: [1, 4],
      start: { location: "", room: "", effects: [] },
      endings: {},
    },
    flags: {},
    arcs: {},
    locations: {},
    npcs: {},
    entities: {},
    editor: { layout: {}, snapshots: [] },
  };
  try {
    const d = await store.createDraft({ id: entropy.id("d"), owner_id: user.id, material_id: req.material_id, system: system.ID, title: req.title, document });
    await store.setDraftDiagnostics(d.id, await diagnose(store, document));
    return (await store.getDraft(d.id))!;
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new ApiError("conflict", `you already have a draft of ${req.material_id}`);
    throw e;
  }
}

/** import_draft: a ZIP of an adventure directory, at its root or in one top-level folder. */
export async function importDraft(store: Store, userId: string | null, archive: Uint8Array, entropy: Entropy = cryptoEntropy) {
  const user = await caller(store, userId, "import_draft");
  let entries: Map<string, Uint8Array>;
  let unpacked = 0;
  const inflate = (d: Uint8Array) => {
    const out = new Uint8Array(inflateRawSync(d, { maxOutputLength: MAX_UNPACKED - unpacked + 1 }));
    unpacked += out.length;
    if (unpacked > MAX_UNPACKED) throw new Error("larger than 8 MB unpacked");
    return out;
  };
  try {
    entries = unzip(archive, inflate);
  } catch (e) {
    const tooLarge = (e as { code?: string }).code === "ERR_BUFFER_TOO_LARGE";
    throw new ApiError("invalid_request", `the file is not a readable ZIP: ${tooLarge ? "larger than 8 MB unpacked" : (e as Error).message}`);
  }
  if (entries.size > MAX_FILES) throw new ApiError("invalid_request", `the ZIP has more than ${MAX_FILES} files`);
  const names = [...entries.keys()];
  const root = names.includes("adventure.yaml") ? "" : (names.find((n) => /^[^/]+\/adventure\.yaml$/.test(n))?.split("/")[0] ?? null);
  if (root === null) throw new ApiError("invalid_request", "the ZIP has no adventure.yaml");
  const files = new Map<string, string>();
  for (const [name, data] of entries) if (!root || name.startsWith(`${root}/`)) files.set(root ? name.slice(root.length + 1) : name, new TextDecoder().decode(data));
  const { draft, problems } = filesToDraft(files);
  if (JSON.stringify(draft).length > MAX_DRAFT) throw new ApiError("invalid_request", "the draft is larger than 2 MB");
  const a = draft.adventure as { id?: unknown; title?: unknown; system?: { id?: unknown } };
  if (typeof a.id !== "string" || !ID.test(a.id)) throw new ApiError("invalid_request", "adventure.yaml needs a valid id");
  const system = systemOrThrow(a.system?.id);
  const title = typeof a.title === "string" && a.title.trim() !== "" ? a.title.slice(0, 80) : a.id;
  let d: DraftRecord;
  try {
    d = await store.createDraft({ id: entropy.id("d"), owner_id: user.id, material_id: a.id, system: system.ID, title, document: draft });
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new ApiError("conflict", `you already have a draft of ${a.id}`);
    throw e;
  }
  const diagnostics = [...problems, ...(await diagnose(store, draft))];
  await store.setDraftDiagnostics(d.id, diagnostics);
  return { draft: (await store.getDraft(d.id))!, diagnostics };
}

export async function listDrafts(store: Store, userId: string | null, input: unknown = {}) {
  const user = await caller(store, userId, "list_drafts");
  const req = onlyFields(input, ["archived", "limit", "cursor"]);
  const limit = req.limit ?? 20;
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new ApiError("invalid_request", "limit must be 1 to 100");
  if (req.archived !== undefined && typeof req.archived !== "boolean") throw new ApiError("invalid_request", "archived must be a boolean");
  const page = await store.listDrafts(user.id, limit + 1, req.cursor as string | undefined, req.archived as boolean | undefined);
  const items = page.slice(0, limit);
  return { items: items.map(draftSummary), next_cursor: page.length > limit ? items.at(-1)!.id : null };
}

export async function getDraft(store: Store, userId: string | null, draftId: unknown) {
  const user = await caller(store, userId, "get_draft");
  return owned(store, user.id, draftId);
}

export async function saveDraft(store: Store, userId: string | null, input: unknown) {
  const user = await caller(store, userId, "save_draft");
  const req = onlyFields(input, ["draft_id", "document", "revision"]);
  const d = await owned(store, user.id, req.draft_id);
  if (typeof req.revision !== "number") throw new ApiError("invalid_request", "revision must be a number");
  if (req.document === null || typeof req.document !== "object" || Array.isArray(req.document)) throw new ApiError("invalid_request", "document must be an object");
  const document = req.document as Record<string, unknown>;
  const a = (document.adventure ?? {}) as { id?: unknown; title?: unknown; system?: { id?: unknown } };
  // The system is fixed after creation, and the id after the first publication.
  if (a.system?.id !== d.system) throw new ApiError("invalid_request", `the system is fixed: ${d.system}`);
  if (d.last_published_version && a.id !== d.material_id) throw new ApiError("invalid_request", `the adventure id is fixed after publication: ${d.material_id}`);
  if (JSON.stringify(document).length > MAX_DRAFT) throw new ApiError("invalid_request", "the draft is larger than 2 MB");
  const title = typeof a.title === "string" && a.title.trim() !== "" ? a.title.slice(0, 80) : d.title;
  await followId(store, d, a.id);
  const saved = await store.saveDraft(d.id, req.revision, document, title, await diagnose(store, document));
  if (!saved) throw new ApiError("conflict", "the draft was saved elsewhere; reload it or keep yours as a new draft");
  return saved;
}

export async function validateDraft(store: Store, userId: string | null, draftId: unknown) {
  const user = await caller(store, userId, "validate_draft");
  const d = await owned(store, user.id, draftId);
  const diagnostics = await diagnose(store, d.document);
  await store.setDraftDiagnostics(d.id, diagnostics);
  return diagnostics;
}

/** The adventure directory as a ZIP of YAML files, in a folder named by the adventure id. */
export async function exportDraft(store: Store, userId: string | null, draftId: unknown): Promise<{ name: string; data: Uint8Array }> {
  const user = await caller(store, userId, "export_draft");
  const d = await owned(store, user.id, draftId);
  // The id names the folder and the download; an unpublished draft's id may not be valid yet.
  const named = (d.document.adventure as { id?: unknown } | undefined)?.id;
  const id = typeof named === "string" && ID.test(named) ? named : d.material_id;
  const files = [...draftFiles(d.document)].map(([path, text]) => ({ name: `${id}/${path}`, data: text }));
  return { name: `${id}.zip`, data: zip(files) };
}

export async function publishDraft(store: Store, userId: string | null, input: unknown) {
  const user = await caller(store, userId, "publish_draft");
  const req = onlyFields(input, ["draft_id", "version"]);
  const d = await owned(store, user.id, req.draft_id);
  if (d.archived) throw new ApiError("conflict", "the draft is archived; unarchive it to publish");
  if (typeof req.version !== "string" || !parseVersion(req.version)) throw new ApiError("invalid_request", "version must be a semantic version such as 1.0.0");
  const document = structuredClone(d.document);
  const adventure = document.adventure as Record<string, unknown>;
  adventure.version = req.version;
  const id = String(adventure.id);
  if (d.last_published_version && id !== d.material_id) throw new ApiError("invalid_request", `the adventure id is fixed after publication: ${d.material_id}`);
  const versions = await store.adventureVersions(id);
  if (versions.some((v) => v.publisher_id !== user.id)) throw new ApiError("conflict", `the adventure id ${id} belongs to another publisher`);
  if (versions.some((v) => compareVersions(parseVersion(v.version)!, parseVersion(req.version as string)!) >= 0)) throw new ApiError("conflict", `version ${req.version} is not greater than every published version of ${id}`);
  const settings = await requiredSettings(store, document);
  const r = compileDraft(document, settings);
  if (!r.ok || !r.bundle) {
    await store.setDraftDiagnostics(d.id, toDraftDiagnostics(r.diagnostics));
    throw new ApiError("invalid_request", `the draft has ${r.diagnostics.length} problem${r.diagnostics.length === 1 ? "" : "s"}`);
  }
  const system = SYSTEMS[r.bundle.manifest.system.id];
  if (!system || !satisfies(system.VERSION, r.bundle.manifest.system.versions)) throw new ApiError("system_mismatch", `no installed ${r.bundle.manifest.system.id} version satisfies ${r.bundle.manifest.system.versions}`);
  await followId(store, d, id);
  await store.putBundle(r.bundle, { origin: "author", publisher_id: user.id, draft_id: d.id, listed: true });
  await store.setDraftPublished(d.id, req.version);
  return materialView((await store.material("adventure", r.bundle.id, r.bundle.version))!);
}

/** The increment content-publishing.md asks for: major on a removed ending, minor on added records. */
function increment(previous: AdventureBundle | undefined, d: Record<string, unknown>): { increment: "major" | "minor" | "patch"; why: string } {
  if (!previous) return { increment: "major", why: "first version" };
  const doc = d as { adventure?: { endings?: Record<string, unknown> }; arcs?: object; locations?: object; npcs?: object };
  const removed = Object.keys(previous.manifest.endings).filter((k) => !(k in (doc.adventure?.endings ?? {})));
  if (removed.length) return { increment: "major", why: `removed ending ${removed.join(", ")}` };
  const count = (o: object | undefined) => Object.keys(o ?? {}).length;
  const before = (previous.arcs?.length ?? 0) + count(previous.locations) + count(previous.npcs) + Object.keys(previous.manifest.endings).length;
  const after = count(doc.arcs) + count(doc.locations) + count(doc.npcs) + count(doc.adventure?.endings);
  if (after > before) return { increment: "minor", why: "added arcs, locations, NPCs, or endings" };
  return { increment: "patch", why: "text, balance, or trigger changes" };
}

/**
 * The version the Publish page suggests: the increment from the newest published version of the
 * draft's adventure id (whichever draft published it), or 1.0.0 for a first version.
 */
export async function publishSuggestion(store: Store, userId: string | null, draftId: unknown) {
  const user = await caller(store, userId, "get_draft");
  const d = await owned(store, user.id, draftId);
  const named = (d.document.adventure as { id?: unknown } | undefined)?.id;
  const id = typeof named === "string" ? named : d.material_id;
  const latest = (await store.adventureVersions(id)).map((v) => v.version).filter((v) => parseVersion(v)).sort((a, b) => compareVersions(parseVersion(b)!, parseVersion(a)!))[0] ?? null;
  const previous = latest ? ((await store.getBundle("adventure", id, latest)) as AdventureBundle | undefined) : undefined;
  const s = increment(previous, d.document);
  const [major, minor, patch] = (latest ?? "0.0.0").split(".").map(Number) as [number, number, number];
  const version = !latest ? "1.0.0" : s.increment === "major" ? `${major + 1}.0.0` : s.increment === "minor" ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`;
  return { latest, ...s, version };
}

/**
 * A new draft holding `document`, for the editor after a save conflict. It takes a free adventure id
 * made from the document's own (`<id>_copy`, `<id>_copy_2`, …), with the refs into the old id's
 * namespace rewritten, and is created with the document in one step.
 */
export async function copyDraft(store: Store, userId: string | null, input: unknown, entropy: Entropy = cryptoEntropy) {
  const user = await caller(store, userId, "create_draft");
  const req = onlyFields(input, ["document", "title"]);
  if (req.document === null || typeof req.document !== "object" || Array.isArray(req.document)) throw new ApiError("invalid_request", "document must be an object");
  const source = req.document as Record<string, unknown>;
  if (JSON.stringify(source).length > MAX_DRAFT) throw new ApiError("invalid_request", "the draft is larger than 2 MB");
  const a = (source.adventure ?? {}) as { id?: unknown; title?: unknown; system?: { id?: unknown } };
  const system = systemOrThrow(a.system?.id);
  const own = typeof a.id === "string" && ID.test(a.id) ? a.id : null;
  const base = own ?? "adventure";
  const named = typeof req.title === "string" && req.title.trim() !== "" ? req.title : typeof a.title === "string" && a.title.trim() !== "" ? a.title : base;
  const title = named.slice(0, 80);
  for (let n = 1; n <= 100; n++) {
    const suffix = n === 1 ? "_copy" : `_copy_${n}`;
    const id = `${base.slice(0, 64 - suffix.length)}${suffix}`;
    const document = own ? renameNamespace(source, own, id) : structuredClone(source);
    document.adventure = { ...(document.adventure as object), id, title };
    try {
      const d = await store.createDraft({ id: entropy.id("d"), owner_id: user.id, material_id: id, system: system.ID, title, document });
      await store.setDraftDiagnostics(d.id, await diagnose(store, document));
      return (await store.getDraft(d.id))!;
    } catch (e) {
      if ((e as { code?: string }).code !== "23505") throw e;
    }
  }
  throw new ApiError("conflict", `you already have too many copies of ${base}`);
}

export async function deleteDraft(store: Store, userId: string | null, draftId: unknown) {
  const user = await caller(store, userId, "delete_draft");
  const d = await owned(store, user.id, draftId);
  await store.deleteDraft(d.id);
  return { restorable_until: new Date(Date.now() + 30 * DAY).toISOString() };
}

export async function restoreDraft(store: Store, userId: string | null, draftId: unknown) {
  const user = await caller(store, userId, "restore_draft");
  if (typeof draftId !== "string") throw new ApiError("invalid_request", "draft_id must be a string");
  const gone = await store.deletedDraft(draftId);
  if (!gone || gone.owner_id !== user.id) throw new ApiError("not_found", "no such deleted draft");
  const d = await store.restoreDraft(draftId).catch((e: { code?: string }) => {
    if (e.code === "23505") throw new ApiError("conflict", "another draft of this adventure exists");
    throw e;
  });
  if (!d) throw new ApiError("conflict", "the draft was deleted more than 30 days ago");
  return d;
}

// SPEC_ISSUES.md#character-draft-archive: archiving keeps a draft out of the owner's drafts and from
// publishing; restore_draft needs the deleted draft's id, which no list gives.
export async function archiveDraft(store: Store, userId: string | null, draftId: unknown) {
  const user = await caller(store, userId, "archive_draft");
  const d = await owned(store, user.id, draftId);
  if (d.archived) throw new ApiError("conflict", "the draft is already archived");
  return draftSummary((await store.setDraftArchived(d.id, true))!);
}

export async function unarchiveDraft(store: Store, userId: string | null, draftId: unknown) {
  const user = await caller(store, userId, "unarchive_draft");
  const d = await owned(store, user.id, draftId);
  if (!d.archived) throw new ApiError("conflict", "the draft is not archived");
  return draftSummary((await store.setDraftArchived(d.id, false))!);
}

/** The caller's drafts deleted less than 30 days ago, which they can restore, with the dates of each stage. */
export async function listDeletedDrafts(store: Store, userId: string | null) {
  const user = await caller(store, userId, "list_deleted_drafts");
  return (await store.deletedDrafts(user.id)).map(withStages);
}
