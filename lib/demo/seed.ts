// The demo world (lib/server/demo.ts): content for every screen, built through the application's own
// operations so it is what real use produces. Three users; the published materials; Cadmium and Quest
// characters; a campaign of the exemplar with a game in progress, a lobby, a weekly session, and an
// invitation; a campaign the demo user joined; and an adventure draft.

import { join } from "node:path";
import { abilityOptions, createCharacter, updateCharacter } from "../api/characters";
import { createCampaign, joinByLink, rotateInviteLink } from "../api/campaigns";
import { importDraft } from "../api/drafts";
import type { Entropy } from "../api/entropy";
import { addCharacter, createInstance, startInstance, submitAction } from "../api/instances";
import { invite } from "../api/invitations";
import { rsvp, scheduleSession } from "../api/schedules";
import { TERMS_VERSION } from "../api/terms";
import { MemoryBroadcaster } from "../broadcast";
import { DEFAULT_TIMEOUTS, type Deps } from "../coordinator/instance";
import { zip } from "../export/zip";
import { compileAdventure, compileSetting, formatDiagnostic } from "../materials";
import { readPackDir } from "../materials/fs";
import type { Store } from "../store";

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
const pack = (p: Pack) => ("materials" in p ? readPackDir(join(process.cwd(), "materials", p.materials, "pack")) : readPackDir(join(process.cwd(), "cadmium-spec", "spec", "examples", p.example)));

function setting(p: Pack) {
  const r = compileSetting(pack(p));
  if (!r.bundle) throw new Error(`${JSON.stringify(p)}: ${r.diagnostics.map(formatDiagnostic).join("; ")}`);
  return r.bundle;
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
}

export async function seedDemo(store: Store, now = new Date()): Promise<DemoWorld> {
  const e = counting();
  const deps: Deps = { store, broadcast: new MemoryBroadcaster(), now: () => now, timeouts: DEFAULT_TIMEOUTS };

  for (const u of DEMO_USERS) {
    await store.upsertUser({ id: u.id, email: u.email, display_name: u.display_name, terms_accepted_at: null });
    await store.acceptTerms(u.id, TERMS_VERSION);
  }

  // Materials, as an operator publishes them.
  const coast = setting({ materials: "lantern_coast" });
  const settings = [setting({ example: "derelict_station" }), setting({ example: "sunless_crypt" }), setting({ materials: "quest_starter" }), coast];
  for (const b of settings) await store.putBundle(b, { origin: "operator" });
  const exemplar = compileAdventure(pack({ materials: "sunken_archive" }), [coast]);
  if (!exemplar.bundle) throw new Error(exemplar.diagnostics.map(formatDiagnostic).join("; "));
  await store.putBundle(exemplar.bundle, { origin: "operator" });

  // Characters.
  const options = await abilityOptions(store, "cadmium");
  const six = (role: string) => options.filter((a) => a.roles.includes(role)).slice(0, 6).map((a) => a.ref);
  const wren = await createCharacter(store, "user_demo", { system: "cadmium", name: "Wren Halloway", choices: { role: "fighter", abilities: six("fighter") } }, e);
  await updateCharacter(store, "user_demo", { character_id: wren.id, profile: { description: "A former lamplighter from Salinara who still counts the beacons as she walks." } });
  await createCharacter(store, "user_demo", { system: "quest", name: "Rook", choices: { role: "spy", abilities: six("spy") } }, e);
  await createCharacter(store, "user_demo", { system: "cadmium", name: "Sister Agathe", choices: { role: "invoker", abilities: six("invoker") } }, e);
  const tamsin = await createCharacter(store, "user_ari", { system: "cadmium", name: "Tamsin Reed", choices: { role: "ranger", abilities: six("ranger") } }, e);
  const bo = await createCharacter(store, "user_bo", { system: "cadmium", name: "Bo the Cartographer", choices: { role: "wizard", abilities: six("wizard") } }, e);

  // The exemplar campaign, authored by the demo user.
  const materials = [
    { kind: "setting", id: "lantern_coast", version: "1.0.0" },
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
  const files = [...pack({ materials: "sunken_archive" })].map(([name, data]) => ({ name: `sunken_archive/${name}`, data }));
  const draft = await importDraft(store, "user_demo", zip(files), e).catch((x) => void console.error("draft", (x as Error).message));

  return { campaign: campaign.id, game: game.id, lobby: lobby.id, character: wren.id, draft: draft ? draft.draft.id : null, invitation, link };
}
