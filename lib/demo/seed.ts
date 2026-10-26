// The demo world (lib/server/demo.ts): content for every screen, built through the application's own
// operations so it is what real use produces. Three users; the published materials; Cadmium and Quest
// characters; a campaign of the exemplar with a game in progress, a lobby, a weekly session, and an
// invitation; a campaign the demo user joined; and an adventure draft.

import { join } from "node:path";
import { abilityOptions, archiveCharacter, createCharacter, deleteCharacter, updateCharacter } from "../api/characters";
import { archiveCampaign, createCampaign, deleteCampaign, joinByLink, rotateInviteLink } from "../api/campaigns";
import { archiveDraft, createDraft, deleteDraft, importDraft } from "../api/drafts";
import type { Entropy } from "../api/entropy";
import { addCharacter, createInstance, startInstance, submitAction } from "../api/instances";
import { invite } from "../api/invitations";
import { rsvp, scheduleSession } from "../api/schedules";
import { TERMS_VERSION } from "../api/terms";
import { MemoryBroadcaster } from "../broadcast";
import { DEFAULT_TIMEOUTS, type Deps } from "../coordinator/instance";
import { zip } from "../export/zip";
import { compileAdventure, compileSetting, mustCompile, type Bundle, type CompileResult } from "../materials";
import { readPackDir } from "../materials/fs";
import type { Store } from "../store";
import { quickStartFor } from "../systems/creation";

export const DEMO_USERS = [
  { id: "user_demo", email: "vera@example.org", display_name: "Vera Lindqvist", operator: true },
  { id: "user_ari", email: "ari@example.org", display_name: "Ari Okafor", operator: false },
  { id: "user_bo", email: "bo@example.org", display_name: "Bo Castellan", operator: false },
] as const;

/** Ids and codes that count up under a prefix, so the seed is the same every time. */
function counting(): Entropy {
  let n = 0;
  return { seed: () => 1000 + ++n, id: (prefix) => `${prefix}_demo${++n}`, code: (length) => String(++n).padStart(length, "7") };
}

// Each read starts from a fixed folder, so the bundler traces only those folders.
type Pack = { materials: string } | { example: string };
const pack = (p: Pack) => ("materials" in p ? readPackDir(join(process.cwd(), "materials", p.materials, "pack")) : readPackDir(join(process.cwd(), "docs/spec", "spec", "examples", p.example)));

/** The packs an operator publishes on a fresh deployment (runbooks/content-publishing.md): settings in material order, then the exemplar adventure. */
const PUBLISHED: { settings: Pack[]; adventure: Pack } = {
  settings: [{ example: "derelict_station" }, { example: "sunless_crypt" }, { materials: "quest_starter" }, { example: "lantern_coast" }],
  adventure: { example: "sunken_archive" },
};

/** The published packs compiled, each with its asset files: the settings, then the adventure against them. Throws on a pack with errors. */
export function compilePublished(): { bundle: Bundle; files: CompileResult<Bundle>["files"] }[] {
  const settings = PUBLISHED.settings.map((p) => compileSetting(pack(p)));
  const bundles = settings.map((r, i) => mustCompile(r, JSON.stringify(PUBLISHED.settings[i])));
  const adventure = compileAdventure(pack(PUBLISHED.adventure), bundles);
  return [...settings.map((r, i) => ({ bundle: bundles[i]!, files: r.files })), { bundle: mustCompile(adventure, JSON.stringify(PUBLISHED.adventure)), files: adventure.files }];
}

/** Ids and codes the demo index links to. */
export interface DemoWorld {
  campaign: string;
  game: string;
  lobby: string;
  character: string;
  draft: string | null;
  invitation: string;
  link: string;
  archivedCampaign: string;
  archivedCharacter: string;
}

export async function seedDemo(store: Store, now = new Date()): Promise<DemoWorld> {
  const e = counting();
  const deps: Deps = { store, broadcast: new MemoryBroadcaster(), now: () => now, timeouts: DEFAULT_TIMEOUTS };

  for (const u of DEMO_USERS) {
    await store.upsertUser({ id: u.id, email: u.email, display_name: u.display_name, terms_accepted_at: null });
    await store.acceptTerms(u.id, TERMS_VERSION);
  }

  // Materials, as an operator publishes them.
  for (const { bundle } of compilePublished()) await store.putBundle(bundle, { origin: "operator" });

  // Characters.
  const options = await abilityOptions(store, "cadmium");
  // Each character is the role's Quick Start, from Quest Quick Start, which the campaigns below include.
  const starter = options.filter((a) => a.ref.startsWith("starter:"));
  const six = (role: string) => quickStartFor(role, starter, 6);
  const wren = await createCharacter(store, "user_demo", { system: "cadmium", name: "Wren Halloway", choices: { role: "fighter", abilities: six("fighter") } }, e);
  await updateCharacter(store, "user_demo", { character_id: wren.id, profile: { description: "A former lamplighter from Salinara who still counts the beacons as she walks." } });
  await createCharacter(store, "user_demo", { system: "quest", name: "Rook", choices: { role: "spy", abilities: six("spy") } }, e);
  await createCharacter(store, "user_demo", { system: "cadmium", name: "Sister Agathe", choices: { role: "invoker", abilities: six("invoker") } }, e);
  const tamsin = await createCharacter(store, "user_ari", { system: "cadmium", name: "Tamsin Reed", choices: { role: "ranger", abilities: six("ranger") } }, e);
  const bo = await createCharacter(store, "user_bo", { system: "cadmium", name: "Bo the Cartographer", choices: { role: "wizard", abilities: six("wizard") } }, e);

  // The exemplar campaign, authored by the demo user.
  const materials = [
    { kind: "setting", id: "lantern_coast", version: "1.1.0" },
    { kind: "setting", id: "quest_starter", version: "1.0.0" },
    { kind: "adventure", id: "sunken_archive", version: "1.0.0" },
  ];
  const campaign = await createCampaign(store, "user_demo", { title: "The Sunken Archive", description: "Thursday evenings: a salvage race through the Tessera Isles.", system: "cadmium", system_versions: "^1.0", modules: ["armor", "stash"], materials }, e);
  const link = (await rotateInviteLink(store, "user_demo", campaign.id, e)).invite_link_code!;
  await joinByLink(store, "user_ari", link);
  await joinByLink(store, "user_bo", link);
  const invitation = (await invite(store, "user_demo", { campaign_id: campaign.id, message: "We play Thursdays at seven.", note: "for Mira" }, e)).code;

  // A game in progress: two characters in Orvelle, a few actions taken.
  const game = await createInstance(store, "user_demo", { campaign_id: campaign.id, name: "Thursday table" }, e);
  await addCharacter(deps, "user_demo", { instance_id: game.id, character_id: wren.id });
  await addCharacter(deps, "user_ari", { instance_id: game.id, character_id: tamsin.id });
  await startInstance(deps, "user_demo", game.id);
  let n = 0;
  const act = (user: string, tool: string, args: Record<string, unknown>) => submitAction(deps, user, { instance_id: game.id, tool, args, idempotency_key: `demo-seed-${n++}` }, e);
  await act("user_demo", "move", { to_id: "plaza_lamp" });
  await act("user_ari", "move", { to_id: "liesl" });
  await act("user_demo", "take", { entity_id: "plaza_lamp" });
  await act("user_ari", "talk", { npc_id: "liesl", topic_id: "map", utterance: "What did you draw there?" });
  await act("user_demo", "move", { to_id: "guildhall_door" });
  await act("user_ari", "move", { to_id: "notice_board" });

  // A second game, waiting in the lobby.
  const lobby = await createInstance(store, "user_demo", { campaign_id: campaign.id, name: "Sunday one-shot" }, e);
  await addCharacter(deps, "user_bo", { instance_id: lobby.id, character_id: bo.id });

  // A weekly session for the game in progress, starting next Thursday at 19:00 UTC.
  const next = new Date(now);
  next.setUTCDate(next.getUTCDate() + ((4 - next.getUTCDay() + 7) % 7 || 7));
  next.setUTCHours(19, 0, 0, 0);
  const session = await scheduleSession(store, "user_demo", { instance_id: game.id, title: "Thursday table", starts_at: next.toISOString(), timezone: "UTC", duration_minutes: 180, recurrence: { freq: "weekly", interval: 1, count: 8 } }, e);
  await rsvp(store, "user_demo", { session_id: session.id, occurrence_start: next.toISOString(), response: "yes" });
  await rsvp(store, "user_ari", { session_id: session.id, occurrence_start: next.toISOString(), response: "maybe" });

  // A campaign the demo user joined as a player.
  const theirs = await createCampaign(store, "user_ari", { title: "Errands on the Lantern Coast", description: "Ari's table: side quests, shops, and the fog.", system: "cadmium", system_versions: "^1.0", modules: ["armor", "stash"], materials }, e);
  await joinByLink(store, "user_demo", (await rotateInviteLink(store, "user_ari", theirs.id, e)).invite_link_code!);

  // An adventure draft: the exemplar itself, imported as an author would.
  const files = [...pack(PUBLISHED.adventure)].map(([name, data]) => ({ name: `sunken_archive/${name}`, data }));
  const draft = await importDraft(store, "user_demo", zip(files), e).catch((x) => void console.error("draft", (x as Error).message));

  // Last, so the ids above stay the same: an archived and a recently deleted campaign, character, and draft.
  const past = await createCampaign(store, "user_demo", { title: "Summer in Vessaro", description: "A finished summer campaign.", system: "cadmium", system_versions: "^1.0", modules: ["armor", "stash"], materials }, e);
  await archiveCampaign(store, "user_demo", past.id);
  const dropped = await createCampaign(store, "user_demo", { title: "Test table", description: "A campaign made to try things out.", system: "cadmium", system_versions: "^1.0", modules: ["armor", "stash"], materials }, e);
  await deleteCampaign(deps, "user_demo", { campaign_id: dropped.id, confirm: dropped.title });
  const oldTam = await createCharacter(store, "user_demo", { system: "cadmium", name: "Old Tam", choices: { role: "doctor", abilities: six("doctor") } }, e);
  await archiveCharacter(store, "user_demo", oldTam.id);
  const tryout = await createCharacter(store, "user_demo", { system: "cadmium", name: "Test character", choices: { role: "magician", abilities: six("magician") } }, e);
  await deleteCharacter(store, "user_demo", tryout.id);
  const notes = { system: "cadmium", requires_settings: [{ id: "lantern_coast", versions: "^1.0" }] };
  const shelved = await createDraft(store, "user_demo", { ...notes, material_id: "fog_bell", title: "The Fog Bell" }, e);
  await archiveDraft(store, "user_demo", shelved.id);
  const scrap = await createDraft(store, "user_demo", { ...notes, material_id: "scratch", title: "Scratch pad" }, e);
  await deleteDraft(store, "user_demo", scrap.id);

  return { campaign: campaign.id, game: game.id, lobby: lobby.id, character: wren.id, draft: draft ? draft.draft.id : null, invitation, link, archivedCampaign: past.id, archivedCharacter: oldTam.id };
}
