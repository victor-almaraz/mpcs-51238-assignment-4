# Brief: Exemplar Adventure

## Goal

Write the exemplar adventure `sunken_archive` and the setting pack it requires, `lantern_coast`, in `spec/examples/`. The exemplar is a showcase of what setting packs, adventure packs, and system modules can express, not a minimal teaching sample. It is also the reference adventure for the Content Compiler, the adventure editor's import, the playtest simulator, and the documentation. Every file MUST validate against its schema, and both packs MUST pass every compilation check in [adventure-packs.md](../docs/adventure-packs.md#compilation) and [spec/README.md](../spec/README.md#checks).

The story is in the campaign draft, `sunken_archive_campaign_draft.md`, supplied with this brief. Settings and adventures are user-authored material; the other example packs illustrate formats and do not limit what this exemplar contains. See [Materials are authored](../docs/adventure-packs.md#materials-are-authored).

This brief is the complete interface for the task. Read [AGENTS.md](../AGENTS.md) first; it governs conventions, writing rules, and what not to change.

## Read first

1. [docs/adventure-packs.md](../docs/adventure-packs.md): file formats, flags, places and room references, what the models receive, triggers, compilation checks.
2. [docs/setting-packs.md](../docs/setting-packs.md) and [docs/guides/setting-pack-authoring.md](../docs/guides/setting-pack-authoring.md): the setting format, maps, currency, art, and placements.
3. [docs/engine.md](../docs/engine.md): [space](../docs/engine.md#space), [containers](../docs/engine.md#containers), [lighting](../docs/engine.md#lighting), [requirements](../docs/engine.md#requirements), [effects](../docs/engine.md#effects), [events](../docs/engine.md#events).
4. [docs/generation.md](../docs/generation.md): generated locations.
5. [docs/systems/cadmium.md](../docs/systems/cadmium.md) and [docs/systems/quest.md](../docs/systems/quest.md): statistics, and the modules `armor` and `stash`.
6. [docs/guides/adventure-authoring.md](../docs/guides/adventure-authoring.md): the tutorial this exemplar completes.

## Deliverables

| Pack | Directory | Identity |
|---|---|---|
| Setting | `spec/examples/lantern_coast/` | `id: lantern_coast`, `namespace: coast`, `title: The Lantern Coast`, `version: 1.0.0`, `format_version: 2` |
| Adventure | `spec/examples/sunken_archive/` | `id: sunken_archive`, `version: 1.0.0`, `format_version: 2`, `players: [1, 4]`, `requires_settings: [{ id: lantern_coast, versions: "^1.0" }]` |

Both packs bind `system: { id: cadmium, versions: "^1.0", modules: [armor, stash] }`. Currency, character-scoped flags, and containers with `capacity` are engine features and need no module.

Shared world content goes in the setting: creatures, people templates, items, terrain, doors, obstacles, room templates, tables, conditions, the currency, and parser hints. Content that exists only for this story goes in the adventure's `entities/`: the artifacts, the sealed boxes, the fog bank, and the story's named items.

## Files to produce

Setting pack, per [spec/README.md](../spec/README.md#pack-directory):

| Path | Schema | Count |
|---|---|---|
| `manifest.yaml` | `manifest.schema.json` | One, with `currency` |
| `conditions.yaml`, `tables.yaml`, `parser.yaml` | their schemas | One each; `tables.yaml` includes `room_labels` |
| `abilities/*.yaml`, `entities/*.yaml`, `rooms/*.yaml` | their schemas | Any number |
| `assets.yaml`, `assets/*` | `assets.schema.json` | Optional |

Adventure pack, per [spec/README.md](../spec/README.md#adventure-directory):

| Path | Schema | Count |
|---|---|---|
| `adventure.yaml` | `adventure.schema.json` | One |
| `flags.yaml` | `flags.schema.json` | At most one |
| `plot/*.yaml` | `arc.schema.json` | One or more; one arc per file |
| `locations/*.yaml` | `location.schema.json` | One or more; one location per file |
| `npcs/*.yaml` | `npc.schema.json` | Any number; one NPC per file |
| `entities/*.yaml` | `entities.schema.json` | Any number |
| `assets.yaml`, `assets/*` | `assets.schema.json` | Optional |

Each record's `id` in `plot/`, `locations/`, and `npcs/` matches its file name. No files outside these patterns.

## Format reference

### References

| Written | Resolves to |
|---|---|
| `coast:<key>` | `key` in `lantern_coast` |
| `sunken_archive:<key>` or `<key>` | `key` in the adventure's `entities/` |
| `coast:floret` in a flag's `currency` | The setting's currency |
| An NPC id in `npc:` and in `talked` matches | The NPC; its entity id is the NPC id |
| `<npc_id>.<secret_id>` in `reveal` | That NPC's secret |
| `room`, `location.room`, or a generated alias such as `perpetua_holds.box_folio` | A room; see [Room references](../docs/adventure-packs.md#room-references) |

### Places and maps

- A location is one grid of at most 64 × 64 cells. Several places are several locations joined by links; there is no overland map. See [Places and regions](../docs/adventure-packs.md#places-and-regions).
- Room ids are unique within a location. Write `location.room` for a room in another location; the rules are in [Room references](../docs/adventure-packs.md#room-references).
- Generated rooms are `r1` to `rN`, with `r1` the entry. Reach other generated rooms through the aliases `location.entry`, `location.boss`, `location.<anchor_id>`, and `location.<link_id>`.

- Rows north first, equal length, at most 64 × 64. Built-in characters: space (void), `.` (floor), `#` (wall). Other characters come from `legend`.
- Every cell that is not void and does not obstruct movement belongs to exactly one room, including door cells.
- Doors stand on floor cells. A link on a door's cell is usable only while the door is open.
- Placements with `id` are the only entities triggers can name. `count` and `at` never combine.

### Triggers

```yaml
- id: core_taken
  on: { type: item_taken, ref: sunken_archive:reactor_core }   # event type, then optional payload equality
  when: { stage: [find_the_core, searching] }                  # optional requirement
  effects:
    - set_stage: { arc: find_the_core, stage: core_found }
  narrate: Alarms wail through the stacks.                     # optional, at most 500 characters
  once: true
```

Payload fields per event type are in [engine.md](../docs/engine.md#events). Keys other than `type` are optional filters: `{ type: talked, topic: clue }` matches that topic with any NPC. `moved` carries `location` and `to` (the room id). In `when`, requirements about the actor test the event's actor. Triggers run after each action, at most three passes. Reusable patterns are in the authoring guide's [Patterns](../docs/guides/adventure-authoring.md#patterns).

### Effects and requirements

All effects and requirements are listed in [engine.md](../docs/engine.md#effects) and [engine.md](../docs/engine.md#requirements). Adventures additionally have `set_flag`, `add_flag`, `set_stage`, `end_campaign`, and `reveal` of secrets. `spawn`, `move_entity`, and `set_room_light` need a room reference.

### Lighting

Cadmium, like Quest, sets `lighting: false`: darkness does not hide anything, but illumination still reaches narration, triggers (`illumination` requirements), and views. Rooms take `light: bright | dim | dark`; generated locations take `population.ambient` and `population.lit_rooms`.

### Draft items resolved by the specification

| Draft item | Specification |
|---|---|
| Hostile variants of guards and sailors | `set_hostile` on the existing entity; no template swap |
| Traveling NPCs | `move_entity` with a qualified room |
| Chests | Containers with `capacity`, optionally with `lock` |
| Sealed iron boxes with hidden contents | Fixtures whose `open` verb gives the artifact; verbs apply setting effects only, so flags change in triggers on `interacted` |
| Vault door forced open | A door with `lock` and `system_stats`; destruction ignores the lock |
| Coin | A character-scoped `int` flag with `currency: coast:floret`; rewards with `target: room`; no transfer between characters |
| Armor | Items with `system_stats.armor`; `use` dons them |
| Carried containers | Items with `system_stats.slots` |
| Reaching anchored generated rooms | Aliases `location.<anchor_id>`, `location.boss`, `location.entry` |

## Required coverage

The exemplar MUST contain at least:

- [ ] Several locations joined by link pairs travelled both ways, at least one authored and one generated.
- [ ] An authored location with a legend, at least three rooms, a destructible obstacle, and a door with a flag lock.
- [ ] A generated location with a room template, anchors that place adventure items with ids, one lock-and-key pair, a dim or dark `ambient`, and `lit_rooms`.
- [ ] A light source placed in the start location.
- [ ] A door whose lock combines `has_item` and `illumination`.
- [ ] A door with both `lock` and `system_stats`.
- [ ] A hidden entity in an authored room that `search` reveals.
- [ ] An NPC topic gated by `when`, an NPC secret released by `reveal`, and a topic with effects.
- [ ] A `bool`, an `int`, and an `enum` flag, each read by some requirement.
- [ ] A currency in the setting and a character-scoped currency flag in the adventure, with income using `target: room`, a purchase, and an affordability requirement.
- [ ] Containers with `capacity`, one of them with a `lock`.
- [ ] Items using the `armor` and `stash` modules.
- [ ] `set_hostile` in a trigger, and an NPC moved between locations with `move_entity`.
- [ ] Triggers using `interacted`, `item_taken`, `item_given`, `talked`, `moved` (with `location`), and `died` or `destroyed`.
- [ ] A trigger whose `on` omits a payload key to match many entities, such as any NPC with a given topic.
- [ ] A trigger with `near` or `illumination` in its `when`.
- [ ] Qualified room references, including a generated alias, in trigger effects.
- [ ] An ambush: `spawn` with `at`, then `start_combat`.
- [ ] At least two endings besides the automatic `lost`, each reachable through triggers.
- [ ] Narration guidance in `narrate`, topic `brief`, and secrets, within 500 characters each, following [What the models receive](../docs/adventure-packs.md#what-the-models-receive).

Art is optional. When the exemplar ships art, each asset carries `alt`, its `license`, a `credit` where required, and `provenance` for images made with a generative tool.

## Validation

No compiler exists yet. Validate in two passes, outside the repository, for both packs.

**Schema pass.** Load every schema in `spec/schema/`, `systems/quest/`, and `systems/cadmium/` into one registry. Parse YAML as JSON-compatible YAML 1.2. Validate each file against the schema for its path, and every `system_stats` against the Cadmium schema of its kind. Expect zero errors.

**Semantic pass.** Check each item by hand, and record the result in the final report:

| # | Check |
|---|---|
| 1 | Every ref resolves: flags, arcs, stages, locations, rooms and aliases, doors, links, NPCs, topics, secrets, endings, currency, art, and setting and adventure templates of the expected kind. |
| 2 | Every module field used (`armor`, `slots`) belongs to a module both packs declare. |
| 3 | Each map: equal row lengths; legend covers every character; every passable cell in exactly one room; room areas do not overlap; every placement inside the map on passable terrain; no cell holds two creatures, two doors, or a movement-obstructing entity with another entity. |
| 4 | Every link's `to` names an existing link, and every link has a link back. |
| 5 | The start room has at least four free cells. |
| 6 | Every flag in a door or container lock is set by some effect. |
| 7 | Every ending is reachable: follow trigger chains from the start, treating each trigger as able to fire once and each requirement as satisfiable. |
| 8 | Anchor depths fit the generator's room range; each anchor has its own room unless `shared: true`; no anchor or link id is `entry`, `boss`, or `r` with digits. |
| 9 | Every flag literal fits its declared type and range; the currency has a denomination of value 1. |
| 10 | Every room reference resolves, triggers on events without an actor use qualified rooms, and each NPC is placed once. |
| 11 | Every art file exists, has an allowed type for its kind, and is within the size limits. |
| 12 | A walkthrough exists: list, in order, the actions one character takes from the start to each non-`lost` ending, naming each trigger that fires. |

## Documentation updates

In the same change:

1. Add `lantern_coast/` and `sunken_archive/` to the examples in `spec/README.md`'s layout.
2. Rewrite `docs/guides/adventure-authoring.md` as a tutorial that builds a small subset of the exemplar and links the exemplar as the complete pack. Every snippet in the guide is identical to the exemplar's files or a labelled excerpt of them.
3. Make every snippet of `sunken_archive` in `docs/adventure-packs.md` identical to the exemplar's files, or a labelled excerpt.
4. Remove the example adventure row from the open items in `AGENTS.md`.

## Acceptance

- Schema pass: zero errors for both packs.
- Semantic pass: every check holds, with the walkthrough in the report.
- Documentation updates done; all relative links and anchors resolve.
- Only these change: the two example directories, the documents listed above, and `AGENTS.md`.

## Out of scope

- Changes to the other example packs, the schemas, the engine, or the rules data. Report a needed change instead.
- Code of any kind in this repository. Balance simulation runs outside it.
