# Setting Pack Authoring

This guide builds a small fantasy setting pack for the Quest rules system, `sunless_crypt`, from an empty directory. The finished pack is `spec/examples/sunless_crypt`. Compile after each step.

Reference: [setting-packs.md](../setting-packs.md) for file formats, [systems/quest.md](../systems/quest.md) for Quest statistics, [engine.md](../engine.md) for requirements and effects, [spec/README.md](../../spec/README.md) for the compiler's checks and messages.

## Prerequisites

- The Content Compiler (`lib/materials` in the web application), run as `materials check` on the pack directory. See [spec/README.md](../../spec/README.md#compiler-interface).
- An editor with YAML support. Associating `*.yaml` files with the schemas in `spec/schema/` enables inline validation.

## What a setting pack controls

| Controls | Does not control |
|---|---|
| Terrain, creatures, items, containers, fixtures, obstacles, doors, room templates, tables | Character sheets and creation (the rules system) |
| Each entity's `system_stats` in the bound system's terms | How rolls, damage, and death work (the rules system) |
| Damage types, lock templates, conditions and their roll adjustments | Turn order and movement speed (the rules system) |
| Parser synonyms and examples, narration style | Plot, flags, story locations (adventure packs) |

## 1. Choose a rules system and write the manifest

A setting pack is written for one system. Its statistics are meaningless to other systems. This pack uses Quest.

Create `packs/sunless_crypt/manifest.yaml`:

```yaml
format_version: 2
kind: setting
id: sunless_crypt
version: 0.1.0
namespace: crypt
title: Sunless Crypt

system: { id: quest, versions: "^1.0" }

damage_types: [blunt, edged, holy]

generation:
  door: wooden_door
  locks: { iron_door: iron_key }

starting_items: { table: starting_gear, picks: 2 }

narration:
  style: grim, sparse, old-fashioned
  person: second
  max_sentences: 3
```

`system.versions` accepts `^X[.Y]`, `~X.Y`, or an exact version. `^1.0` accepts any 1.x implementation of Quest.

`generation` names the door the dungeon generator places in every doorway and the locked doors it uses for lock-and-key pairs, each with its key. The templates are written in steps 3 and 4; the compiler reports them as unknown until then.

## 2. Add creatures

Quest creatures are a template (`commoner`, `minion`, `boss`) with optional HP and damage overrides. Create `packs/sunless_crypt/entities/creatures.yaml`:

```yaml
skeleton:
  kind: creature
  label: skeleton
  tags: [undead, hostile]
  behavior: aggressive
  system_stats: { template: minion }
crypt_warden:
  kind: creature
  label: crypt warden
  tags: [undead, hostile]
  behavior: defensive
  system_stats: { template: boss, damage: 3 }
```

`behavior` is an engine field; see [engine.md](../engine.md#entity-turns). `system_stats` is validated against `systems/quest/creature.schema.json`.

## 3. Add items

Create `packs/sunless_crypt/entities/items.yaml`:

```yaml
mace:
  kind: item
  label: mace
  tags: [weapon]
  system_stats: { weapon: true, damage: 2 }
torch:
  kind: item
  label: torch
  uses: 6
  light: { bright: 2, dim: 4 }
iron_key:
  kind: item
  label: iron key
  tags: [key]
```

Items without a rules role, such as keys, need no `system_stats`. The torch lights two cells around its carrier brightly and four dimly. Using it lights or extinguishes it. Whether darkness hides things depends on the rules system; Quest leaves sight unlimited and passes the light level to narration and triggers.

## 4. Add doors and obstacles

Create `packs/sunless_crypt/entities/structures.yaml`:

```yaml
wooden_door:
  kind: door
  label: wooden door
  system_stats: { hp: 5 }
  remains: splinters
iron_door:
  kind: door
  label: iron door
sarcophagus:
  kind: obstacle
  label: stone sarcophagus
  footprint: [2, 1]
  obstructs: [movement]
  cover: true
  verbs:
    open:
      requirement: { check: { tags: [athletics] } }
      effects: []
splinters:
  kind: obstacle
  label: splintered timber
  obstructs: []
```

- A door or obstacle with `system_stats` can be attacked and destroyed. Quest structures have `hp`; see [systems/quest.md](../systems/quest.md#creatures-and-items).
- `remains` replaces a destroyed entity; splintered timber obstructs nothing and is scenery.
- The iron door has no `system_stats`, so only its key opens it. The generator sets its lock.
- The sarcophagus covers two cells, blocks movement but not sight, and gives cover to anyone behind it.

## 5. Add tables and compile

Create `packs/sunless_crypt/tables.yaml`:

```yaml
room_labels:
  - { weight: 3, label: burial niche }
  - { weight: 1, label: ossuary }
starting_gear:
  - { weight: 1, ref: mace }
  - { weight: 1, ref: torch }
encounters_undead:
  - { weight: 1, ref: skeleton, count: 1d3 }
```

Run `materials check packs/sunless_crypt`. Exit status 0 with no output means the pack is valid. To see errors, change `template: minion` to `template: goon` and `ref: mace` to `ref: maec`, then rerun:

```
entities/creatures.yaml: skeleton.system_stats.template: quest creature: 'goon' is not one of ['commoner', 'minion', 'boss']
tables.yaml: starting_gear[0].ref: unknown entity 'maec'
```

Errors from the rules system's schemas name the system and kind. Revert both changes.

## 6. Add a condition and an ability

Create `packs/sunless_crypt/conditions.yaml`:

```yaml
frightened:
  label: frightened
  duration: 1
  blocks: [attack]
```

Create `packs/sunless_crypt/abilities/prayers.yaml`:

```yaml
turn_undead:
  label: Turn Undead
  target: entity
  system_stats: { roles: [invoker], cost: { ap: 2 }, roll: true }
  effects:
    - damage: { target: target, amount: 2, type: holy }
    - apply_condition: { target: target, condition: frightened }
```

In Quest, `cost.ap` is paid when the ability is used, and `roll: true` makes the engine roll a check and apply the effects on a passing tier. Writing the cost in another system's terms fails:

```
abilities/prayers.yaml: turn_undead.system_stats.cost: quest ability: 'ap' is a required property
abilities/prayers.yaml: turn_undead.system_stats.cost: quest ability: Additional properties are not allowed ('mana' was unexpected)
```

## 7. Add a room template and parser hints

Create `packs/sunless_crypt/rooms/tomb.yaml`:

```yaml
founders_tomb:
  label: founder's tomb
  tags: [undead]
  role: boss
  min_depth: 3
  map:
    rows:
      - "#.....#"
      - "......."
      - "......."
      - "#.....#"
  contents:
    - { ref: sarcophagus, at: [2, 1] }
    - { ref: crypt_warden, at: [3, 2] }
    - { ref: skeleton, count: 2 }
```

The map is the room's interior; the generator adds the surrounding walls and doorways, centring the template in a room large enough for it. `#` cells are wall pillars in the corners. `at` is relative to the template's top-left cell. The skeletons have no `at`, so the generator places them on free cells by RNG. A placement that overlaps another or lands on a wall fails:

```
rooms/tomb.yaml: founders_tomb.contents[1].at: cell [0, 0] is wall; 'crypt warden' cannot stand there
```

Create `packs/sunless_crypt/parser.yaml`:

```yaml
synonyms:
  attack: [hit, bash, smite, swing]
  ability: [pray, turn, invoke]
examples:
  - input: I raise my holy symbol at the skeleton
    call: { tool: ability, args: { ability_id: "<turn_undead>", target_id: "<skeleton>" } }
```

## 8. Build the bundle

Run `materials build -o sunless_crypt-0.1.0.json packs/sunless_crypt`. The bundle has every reference qualified (`crypt:mace`), the resolved system version recorded in `manifest.system.resolved`, engine defaults written into every entity, built-in terrain and conditions added. Publish it with [runbooks/content-publishing.md](../runbooks/content-publishing.md).

## Porting a setting to another system

Copy the pack, change `system`, and rewrite every `system_stats` and every `check` specification in the target system's terms. The compiler lists each one that fails validation. Labels, tags, tables, maps, rooms, conditions, and effects carry over unchanged. Obstacle and door `system_stats` follow the target system's `structure` schema.

## Checklist before publishing

- [ ] `materials check` exits 0.
- [ ] `version` follows [runbooks/content-publishing.md](../runbooks/content-publishing.md#versioning).
- [ ] `generation` names a door and at least one lock with its key.
- [ ] Encounter tables cover depth 0 and the deepest expected depth.
- [ ] Content added from a rulebook follows the license rules in [LICENSES.md](../../LICENSES.md).
- [ ] A test instance has been played with the pack and at least one adventure.
