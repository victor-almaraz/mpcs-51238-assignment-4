# Setting Packs

A setting pack is a material pack that supplies the vocabulary and generic content of a setting for one rules system: terrain, creatures, items, containers, fixtures, obstacles, doors, abilities, conditions, room templates, tables, parser hints, and narration style. Rules belong to the rules system; plot belongs to adventure packs. A setting pack MUST NOT contain rule logic beyond the engine's requirement and effect languages.

Setting packs are written by users, one per world or genre, and adventures require them by id and version range. The packs in `spec/examples/` demonstrate the format. Content that exists for one story belongs in that adventure's `entities/`; see [adventure-packs.md](adventure-packs.md#materials-are-authored).

Statistics are system-specific. Every creature, item, and ability carries a `system_stats` object validated against the bound system's schema for that kind. Destructible obstacles and doors carry `system_stats` validated against the system's `structure` schema. See [systems/](systems/README.md#implemented-systems).

## Directory layout

```
derelict_station/
  manifest.yaml
  conditions.yaml
  abilities/*.yaml
  entities/*.yaml
  rooms/*.yaml
  tables.yaml
  parser.yaml
```

## References

Content is referenced as `namespace:key`. The manifest declares the pack's namespace. An adventure's namespace is its id. A reference without a namespace resolves within the file's own namespace.

## manifest.yaml

```yaml
format_version: 2
kind: setting
id: derelict_station
version: 3.0.0
namespace: base
title: Derelict Station

system: { id: quest, versions: "^1.0" }

damage_types: [kinetic, thermal, toxic]

terrain:
  coolant: { label: coolant pool, cost: 2, tags: [hazard] }
  console_bank: { label: console bank, obstructs: [movement] }

generation:
  door: hatch
  locks: { bulkhead: keycard, airlock_door: override_code }

starting_items: { table: starting_kit, picks: 2 }

narration:
  style: terse, clinical, dread
  person: second
  max_sentences: 4
```

| Key | Required | Meaning |
|---|---|---|
| `format_version` | yes | Format version of this document set. |
| `kind` | yes | `setting`. |
| `id`, `version`, `namespace` | yes | Identity. `version` is semantic. |
| `system` | yes | Rules system id and compatible version range: `^X[.Y]`, `~X.Y`, or exact `X.Y.Z`. |
| `damage_types` | yes | Allowed damage types for content in this pack and dependent adventures. |
| `terrain` | no | Terrain types besides the built-in `void`, `floor`, and `wall`. Each has `label`, `obstructs` (default `[]`), `cost` 1–4 (default 1), and `tags`. |
| `currency` | no | The setting's money: `id`, `label`, `unit` (the smallest unit's name), and `denominations`, a map of coin id to `label` and integer `value` in the smallest unit. One denomination has value 1. Denominations are for display; amounts are stored as integers in the smallest unit. Flags refer to it as `namespace:id`. |
| `generation` | yes | `door`: the door template the generator places in every doorway. `locks`: door templates the generator uses for lock-and-key pairs, each mapped to its key item. |
| `starting_items` | no | Table drawn from when a character joins an instance that uses this setting. |
| `narration` | yes | Instructions passed to the narrator: `style`, a phrase describing the voice; `person`, `second` or `third`; and `max_sentences`, 1–8. Every player reads the same narration, so characters are always named; in the second person, "you" addresses the whole party. |

A setting pack does not define stats, resources, character creation, or ordering. The rules system defines them.

## conditions.yaml

```yaml
irradiated:
  label: irradiated
  duration: 3
  on_turn_start:
    - damage: { target: actor, dice: 1d2, type: toxic }
panicked:
  label: panicked
  duration: 1
  blocks: [attack, ability]
  situation: { advantage: -1 }
```

`situation` adjusts the bearer's rolls. Each system interprets `advantage` and `modifier`; see [engine.md](engine.md#situation).

## abilities/*.yaml

```yaml
overload:
  label: Overload
  target: entity          # self | entity | door | none
  range: 6                # cells; omitted: any visible target
  system_stats: { roles: [wizard, magician], cost: { ap: 1 }, roll: true }
  effects:
    - damage: { target: target, amount: 2, type: thermal }
    - if:
        when: { check: { tags: [willpower] } }
        then: []
        else:
          - apply_condition: { target: actor, condition: panicked }
```

`system_stats` holds the ability's cost and roll rules in the system's terms. In Quest, `cost.ap` is paid on use and `roll: true` makes the engine roll a check before applying the effects.

## Maps

Room templates in setting packs and authored locations in adventure packs draw maps as rows of characters, north first. Every row has the same length, at most 64 characters, and a map has at most 64 rows.

```yaml
map:
  legend:
    "~": coolant
    "o": { terrain: floor, place: support_pillar }
  rows:
    - "..o..o.."
    - ".~~..~~."
```

| Character | Meaning |
|---|---|
| ` ` (space) | `void`: outside the map |
| `.` | `floor` |
| `#` | `wall` |
| Any other printable ASCII character | The `legend` entry for it: a terrain id, or `{ terrain, place }`, which also places one entity from a template on the cell |

Legend entries cannot redefine `.` or `#`. Entities placed through the legend have no id. Entities that triggers or effects refer to are placed in `contents` with an `id`.

Contents entries place entities:

| Key | Meaning |
|---|---|
| `ref` | Entity template. |
| `npc` | NPC id. Adventures only. |
| `id` | Entity id for triggers and effects. Adventures only; requires a count of 1. |
| `at` | Top-left cell of the entity's footprint. |
| `room` | Room to place in when `at` is omitted. Authored locations only. |
| `count` | Number to place, integer or dice; only without `at`. |
| `hidden` | Place with the `hidden` condition. |

Without `at`, cells are chosen by RNG among the placement cells defined in [generation.md](generation.md#7-population).

## Art

Art is optional; without it, clients draw content icons and plain shapes. Art is declared in `assets.yaml`, with image files in `assets/`.

```yaml
skeleton_portrait:
  kind: portrait
  source: { file: assets/skeleton.webp }
  alt: A skeleton in a rusted helm.
  license: CC-BY-4.0
  credit: Drawn by A. Artist
  provenance: Generated with Google Flow, model Imagen, 2026-10-30, prompt P-14.
torch_icon:
  kind: icon
  source: { game_icons: lorc/torch }
  alt: A burning torch.
  license: CC-BY-3.0
  credit: Lorc, game-icons.net
```

| Key | Meaning |
|---|---|
| `kind` | `icon`, `portrait`, or `tile`. |
| `source` | `{ game_icons: author/name }` or `{ file: assets/<name> }`. |
| `alt` | Text alternative, up to 200 characters. |
| `license` | SPDX identifier. Default `CC0-1.0`. |
| `credit` | Attribution. Required when the license requires attribution: every license whose SPDX identifier begins with `CC-BY`, such as `CC-BY-3.0`, `CC-BY-4.0`, and `CC-BY-SA-4.0`. |
| `provenance` | For art made with a generative tool: tool, model, date, and prompt id; up to 500 characters. |

game-icons.net publishes its icons under CC BY 3.0, so a `game_icons` asset sets `license: CC-BY-3.0` and a `credit` naming the icon's author, as `torch_icon` does.

Creature, item, container, fixture, obstacle, and door templates, abilities, terrain types, and adventure NPCs carry `art`: a list of refs to assets, at most one of each kind. Refs follow the `namespace:key` grammar, so adventures reuse a setting's art.

| File type | Allowed for | Limit |
|---|---|---|
| SVG | `icon`, `tile` | 200 KB |
| PNG, WebP | `portrait`, `tile` | 1 MB; portraits at most 1024 × 1024 px, tiles at most 256 × 256 px |

The compiled bundle names each file by its content hash, and `materials build` carries the bytes beside it; see [spec/README.md](../spec/README.md#asset-files). Models never receive art. Rendering and fallbacks are in [design/components.md](design/components.md#art).

## entities/*.yaml

Every entity template has a `kind`: `creature`, `item`, `container`, `fixture`, `obstacle`, or `door`. How each kind occupies and obstructs cells is defined in [engine.md](engine.md#entities-on-the-map).

### Creature

```yaml
security_frame:
  kind: creature
  label: security frame
  tags: [machine, hostile]
  behavior: defensive
  flee_when_harmed: true
  loot: { table: drone_parts, picks: 1 }
  system_stats: { template: boss, damage: 3 }
```

| Key | Required | Meaning |
|---|---|---|
| `behavior` | yes | `aggressive`, `defensive`, `passive`, or `fleeing`. See [engine.md](engine.md#entity-turns). |
| `footprint` | no | Cells occupied, `[width, height]`, 1–8 each. Default `[1, 1]`. |
| `flee_when_harmed` | no | Switch to `fleeing` after first taking harm. |
| `loot` | no | A pick from an item table, `{ table, picks }`. The compiler checks that the table supplies items. The key is reserved: the engine never draws it, and a dead creature keeps what it carries ([engine.md](engine.md#entities-on-the-map)). |
| `system_stats` | yes | The system's creature statistics. |
| `tags` | no | `hostile` makes the creature a combat participant. |

Each rules system defines its own creature statistics. Quest uses a template (`commoner`, `minion`, `boss`) with optional `hp` and `damage`; see [systems/quest.md](systems/quest.md#creatures-and-items).

### Item

```yaml
wrench:
  kind: item
  label: heavy wrench
  tags: [weapon, tool]
  system_stats: { weapon: true, damage: 2 }
medkit:
  kind: item
  label: medkit
  uses: 3
  use:
    target: self_or_ally
    effects:
      - heal: { target: target, amount: 2 }
```

`uses` and `use` are engine fields. `system_stats` is optional for items with no rules role, such as keys.

### Container

```yaml
locker:
  kind: container
  label: storage locker
  contents: { table: locker_loot, picks: 2 }
  verbs:
    open:
      requirement: { check: { tags: [athletics] } }
      effects: []
```

### Fixture

```yaml
control_panel:
  kind: fixture
  label: control panel
  verbs:
    operate:
      requirement: { has_item: base:keycard }
      effects: []
    read:
      effects: []
```

`contents` is a pick from a table, `{ table, picks }`, or a list of item refs. It is drawn when the container is placed: at instance start for a container in a location, and when an effect or a destruction's `remains` creates it. Each drawn item becomes an item entity held by the container.

Containers and fixtures MAY set `footprint`, `obstructs` (default `[]`), `cover` (default `false`), `light`, and `art`. A container MAY also set `capacity`, which lets characters store items in it with `give` and shows its contents to characters in reach, and `lock`, a requirement for `take` and `give` on it; see [engine.md](engine.md#containers). An altar that blocks movement and shelters those behind it sets `obstructs: [movement]` and `cover: true`.

Verbs on containers, fixtures, and obstacles populate the `verb` enum of the `interact` tool.

### Light sources

Creatures, items, containers, fixtures, and obstacles MAY emit light:

```yaml
torch:
  kind: item
  label: torch
  uses: 6
  light: { bright: 2, dim: 4 }
brazier:
  kind: fixture
  label: iron brazier
  obstructs: [movement]
  light: { bright: 3, dim: 6, lit: false }
  verbs: {}
```

| Key | Meaning |
|---|---|
| `bright` | Radius in cells of bright light, 0–12. |
| `dim` | Radius in cells of dim light, 0–24, at least `bright`. |
| `lit` | Initial state. Default `true`. |

A carried item with `light` and no `use` effects toggles when used. Containers, fixtures, and obstacles with `light` gain the `interact` verbs `light` and `extinguish`. Whether darkness limits sight depends on the rules system; see [engine.md](engine.md#lighting). A verb with no effects produces an `interacted` event, which adventure triggers MAY match to apply plot effects.

### Obstacle

```yaml
crate_stack:
  kind: obstacle
  label: stack of crates
  cover: true
  system_stats: { hp: 4 }
  remains: scrap
support_pillar:
  kind: obstacle
  label: support pillar
  cover: true
```

| Key | Required | Meaning |
|---|---|---|
| `footprint` | no | Default `[1, 1]`. |
| `obstructs` | no | Default `[movement, sight]`. |
| `cover` | no | Grants cover to creatures it lies between. Default `false`. |
| `system_stats` | no | The system's structure statistics. Present: the obstacle can be attacked and destroyed. |
| `remains` | no | Template placed in the obstacle's cell when it is destroyed. Requires `system_stats`. |
| `verbs` | no | As for fixtures. |

### Door

```yaml
hatch:
  kind: door
  label: hatch
  system_stats: { hp: 6 }
bulkhead:
  kind: door
  label: bulkhead
airlock_door:
  kind: door
  label: airlock door
  obstructs: [movement]
```

| Key | Required | Meaning |
|---|---|---|
| `open` | no | Initial state. Default `false`. |
| `obstructs` | no | What the door stops while closed. Default `[movement, sight]`; a glass door sets `[movement]`. |
| `lock` | no | Requirement to open, in any requirement form. Omitted: unlocked. The generator replaces it for lock-and-key pairs. |
| `system_stats` | no | Structure statistics. Present: the door can be destroyed. |
| `remains` | no | As for obstacles. |
| `verbs` | no | Verbs besides the built-in `open` and `close`. |

A door occupies one cell. Draw doorways in maps as floor cells with the door placed on them.

Locks use the full requirement language:

```yaml
fog_bank:
  kind: door
  label: bank of fog
  obstructs: [movement, sight]
  lock: { all: [ { has_item: lamp }, { not: { illumination: dark } } ] }
vault_door:
  kind: door
  label: vault door
  lock: { has_item: vault_key }
  system_stats: { hp: 20 }
```

The fog bank opens only for an actor carrying a lamp whose light reaches the actor's cell. The vault door opens with its key, or breaks under 20 points of harm, because destruction ignores the lock.

Setting pack effects exclude plot effects: `set_flag`, `add_flag`, `set_stage`, `end_campaign`, and `reveal` of secrets. Flags and arcs exist only in adventures.

## Checks in requirements

A `check` requirement holds the bound system's check specification, validated against the system's check schema. In Quest, a check is an unmodified d20 and the specification carries descriptive tags only:

```yaml
requirement: { check: { tags: [athletics] } }
```

## rooms/*.yaml

Room templates are prefabricated room interiors the generator MAY place. The generator adds the surrounding walls and doorways; see [generation.md](generation.md#4-room-templates).

```yaml
reactor_room:
  label: reactor room
  tags: [machine, hazard]
  role: boss            # any | entry | boss | treasure | dead_end
  min_depth: 3
  map:
    legend:
      "~": coolant
      "o": { terrain: floor, place: support_pillar }
    rows:
      - "..o..o.."
      - ".~~..~~."
      - ".~~..~~."
      - "..o..o.."
  contents:
    - { ref: control_panel, at: [3, 0] }
    - { ref: maintenance_drone, count: 2 }
```

`at` is relative to the template's top-left cell. Void cells in a template keep the generated floor. Room template contents MUST NOT use `npc`, `id`, or `room`, so adventure triggers cannot name an entity inside a room template; adventures that need a named entity in a generated room place it with an anchor. `light` sets the room's ambient light; without it, the room takes the location's ambient light.

## tables.yaml

Weighted tables supply generated encounters, loot containers, and room labels, container `contents`, and `starting_items`. Every draw from a table is a table draw of weighted selections, as defined in [engine.md](engine.md#random-numbers).

```yaml
starting_kit:
  - { weight: 3, ref: base:wrench }
  - { weight: 2, ref: base:medkit }
encounters_machine:
  - { weight: 4, ref: base:maintenance_drone, count: 1d2, depth: [0, 3] }
  - { weight: 1, ref: base:security_frame, count: 1, depth: [3, 99] }
```

An entry with `depth` is eligible only for rooms at that BFS depth range.

The table `room_labels` is required. The generator draws generated room labels from it. Entries MAY set `tags` to restrict them to rooms with matching tags:

```yaml
room_labels:
  - { weight: 2, label: maintenance corridor }
  - { weight: 1, label: flooded stacks, tags: [flooded] }
```

## parser.yaml

Synonyms help the parser map player phrasing to tools. They are hints in the parser prompt, not engine logic.

```yaml
synonyms:
  attack: [hit, strike, shoot, smash, stab]
  ability: [overload, hack, discharge]
  interact: [press, operate, pull, activate]
examples:
  - input: "jam the wrench into the drone"
    call: { tool: attack, args: { target_id: "<drone>", item_id: "<wrench>" } }
```

## Validation

The machine-readable schemas are in `spec/`; see [spec/README.md](../spec/README.md). The Content Compiler rejects a setting pack if any of these fail:

- Every file matches its schema. Unknown keys are errors.
- The rules system exists and its version satisfies `system.versions`.
- Every `system_stats` and every `check` specification matches the system's schema.
- Every reference resolves, within the pack's namespace, to content of the kind listed in [spec/README.md](../spec/README.md#ref-kinds).
- Every damage type, terrain type, and condition used is declared.
- `generation.door` and every key of `generation.locks` is a door template; every value of `generation.locks` is an item.
- Every map has rows of equal length, at most 64 × 64, and only characters defined by the built-in legend or the map's `legend`.
- Every placed entity's footprint lies inside the map on cells whose terrain is not `void` and does not obstruct movement, and no cell holds two creatures, two doors, or a movement-obstructing entity together with any other entity that occupies cells.
- `remains` appears only with `system_stats`.
- Every art ref resolves to an asset in `assets.yaml`; no `art` list holds two assets of one kind; every `file` exists, has an allowed type for its kind, and is within the size limits; every asset has `alt`, and `credit` where its license requires attribution. Absent art is never an error.
- `currency` has a denomination of value 1, and every denomination value is a positive integer.
- `system.modules` lists only modules of the bound system, and no file uses a module field that the declared modules do not enable.
- Every dice expression is well-formed.
