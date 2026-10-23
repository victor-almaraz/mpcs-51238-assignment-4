// Compiler fixtures: each is an example pack with one change that breaks one check
// (AGENTS.md, "Test layers": one failing fixture per compilation check).

import { join } from "node:path";
import { parse, stringify } from "yaml";
import { readPackDir } from "../fs";

export const EXAMPLES = join(__dirname, "../../../cadmium-spec/spec/examples");

export type Files = Map<string, Uint8Array | string>;

export function example(name: "derelict_station" | "sunless_crypt"): Files {
  return new Map(readPackDir(join(EXAMPLES, name)));
}

type Data = Record<string, unknown>;

/** Edits one YAML file of `files` as data. */
export function edit(files: Files, path: string, change: (data: Data) => void): Files {
  const out = new Map(files);
  const source = out.get(path);
  const data = (source === undefined ? {} : parse(typeof source === "string" ? source : new TextDecoder().decode(source), { version: "1.2" })) as Data;
  change(data);
  out.set(path, stringify(data, { version: "1.2" }));
  return out;
}

export const at = (data: Data, ...keys: (string | number)[]): Data => keys.reduce<Data>((d, k) => d[k] as Data, data);

/** A minimal PNG header of the given size, enough for the dimension check. */
export function png(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  return b;
}

export interface Fixture {
  name: string;
  check: string;
  files: () => Files;
  /** The documented `FILE: PATH: MESSAGE` lines, in sorted order. */
  expected: string[];
}

const ds = () => example("derelict_station");
const sc = () => example("sunless_crypt");

const torchAsset = { kind: "icon", source: { game_icons: "lorc/torch" }, alt: "A burning torch.", license: "CC-BY-3.0", credit: "Lorc, game-icons.net" };

export const SETTING_FIXTURES: Fixture[] = [
  // Files and layout
  {
    name: "a file outside the layout",
    check: "file",
    files: () => new Map(ds()).set("notes.txt", "todo"),
    expected: ["notes.txt: .: is not part of a setting pack"],
  },
  {
    name: "a missing required file",
    check: "file",
    files: () => {
      const f = ds();
      f.delete("tables.yaml");
      return f;
    },
    expected: ["tables.yaml: .: is required"],
  },
  {
    name: "YAML that does not parse",
    check: "file",
    files: () => new Map(ds()).set("parser.yaml", "synonyms: [unclosed"),
    expected: ["parser.yaml: .: Flow sequence in block collection must be sufficiently indented and end with a ] at line 1, column 20"],
  },
  {
    name: "a key defined in two files of a merged directory",
    check: "duplicate_key",
    files: () => new Map(ds()).set("entities/extra.yaml", "wrench:\n  kind: item\n  label: spare wrench\n"),
    expected: ["entities/items.yaml: wrench: 'wrench' is already defined in entities/extra.yaml"],
  },
  // Schema checks
  {
    name: "a missing required field",
    check: "schema",
    files: () => edit(ds(), "entities/items.yaml", (d) => delete at(d, "wrench").label),
    expected: ["entities/items.yaml: wrench: missing required key 'label'"],
  },
  {
    name: "an unknown key",
    check: "schema",
    files: () => edit(ds(), "entities/items.yaml", (d) => (at(d, "wrench").weight = 3)),
    expected: ["entities/items.yaml: wrench: unknown key 'weight'; expected 'kind', 'label', 'tags', 'art', 'light', 'uses', 'use', 'system_stats'"],
  },
  {
    name: "a value out of range",
    check: "schema",
    files: () => edit(ds(), "manifest.yaml", (d) => (at(d, "terrain", "coolant").cost = 5)),
    expected: ["manifest.yaml: terrain.coolant.cost: 5 is greater than the maximum 4"],
  },
  {
    name: "a pattern mismatch",
    check: "schema",
    files: () => edit(ds(), "tables.yaml", (d) => (at(d, "drone_parts", 0).ref = "Battery")),
    expected: ["tables.yaml: drone_parts[0].ref: 'Battery' is not a valid ref"],
  },
  {
    name: "a wrong key in an effect names the key and the expected keys",
    check: "schema",
    files: () => edit(ds(), "entities/items.yaml", (d) => (at(d, "medkit", "use").effects = [{ heall: { target: "target", amount: 2 } }])),
    expected: [
      "entities/items.yaml: medkit.use.effects[0]: unknown key 'heall'; expected 'damage', 'heal', 'apply_condition', 'remove_condition', 'give_item', 'remove_item', 'drop_item', 'spawn', 'despawn', 'move_entity', 'open_door', 'close_door', 'set_light', 'set_room_light', 'set_hostile', 'reveal', 'start_combat', 'if'",
    ],
  },
  {
    name: "a wrong key inside an effect names that effect's keys",
    check: "schema",
    files: () => edit(ds(), "entities/items.yaml", (d) => (at(d, "medkit", "use").effects = [{ heal: { target: "target", amt: 2 } }])),
    expected: [
      "entities/items.yaml: medkit.use.effects[0].heal: requires one of 'dice', 'amount'",
      "entities/items.yaml: medkit.use.effects[0].heal: unknown key 'amt'; expected 'target', 'dice', 'amount'",
    ],
  },
  {
    name: "a wrong key in a requirement",
    check: "schema",
    files: () => edit(ds(), "entities/fixtures.yaml", (d) => (at(d, "control_panel", "verbs", "operate").requirement = { holds: "keycard" })),
    expected: [
      "entities/fixtures.yaml: control_panel.verbs.operate.requirement: unknown key 'holds'; expected 'all', 'any', 'not', 'flag', 'eq', 'gte', 'lte', 'stage', 'has_item', 'location', 'room', 'near', 'within', 'illumination', 'defeated', 'check'",
    ],
  },
  {
    name: "a plot effect in a setting pack",
    check: "schema",
    files: () => edit(ds(), "entities/fixtures.yaml", (d) => (at(d, "control_panel", "verbs", "read").effects = [{ set_flag: { flag: "read", value: true } }])),
    expected: [
      "entities/fixtures.yaml: control_panel.verbs.read.effects[0]: unknown key 'set_flag'; expected 'damage', 'heal', 'apply_condition', 'remove_condition', 'give_item', 'remove_item', 'drop_item', 'spawn', 'despawn', 'move_entity', 'open_door', 'close_door', 'set_light', 'set_room_light', 'set_hostile', 'reveal', 'start_combat', 'if'",
    ],
  },
  // Rules-system checks
  {
    name: "an installed version outside system.versions",
    check: "system",
    files: () => edit(ds(), "manifest.yaml", (d) => (at(d, "system").versions = "^2.0")),
    expected: ["manifest.yaml: system.versions: installed quest 1.2.0 does not satisfy '^2.0'"],
  },
  {
    name: "a module the system does not offer",
    check: "system",
    files: () => edit(ds(), "manifest.yaml", (d) => (at(d, "system").modules = ["armor"])),
    expected: ["manifest.yaml: system.modules: 'armor' is not a module of quest; modules: none"],
  },
  {
    name: "creature system_stats outside the system's schema",
    check: "system_stats",
    files: () => edit(sc(), "entities/creatures.yaml", (d) => (at(d, "skeleton", "system_stats").template = "goon")),
    expected: ["entities/creatures.yaml: skeleton.system_stats.template: quest creature: 'goon' is not one of ['commoner', 'minion', 'boss']"],
  },
  {
    name: "a module field without its module",
    check: "system_stats",
    files: () =>
      edit(
        edit(ds(), "manifest.yaml", (d) => (d.system = { id: "cadmium", versions: "^1.0" })),
        "entities/items.yaml",
        (d) => (at(d, "blast_shield").system_stats = { armor: 4 }),
      ),
    expected: ["entities/items.yaml: blast_shield.system_stats: cadmium item: unknown key 'armor'; expected 'weapon', 'damage', 'ranged'"],
  },
  {
    name: "structure system_stats outside the system's schema",
    check: "system_stats",
    files: () => edit(ds(), "entities/doors.yaml", (d) => (at(d, "hatch").system_stats = { hp: 0 })),
    expected: ["entities/doors.yaml: hatch.system_stats.hp: quest structure: 0 is less than the minimum 1"],
  },
  {
    name: "ability system_stats outside the system's schema",
    check: "system_stats",
    files: () => edit(ds(), "abilities/tech.yaml", (d) => (at(d, "overload").system_stats = { roll: true })),
    expected: ["abilities/tech.yaml: overload.system_stats: quest ability: missing required key 'cost'"],
  },
  {
    name: "a check specification outside the system's schema",
    check: "system_stats",
    files: () => edit(ds(), "entities/fixtures.yaml", (d) => (at(d, "locker", "verbs", "open").requirement = { check: { dc: 12 } })),
    expected: ["entities/fixtures.yaml: locker.verbs.open.requirement.check: quest check: unknown key 'dc'; expected 'tags'"],
  },
  // Cross-reference checks
  {
    name: "a ref that resolves to nothing",
    check: "ref",
    files: () => edit(ds(), "tables.yaml", (d) => (at(d, "locker_loot", 0).ref = "stimpack")),
    expected: ["tables.yaml: locker_loot[0].ref: 'stimpack' is not an entity template of this pack"],
  },
  {
    name: "a ref of the wrong kind",
    check: "ref",
    files: () => edit(ds(), "entities/fixtures.yaml", (d) => (at(d, "control_panel", "verbs", "operate").requirement = { has_item: "hatch" })),
    expected: ["entities/fixtures.yaml: control_panel.verbs.operate.requirement.has_item: 'hatch' is a door template, not an item template"],
  },
  {
    name: "a ref outside the pack's namespace",
    check: "ref",
    files: () => edit(ds(), "tables.yaml", (d) => (at(d, "drone_parts", 0).ref = "crypt:mace")),
    expected: ["tables.yaml: drone_parts[0].ref: 'crypt:mace' is outside the pack's namespace 'base'"],
  },
  {
    name: "an item table holding a creature",
    check: "ref",
    files: () => edit(ds(), "tables.yaml", (d) => (at(d, "drone_parts", 0).ref = "civilian")),
    expected: ["tables.yaml: drone_parts[0].ref: 'civilian' is a creature template; table 'drone_parts' supplies items to loot of 'maintenance_drone'"],
  },
  {
    name: "an undeclared damage type",
    check: "declared",
    files: () => edit(ds(), "abilities/tech.yaml", (d) => (at(d, "overload", "effects", 0, "damage").type = "plasma")),
    expected: ["abilities/tech.yaml: overload.effects[0].damage.type: damage type 'plasma' is not declared in damage_types"],
  },
  {
    name: "an undeclared condition",
    check: "declared",
    files: () => edit(sc(), "abilities/prayers.yaml", (d) => (at(d, "turn_undead", "effects", 1, "apply_condition").condition = "awed")),
    expected: ["abilities/prayers.yaml: turn_undead.effects[1].apply_condition.condition: condition 'awed' is not declared"],
  },
  {
    name: "an undeclared terrain type",
    check: "declared",
    files: () => edit(ds(), "rooms/reactor.yaml", (d) => (at(d, "reactor_room", "map", "legend")["~"] = "lava")),
    expected: ["rooms/reactor.yaml: reactor_room.map.legend[\"~\"]: terrain 'lava' is not declared"],
  },
  {
    name: "generation.door that is not a door",
    check: "generation",
    files: () => edit(ds(), "manifest.yaml", (d) => (at(d, "generation").door = "locker")),
    expected: ["manifest.yaml: generation.door: 'locker' is a container template, not a door template"],
  },
  {
    name: "a generation lock whose key is not an item",
    check: "generation",
    files: () => edit(ds(), "manifest.yaml", (d) => (at(d, "generation", "locks").bulkhead = "civilian")),
    expected: ["manifest.yaml: generation.locks.bulkhead: 'civilian' is a creature template, not an item template"],
  },
  {
    name: "a generation lock that is not a door",
    check: "generation",
    files: () => edit(ds(), "manifest.yaml", (d) => (at(d, "generation").locks = { crate_stack: "keycard" })),
    expected: ["manifest.yaml: generation.locks.crate_stack: 'crate_stack' is an obstacle template, not a door template"],
  },
  {
    name: "remains without system_stats",
    check: "remains",
    files: () => edit(ds(), "entities/obstacles.yaml", (d) => (at(d, "support_pillar").remains = "scrap")),
    expected: ["entities/obstacles.yaml: support_pillar.remains: requires system_stats, so that the template can be destroyed"],
  },
  {
    name: "a depth range out of order",
    check: "depth",
    files: () => edit(ds(), "tables.yaml", (d) => (at(d, "encounters_machine", 0).depth = [3, 1])),
    expected: ["tables.yaml: encounters_machine[0].depth: depth range [3, 1] is not ordered"],
  },
  {
    name: "a room template's depths out of order",
    check: "depth",
    files: () => edit(ds(), "rooms/reactor.yaml", (d) => (at(d, "reactor_room").max_depth = 2)),
    expected: ["rooms/reactor.yaml: reactor_room.max_depth: max_depth 2 is less than min_depth 3"],
  },
  {
    name: "a light whose dim radius is below its bright radius",
    check: "light",
    files: () => edit(sc(), "entities/items.yaml", (d) => (at(d, "torch").light = { bright: 4, dim: 2 })),
    expected: ["entities/items.yaml: torch.light.dim: dim radius 2 is less than bright radius 4"],
  },
  {
    name: "currency without a denomination of value 1",
    check: "currency",
    files: () => edit(ds(), "manifest.yaml", (d) => (at(d, "currency", "denominations", "credit").value = 5)),
    expected: ["manifest.yaml: currency.denominations: needs a denomination of value 1"],
  },
  // Art checks
  {
    name: "an art ref that resolves to no asset",
    check: "art",
    files: () => edit(sc(), "entities/items.yaml", (d) => (at(d, "torch").art = ["torch_icon"])),
    expected: ["entities/items.yaml: torch.art[0]: 'torch_icon' is not an asset of this pack"],
  },
  {
    name: "an art list with two assets of one kind",
    check: "art",
    files: () =>
      edit(edit(sc(), "assets.yaml", (d) => ((d.torch_icon = torchAsset), (d.flame_icon = { ...torchAsset, source: { game_icons: "lorc/flame" } }))), "entities/items.yaml", (d) => (at(d, "torch").art = ["torch_icon", "flame_icon"])),
    expected: ["entities/items.yaml: torch.art: 'flame_icon' and 'torch_icon' are both icons; an art list holds at most one of each kind"],
  },
  {
    name: "a missing asset file",
    check: "art",
    files: () => edit(sc(), "assets.yaml", (d) => (d.warden = { kind: "portrait", source: { file: "assets/warden.png" }, alt: "The crypt warden." })),
    expected: ["assets.yaml: warden.source.file: file 'assets/warden.png' does not exist"],
  },
  {
    name: "a file type not allowed for the kind",
    check: "art",
    files: () => edit(sc(), "assets.yaml", (d) => (d.warden = { kind: "portrait", source: { file: "assets/warden.svg" }, alt: "The crypt warden." })).set("assets/warden.svg", "<svg/>"),
    expected: ["assets.yaml: warden.source.file: a portrait cannot be SVG; allowed: png, webp"],
  },
  {
    name: "an image over the size limit",
    check: "art",
    files: () => edit(sc(), "assets.yaml", (d) => (d.floor_tile = { kind: "tile", source: { file: "assets/floor.png" }, alt: "Flagstones." })).set("assets/floor.png", png(512, 256)),
    expected: ["assets.yaml: floor_tile.source.file: 'assets/floor.png' is 512 x 256 px; a tile is at most 256 x 256"],
  },
  {
    name: "a file over the byte limit",
    check: "art",
    files: () => edit(sc(), "assets.yaml", (d) => (d.crest = { kind: "icon", source: { file: "assets/crest.svg" }, alt: "A crest." })).set("assets/crest.svg", "<svg>" + " ".repeat(200 * 1024) + "</svg>"),
    expected: ["assets.yaml: crest.source.file: 'assets/crest.svg' has 204811 bytes; the limit for SVG is 204800"],
  },
  {
    name: "an asset without alt",
    check: "schema",
    files: () => edit(sc(), "assets.yaml", (d) => (d.torch_icon = { ...torchAsset, alt: undefined })),
    expected: ["assets.yaml: torch_icon: missing required key 'alt'"],
  },
  {
    name: "an attribution license without credit",
    check: "art",
    files: () => edit(sc(), "assets.yaml", (d) => (d.torch_icon = { ...torchAsset, credit: undefined })),
    expected: ["assets.yaml: torch_icon: license CC-BY-3.0 requires 'credit'"],
  },
  // Map checks
  {
    name: "rows of unequal length",
    check: "map",
    files: () => edit(sc(), "rooms/tomb.yaml", (d) => (at(d, "founders_tomb", "map", "rows")[1] = "......")),
    expected: ["rooms/tomb.yaml: founders_tomb.map.rows[1]: has 6 characters; row 0 has 7"],
  },
  {
    name: "more than 64 rows",
    check: "schema",
    files: () => edit(sc(), "rooms/tomb.yaml", (d) => (at(d, "founders_tomb", "map").rows = Array<string>(65).fill("......."))),
    expected: ["rooms/tomb.yaml: founders_tomb.map.rows: must have at most 64 items"],
  },
  {
    name: "a character that is neither built in nor in the legend",
    check: "map",
    files: () => edit(sc(), "rooms/tomb.yaml", (d) => (at(d, "founders_tomb", "map", "rows")[1] = "...x...")),
    expected: ["rooms/tomb.yaml: founders_tomb.map.rows[1]: character 'x' at [3, 1] is not built in or in the legend"],
  },
  {
    name: "a placement outside the map",
    check: "placement",
    files: () => edit(sc(), "rooms/tomb.yaml", (d) => (at(d, "founders_tomb", "contents", 1).at = [9, 0])),
    expected: ["rooms/tomb.yaml: founders_tomb.contents[1].at: cell [9, 0] is outside the 7x4 map"],
  },
  {
    name: "a footprint reaching outside the map",
    check: "placement",
    files: () => edit(sc(), "rooms/tomb.yaml", (d) => (at(d, "founders_tomb", "contents", 0).at = [6, 1])),
    expected: ["rooms/tomb.yaml: founders_tomb.contents[0].at: cell [7, 1] is outside the 7x4 map"],
  },
  {
    name: "a placement on a void cell",
    check: "placement",
    files: () => edit(edit(sc(), "rooms/tomb.yaml", (d) => (at(d, "founders_tomb", "map", "rows")[2] = ".. ....")), "rooms/tomb.yaml", (d) => (at(d, "founders_tomb", "contents", 1).at = [2, 2])),
    expected: ["rooms/tomb.yaml: founders_tomb.contents[1].at: cell [2, 2] is void"],
  },
  {
    name: "a placement on terrain that obstructs movement",
    check: "placement",
    files: () => edit(sc(), "rooms/tomb.yaml", (d) => (at(d, "founders_tomb", "contents", 1).at = [0, 0])),
    expected: ["rooms/tomb.yaml: founders_tomb.contents[1].at: cell [0, 0] has terrain 'wall', which obstructs movement"],
  },
  {
    name: "two creatures on one cell",
    check: "placement",
    files: () =>
      edit(sc(), "rooms/tomb.yaml", (d) => {
        at(d, "founders_tomb").contents = [{ ref: "crypt_warden", at: [1, 2] }, { ref: "skeleton", at: [1, 2] }];
      }),
    expected: ["rooms/tomb.yaml: founders_tomb.contents[1].at: cell [1, 2] already holds 'crypt_warden' (contents[0])"],
  },
  {
    name: "two doors on one cell",
    check: "placement",
    files: () =>
      edit(sc(), "rooms/tomb.yaml", (d) => {
        at(d, "founders_tomb").contents = [{ ref: "iron_door", at: [0, 1] }, { ref: "wooden_door", at: [0, 1] }];
      }),
    expected: ["rooms/tomb.yaml: founders_tomb.contents[1].at: cell [0, 1] already holds 'iron_door' (contents[0]), and one obstructs movement"],
  },
  {
    name: "a movement-obstructing entity sharing a cell",
    check: "placement",
    files: () => edit(sc(), "rooms/tomb.yaml", (d) => (at(d, "founders_tomb", "contents", 1).at = [3, 1])),
    expected: ["rooms/tomb.yaml: founders_tomb.contents[1].at: cell [3, 1] already holds 'sarcophagus' (contents[0]), and one obstructs movement"],
  },
  {
    name: "a legend placement on an occupied cell",
    check: "placement",
    files: () => edit(ds(), "rooms/reactor.yaml", (d) => (at(d, "reactor_room", "contents", 0).at = [2, 0])),
    expected: ["rooms/reactor.yaml: reactor_room.contents[0].at: cell [2, 0] already holds 'support_pillar' (legend at [2, 0]), and one obstructs movement"],
  },
  {
    name: "at combined with count",
    check: "schema",
    files: () => edit(sc(), "rooms/tomb.yaml", (d) => (at(d, "founders_tomb", "contents", 2).at = [1, 1])),
    expected: ["rooms/tomb.yaml: founders_tomb.contents[2]: cannot combine 'at', 'count'"],
  },
  {
    name: "a room template placement with an id",
    check: "placement",
    files: () => edit(sc(), "rooms/tomb.yaml", (d) => (at(d, "founders_tomb", "contents", 1).id = "warden")),
    expected: ["rooms/tomb.yaml: founders_tomb.contents[1].id: room template contents cannot use 'id'"],
  },
];
