# Specification Issues

Points where the specification in `cadmium-spec/` is silent, contradictory, or impossible to implement as written (`cadmium-spec/AGENTS.md`, "Rules for implementing agents"). Each entry has a marker in code naming its anchor. An entry is removed, with its markers, once a change to the specification resolves it.

## complete-doc-yaml-blocks

| Field | Value |
|---|---|
| Document | `AGENTS.md` |
| Section | Validation before finishing, item 3; Implementing the specification, Phases, phase 0 exit criterion |
| Marker | `tests/doc-blocks.ts` |

**Problem.** Every YAML block in `docs/` that is a complete pack file must validate against its schema, but nothing marks which blocks are complete files, or which file they are. Some blocks are fragments (the `map:` example in `setting-packs.md#maps`, the `requirement:` example in `setting-packs.md#checks-in-requirements`). One file is split across two blocks: in `setting-packs.md#tablesyaml`, the first block lacks the required `room_labels` table and the second block supplies it.

**Implemented.** A block is a complete pack file when the paragraph right before it names exactly one pack file in backticks, or, failing that, when its nearest level-2 heading is a pack file name. Consecutive blocks named by the same heading are joined into one document, except in `plot/`, `locations/`, and `npcs/`, which hold one record per file.

**Proposed resolution.** Mark complete pack files explicitly, for example with a fence info string such as ` ```yaml file=tables.yaml `, and keep each complete file in one block.

## seed-range

| Field | Value |
|---|---|
| Document | `docs/data-model.md`; `docs/engine.md` |
| Section | Instance, field `seed`; Random numbers |
| Marker | `lib/rng/index.ts` |

**Problem.** The instance `seed` is typed `int` with no range. `splitmix64_v1` works on 64-bit unsigned values, but a JSON number above 2^53 loses precision in JavaScript, and Postgres `bigint` is signed. The specification does not say how a seed is generated, stored, or serialized.

**Implemented.** `Rng` and `draw` accept a `bigint`, reduced modulo 2^64, or a non-negative safe integer; other numbers are rejected.

**Proposed resolution.** State that instance seeds are integers in `[0, 2^53 − 1]`, generated uniformly by the server, so they survive JSON and fit a signed 64-bit column. Generator seeds stay internal 64-bit values.

## footprint-movement

| Field | Value |
|---|---|
| Document | `docs/engine.md` |
| Section | Distance and adjacency; Pathfinding |
| Marker | `lib/grid/path.ts`, `lib/grid/grid.test.ts` |

**Problem.** Adjacency and the corner rule are defined for single cells, and step 3 of Pathfinding adds "the neighbour's terrain cost". For a mover with a footprint larger than `[1, 1]`, the specification does not say whether the corner rule applies to the anchor only or to every footprint cell, nor which cell's terrain cost a step spends. Applying the rule to the anchor alone lets the other footprint cells cut blocked corners, against "Movement never cuts a blocked corner".

**Implemented.** A diagonal step is allowed only when, for every cell of the footprint, neither of the two cells it passes between obstructs movement. A step spends the terrain cost of the new anchor cell. The footprint vector in engine.md passes under this reading.

**Proposed resolution.** State both rules in Pathfinding: every footprint cell obeys the corner rule, and a step costs the highest terrain cost among the cells the footprint enters (or the anchor cell's cost, if that is intended).

## stopping-on-occupied-cells

| Field | Value |
|---|---|
| Document | `docs/engine.md` |
| Section | Movement |
| Marker | `lib/grid/path.ts` |

**Problem.** In exploration a mover "stops early on the first cell of a room that is not `visited`, and on the cell where a hostile creature first becomes visible". That cell may not be free, for example when an ally stands on it, and a mover stops only on free cells. The `moved` event's `stopped` values also have none for a path whose last cells are not free.

**Implemented.** The mover stops on the last free cell at or before the cell that triggers the early stop, and the walk reports the early stop. A path whose remaining cells are not free ends on the last free cell before them.

**Proposed resolution.** State that an early stop on a cell that is not free ends on the last free cell before it, with the early-stop reason.

## systems-generated-types

| Field | Value |
|---|---|
| Document | `AGENTS.md`; `docs/guides/engine-implementation.md` |
| Section | Setup, step 3; Module boundaries |
| Marker | `lib/systems/quest/index.ts` |

**Problem.** Setup step 3 generates TypeScript types from `systems/*/` into `lib/bundle/types/`, but the module table lets `systems` depend only on `rng`. A system cannot use its own generated sheet types without importing from `bundle`.

**Implemented.** `lib/systems` imports generated types from `lib/bundle/types` with type-only imports, which add no runtime dependency. `bundle` depends on nothing, so no cycle forms.

**Proposed resolution.** Allow `systems` to depend on `bundle` for generated types, or generate system types into `lib/systems/<id>/types/`.

## quest-tool-priority

| Field | Value |
|---|---|
| Document | `docs/systems/quest.md`; `docs/engine.md` |
| Section | Ordering; Ordering policy |
| Marker | `lib/systems/quest/index.ts` |

**Problem.** quest.md gives the exploration order as `tool_priority` without its `tools` list. The only list is the example in engine.md, which omits `rest`, an ordered tool in `ordered_tool` of `defs.schema.json`. engine.md does not say where a tool missing from the list sorts.

**Implemented.** Quest uses the engine.md list verbatim: `move`, `talk`, `interact`, `take`, `give`, `drop`, `use`, `ability`, `attack`, `search`, `wait`. The engine sorts a tool missing from the list, such as `rest`, after every listed tool (`lib/engine/rounds.ts`).

**Proposed resolution.** List Quest's `tools` in quest.md, including `rest`, and state in engine.md that tools absent from the list sort after every listed tool.

## quest-setbacks

| Field | Value |
|---|---|
| Document | `docs/systems/quest.md` |
| Section | Checks; Attacks; Automation adaptations |
| Marker | `lib/systems/quest/index.ts` |

**Problem.** Three points are open:

1. Tough choices exclude "those that do not apply", but no rule says when a setback applies, and failure and severe setbacks have no such exclusion. "Lose your grip: drop what you are using" can be drawn when nothing is in use.
2. A tough choice offers two setbacks; the specification does not say what happens when fewer than two apply.
3. A pending choice carries precomputed `updates`. An option that changes the actor's sheet, such as losing AP, can overwrite changes made between the offer and the choice.

**Implemented.**

1. `drop_item` applies when an item is in use (the weapon of an attack); `lose_ap` applies when AP is at least 1; `harm_actor` always applies. Only tough choices exclude setbacks that do not apply; a failure or severe setback that cannot change anything has no effect.
2. The choice offers the setbacks that apply, one draw by RNG each, up to two.
3. `harm_actor` is returned as a `damage` effect and `drop_item` as a `drop_item` effect, so the engine applies them when chosen. `lose_ap` is an update computed from the sheet at the offer.

**Proposed resolution.** Define "applies" per setback field and use it for all three lists; state the behaviour with one applicable setback; express every setback as an effect, adding an effect for spending a resource if needed.

## quest-event-payloads

| Field | Value |
|---|---|
| Document | `docs/engine.md`; `docs/systems/quest.md` |
| Section | Events (`damaged`, `attacked`, `check_rolled`); Harm, death, and healing |
| Marker | `lib/systems/quest/index.ts` |

**Problem.** `damaged.amount` could be the harm dealt or the HP lost, which differ when harm exceeds the remaining HP or the target is at death's door. Whether harm at death's door emits `damaged` is not stated. The `attacked` example in api.md carries `roll`, `outcome`, and `damage`; `check_rolled` has only "system-specific fields".

**Implemented.** `damaged.amount` is the harm dealt and `remaining` the HP after it; harm at death's door emits `damaged` with `remaining: 0`, then `died` when the roll kills. `attacked` carries `roll`, `outcome`, and `damage`, the damage dealt after the tier multiplier; `check_rolled` carries `roll` and `outcome`.

**Proposed resolution.** State the payloads in quest.md.

## quest-creation-items

| Field | Value |
|---|---|
| Document | `docs/systems/quest.md` |
| Section | Character creation |
| Marker | `lib/systems/quest/index.ts` |

**Problem.** The creation choices example has `"items": []` but no rule for what `items` holds or how it reaches the sheet.

**Implemented.** `items` is an optional list of at most 12 item refs, placed in `inventory` as `{ ref }` entries.

**Proposed resolution.** Document `items`, or remove it from the choices if starting items come only from setting packs' `starting_items`.

## module-schema-fields

| Field | Value |
|---|---|
| Document | `systems/cadmium/*.schema.json`; `docs/systems/README.md` |
| Section | Schema descriptions; Modules |
| Marker | `lib/systems/cadmium/data.ts` |

**Problem.** Module fields "apply only while the module is enabled", and the Cadmium schemas say "Fields marked with a module are accepted only when that module is enabled". The only mark is prose: each module field's `description` starts with `Module armor:` or `Module stash:`. No keyword states it, and a configured schema keeps the same `$id` as the full one, so two configurations cannot share one schema registry.

**Implemented.** `schemasFor(modules)` removes every property whose description starts with `Module <id>:` for a disabled `<id>`, keeping the `$id`. Each configuration is compiled in its own registry.

**Proposed resolution.** Mark module fields with an annotation keyword, such as `"x-module": "armor"`, and state how a configured schema is identified, for example by a `$id` query such as `?modules=armor,stash`.

## armor-events

| Field | Value |
|---|---|
| Document | `docs/systems/cadmium.md` |
| Section | Module armor |
| Marker | `lib/systems/cadmium/armor.ts` |

**Problem.** Harm "reduces `armor.value` first and hit points by the remainder", and each pool change emits `resource_changed`. Whether `damaged` is emitted when the pool absorbs all the harm, and whether its `amount` is the harm dealt or the remainder, is not stated. This decides whether `flee_when_harmed` triggers on fully absorbed harm.

**Implemented.** The pool change emits `resource_changed` first. `damaged` follows only when a remainder reaches hit points, with that remainder as `amount`; at death's door the roll uses the remainder.

**Proposed resolution.** State the events in cadmium.md, Module armor.

## diagnostic-check-ids

| Field | Value |
|---|---|
| Document | `spec/README.md` |
| Section | Compiler interface; Checks |
| Marker | `lib/materials/diagnostics.ts` |

**Problem.** A `--json` diagnostic's `check` "names the failed check", but the checks are listed in prose with no identifiers. The `PATH` of a diagnostic about a whole file, such as an unexpected file, is not defined.

**Implemented.** Check ids `file`, `duplicate_key`, `schema`, `system`, `system_stats`, `ref`, `declared`, `generation`, `remains`, `depth`, `light`, `currency`, `map`, `placement`, and `art`, each described in `CHECKS`. Paths join keys with `.` and indexes with `[n]`, quote keys that are not identifiers (`legend["~"]`), and write the root as `.`.

**Proposed resolution.** List check ids next to the checks in spec/README.md and define the root path.

## pack-file-names

| Field | Value |
|---|---|
| Document | `docs/README.md`; `spec/README.md` |
| Section | Conventions ("JSON files are accepted wherever YAML is"); Pack directory ("Any other file in the pack directory is an error") |
| Marker | `lib/materials/pack.ts` |

**Problem.** It is unclear whether "JSON files are accepted wherever YAML is" allows `manifest.json` in place of `manifest.yaml`. "Any other file is an error" also rejects files that operating systems and editors create, such as `.DS_Store`.

**Implemented.** A `.json` file stands in for the `.yaml` file of the same name, and having both is an error. Files and directories whose name starts with `.` are ignored.

**Proposed resolution.** State both rules in spec/README.md, Pack directory.

## attribution-licenses

| Field | Value |
|---|---|
| Document | `docs/setting-packs.md` |
| Section | Art |
| Marker | `lib/materials/art.ts` |

**Problem.** `credit` is "required when the license requires attribution", but no list of such licenses is given, and the default license `CC0-1.0` applies even to `game_icons` sources, which game-icons.net publishes under CC BY 3.0.

**Implemented.** Licenses whose SPDX identifier starts with `CC-BY` require `credit`.

**Proposed resolution.** List the licenses that require attribution, and make `license` required, or default to `CC-BY-3.0`, for `game_icons` sources.

## ref-kinds

| Field | Value |
|---|---|
| Document | `spec/README.md`; `docs/setting-packs.md` |
| Section | Cross-reference checks ("of the expected kind") |
| Marker | `lib/materials/setting.ts` |

**Problem.** Each ref must resolve to a template, table, or ability "of the expected kind", but the expected kind is stated only for `generation`. Table entries, `remains`, `spawn`, and placements have no stated kind.

**Implemented.** `has_item`, `give_item`, `remove_item`, `drop_item`, container `contents` lists, and lock keys are items; `generation.door`, lock doors, and placements with `lock` are doors. Tables named by `starting_items`, creature `loot`, and container `contents` hold only items. Table entries, `remains`, `spawn`, legend `place`, and placements are any entity template.

**Proposed resolution.** State the expected kind of each ref field in setting-packs.md, Validation.

## bundle-format

| Field | Value |
|---|---|
| Document | `spec/README.md`; `docs/guides/engine-implementation.md` |
| Section | Bundle; Build order, milestone 2 ("Unknown fields fail") |
| Marker | `lib/bundle/setting.ts` |

**Problem.** The bundle is described by one example and a sentence; it has no schema. The example's `manifest` holds only `system`, so it is not stated whether the rest of the manifest, `assets`, or `system.modules` appear in the bundle, and "unknown fields fail" has nothing to check against.

**Implemented.** The bundle holds the identity fields at the top level, the rest of the manifest under `manifest` with `terrain` merged and `system` carrying `modules` (default `[]`) and `resolved`, and `assets`. The loader accepts the fields of the pack schemas plus the compiler's defaults.

**Proposed resolution.** Add `bundle.schema.json` to `spec/schema/`.

## cli-adventure-settings

| Field | Value |
|---|---|
| Document | `spec/README.md`; `docs/adventure-packs.md` |
| Section | Compiler interface; Compilation |
| Marker | `lib/materials/cli.ts` |

**Problem.** The compiler "accepts an adventure directory ... and the bundles of its required setting packs", but the command line takes only `DIR`, so `materials check` cannot compile an adventure.

**Implemented.** `--setting PATH`, repeatable, names a setting bundle (JSON) or a setting pack directory, which is compiled first.

**Proposed resolution.** Add `--setting PATH`... to both subcommands in spec/README.md.

## trigger-match-refs

| Field | Value |
|---|---|
| Document | `docs/adventure-packs.md`; `docs/engine.md` |
| Section | Compilation (error example); Events (`item_taken`) |
| Marker | `lib/materials/adventure.ts` |

**Problem.** The error example `plot/core.yaml: triggers[1].on.item: unknown ref 'reactor_cor'` treats `on.item` as a content ref, but the `item_taken` payload's `item` is an entity id and its `ref` is the template ref; the plot example and the authoring guide match on `ref`.

**Implemented.** In `on`, `ref` is a content ref; `item`, `target`, `door`, and `entity` are entity ids.

**Proposed resolution.** Change the example to `triggers[1].on.ref: unknown ref 'sunken_archive:reactor_cor'`.

## container-locks

| Field | Value |
|---|---|
| Document | `docs/guides/adventure-authoring.md`; `docs/engine.md` |
| Section | Patterns ("A chest with a lock"); Containers |
| Marker | `lib/materials/content.ts` |

**Problem.** The guide says "a container has no lock" and recommends a fixture verb instead. engine.md, setting-packs.md, and `entities.schema.json` give containers a `lock`.

**Implemented.** engine.md and the schema govern: containers take `lock`.

**Proposed resolution.** Rewrite the guide's pattern to use a container with `lock`.

## treasure-role

| Field | Value |
|---|---|
| Document | `docs/generation.md`; `spec/schema/location.schema.json`, `rooms.schema.json` |
| Section | Roles and depth; link `role`, anchor `prefer_role`, room template `role` |
| Marker | `lib/materials/adventure.ts`, `lib/generator/generate.ts` |

**Problem.** The schemas offer the role `treasure` for generated links, anchor preferences, and room templates, but the generator assigns only `entry`, `dead_end`, and `boss`. A generated link with role `treasure` always fails generation, and a `treasure` room template is never placed.

**Implemented.** A generated link with role `treasure` is a compilation error under check 9 ("a generated link names a role the generator cannot produce"). In the generator, `treasure` never matches: a template with that role is never placed, and `prefer_role: treasure` falls back to the other candidates.

**Proposed resolution.** Define how the generator assigns `treasure`, for example to dead ends that hold loot containers, or remove the value from the schemas.

## ending-reachability

| Field | Value |
|---|---|
| Document | `docs/adventure-packs.md` |
| Section | Compilation, check 7; adventure.yaml (`lost`) |
| Marker | `lib/materials/adventure.ts` |

**Problem.** "No ending is reachable" is tested by treating every trigger as able to fire once and every requirement as satisfiable. Under that rule an ending is reachable exactly when some effect ends the campaign with it. The automatic ending `lost` is reached without any effect; whether it counts is not stated.

**Implemented.** An adventure passes when some `end_campaign` effect, in a trigger, topic, or the start effects, names a declared ending. `lost` alone does not count.

**Proposed resolution.** State that the automatic ending does not satisfy check 7.

## start-free-cells

| Field | Value |
|---|---|
| Document | `docs/adventure-packs.md` |
| Section | Compilation, check 10 |
| Marker | `lib/materials/adventure.ts` |

**Problem.** "The start room has fewer free cells than the adventure's maximum player count" cannot be decided when compiling for placements chosen by RNG, or when the start location is generated.

**Implemented.** For an authored start location, the free cells are the room's passable cells minus those occupied by fixed placements (legend and `at`) of creatures, NPCs, and movement-obstructing entities. Generated start locations are not checked.

**Proposed resolution.** State that the check counts fixed placements only, and how it applies to generated start locations.

## room-scopes

| Field | Value |
|---|---|
| Document | `docs/adventure-packs.md` |
| Section | Room references |
| Marker | `lib/materials/adventure.ts` |

**Problem.** The table of where an unqualified room resolves does not list NPC topic effects and requirements.

**Implemented.** Topic `when` and `effects` resolve unqualified rooms in the actor's location, as item, ability, and verb effects do.

**Proposed resolution.** Add topics to the table.

## draft-entity-files

| Field | Value |
|---|---|
| Document | `spec/README.md`; `spec/schema/draft.schema.json` |
| Section | Adventure directory ("maps one-to-one onto these files") |
| Marker | `lib/materials/index.ts` |

**Problem.** `entities/` is merged per directory, so the draft's single `entities` map has no one-to-one file name.

**Implemented.** A draft's entities compile as `entities/entities.yaml`.

**Proposed resolution.** Name the file the editor exports entities to.

## engine-state-fields

| Field | Value |
|---|---|
| Document | `docs/data-model.md` |
| Section | Instance state |
| Marker | `lib/engine/types.ts` |

**Problem.** The example state does not show how carried items, container contents, engine-created entity ids, item uses, `set_hostile`, behaviour switches from `flee_when_harmed`, closed simultaneous rounds, or generated-room aliases are stored. It also shows both a `hidden` field and a `conditions` list, and `hidden` is an engine condition.

**Implemented.** Carried items are entities with `carrier`, listed in `characters[id].items`; the character sheet's `inventory` is kept equal to them. Containers list item ids in `contents`. Entities carry `uses`, `hostile` (set by `set_hostile`), and `behavior`. Engine-created entities take ids `_e<n>` from the counter `next_entity`. `hidden` is a condition only. A simultaneous round's `order` is set when it closes, and `turn_index` counts its resolved actions. Generated locations carry `aliases`.

**Proposed resolution.** Extend the example state with these fields, or add a state schema.

## dead-creatures

| Field | Value |
|---|---|
| Document | `docs/engine.md` |
| Section | Entities on the map; Combatants and sheets |
| Marker | `lib/engine/world.ts` |

**Problem.** A structure that leaves `active` is removed, but nothing says what happens to a creature or character that dies: whether it stays on the map, still occupies its cells, or drops its `loot`.

**Implemented.** Dead creatures and characters stay in place and occupy no cells. `loot` is not dropped.

**Proposed resolution.** State whether the dead keep their cells and when `loot` is drawn and placed.

## container-contents

| Field | Value |
|---|---|
| Document | `docs/setting-packs.md`; `docs/engine.md` |
| Section | Container (`contents`); Containers |
| Marker | `lib/engine/ctx.ts` |

**Problem.** A container's `contents` is a pick from a table or a list of refs, but the time the pick is drawn is not stated.

**Implemented.** Contents are drawn when the container is placed, at instance start or when spawned, and stored as item entities held by the container.

**Proposed resolution.** State that contents are drawn on placement.

## weighted-tables

| Field | Value |
|---|---|
| Document | `docs/engine.md`; `docs/setting-packs.md` |
| Section | Random numbers; tables.yaml |
| Marker | `lib/generator/generate.ts`, `lib/engine/ctx.ts` |

**Problem.** Selection "by RNG" is defined for lists, not for weighted tables, and an entry's `count` is not described for draws.

**Implemented.** One draw is a die with the total weight; the chosen entry is the first whose running total of weights reaches the result, in table order. The generator and the engine share this draw (`pickWeighted`). The chosen entry places `count` items, rolled when it is dice. `picks` is rolled first when it is dice.

**Proposed resolution.** Define weighted selection in engine.md, Random numbers.

## effect-events

| Field | Value |
|---|---|
| Document | `docs/engine.md` |
| Section | Effects; Events |
| Marker | `lib/engine/effects.ts` |

**Problem.** The events emitted by `give_item`, `remove_item`, `drop_item`, `apply_condition`, `remove_condition`, `set_hostile`, and `start_combat` are not listed.

**Implemented.** `give_item` emits `entity_spawned` for the new item; `remove_item` emits `entity_despawned`; `drop_item` emits `item_dropped` with the target as `actor`; conditions emit `condition_applied` and `condition_removed`; `start_combat` emits `combat_started` when the instance enters combat; `set_hostile` emits nothing.

**Proposed resolution.** Add an events column to the effects table.

## ability-roll

| Field | Value |
|---|---|
| Document | `docs/engine.md`; `docs/systems/README.md` |
| Section | Action resolution (`ability`); Contract |
| Marker | `lib/engine/actions.ts` |

**Problem.** The engine calls `check` for an ability "if the system marks the ability as rolled (see each system's document)", but the contract has no function for it, so the engine must read a system-specific field. The check specification for an ability roll is not defined either.

**Implemented.** An ability is rolled when its `system_stats.roll` is `true`, as in Quest; the check uses the empty specification `{}`.

**Proposed resolution.** Add a contract function, such as `ability_check(stats)`, returning the check specification or null.

## outside-combat-area

| Field | Value |
|---|---|
| Document | `docs/engine.md` |
| Section | Rounds ("Characters outside the combat area take part in combat rounds with exploration tools only") |
| Marker | `lib/engine/actions.ts` |

**Problem.** "Exploration tools only" can mean the tools of exploration mode, which include `attack`, or excluding combat actions. It also conflicts with exploration-only tools being unavailable in combat.

**Implemented.** During combat, a character outside the combat area may use every tool available in exploration mode, including the exploration-only tools; movement uses the combat allowance.

**Proposed resolution.** List the tools available outside the combat area.

## generator-attempt-seeds

| Field | Value |
|---|---|
| Document | `docs/generation.md` |
| Section | Interface |
| Marker | `lib/generator/generate.ts` |

**Problem.** Retries use `draw(location_seed, attempt)` for attempt number `attempt`, but the number of the first attempt, and whether it uses `location_seed` itself, is not stated.

**Implemented.** Attempt 0 uses `location_seed`; attempts 1 to 19 use `draw(location_seed, attempt)`; 20 attempts in total.

**Proposed resolution.** State the numbering of attempts.

## bsp-split-candidates

| Field | Value |
|---|---|
| Document | `docs/generation.md` |
| Section | Pipeline, 1. Layout, step 2 |
| Marker | `lib/generator/layout.ts` |

**Problem.** "Take the region with the largest interior area" does not say what happens when that region cannot split.

**Implemented.** The largest region among those that can split is taken.

**Proposed resolution.** Restrict the choice to regions that can split.

## generator-orderings

| Field | Value |
|---|---|
| Document | `docs/generation.md` |
| Section | Pipeline, steps 1 to 3 |
| Marker | `lib/generator/layout.ts`, `lib/generator/generate.ts` |

**Problem.** Several orders and roundings are unstated: the split direction on equal sides, which child region is created first, room ids before renumbering (used by Kruskal ties and BFS), the order in which adjacencies receive doorways, the doorway order of `d` ids, how `round` treats halves, and whether a tie-break draws when there is no tie.

**Implemented.** The direction is picked from `[vertical, horizontal]`; the west or north child is created first; rooms are numbered before renumbering in row-major order of their region's top-left cell; doorways are chosen in `(a, b)` order of the room pair; door ids follow row-major doorway order; halves round up; the boss tie draws only on a tie, while every other selection by RNG draws even from a one-item list.

**Proposed resolution.** State each order and rounding in generation.md.

## generated-room-roles

| Field | Value |
|---|---|
| Document | `docs/generation.md` |
| Section | Roles and depth, step 3; Output |
| Marker | `lib/generator/layout.ts` |

**Problem.** A room can hold several roles, such as an entry with one doorway or a boss room that is a dead end, but the output gives one `role`.

**Implemented.** Roles accumulate as a set, and constraints test membership. The output shows the first of `entry`, `boss`, and `dead_end`, or null.

**Proposed resolution.** Define a precedence, or make `role` a list.

## generated-room-aliases

| Field | Value |
|---|---|
| Document | `docs/adventure-packs.md`; `docs/generation.md` |
| Section | Room references; Output |
| Marker | `lib/generator/types.ts` |

**Problem.** `location.<anchor_id>` names the room holding an anchor, but an anchor without `place.id` places an entity with a generated id, so the output cannot say which room holds it.

**Implemented.** The generator returns `aliases`, mapping `r1`, `entry`, `boss`, anchor ids, and link ids to room ids, beside the location; the engine stores it on the location state.

**Proposed resolution.** Add the aliases, or an anchor-to-room map, to the output format.

## generated-legend

| Field | Value |
|---|---|
| Document | `docs/generation.md` |
| Section | Output |
| Marker | `lib/generator/generate.ts` |

**Problem.** Room templates bring terrain such as `coolant`, which the output's rows need legend characters for; the example output has no legend.

**Implemented.** The output carries `legend`. Each terrain takes the character the first placed template uses for it, otherwise the first free printable character.

**Proposed resolution.** Include `legend` in the output format.

## room-template-rooms

| Field | Value |
|---|---|
| Document | `docs/generation.md` |
| Section | 4. Room templates |
| Marker | `lib/generator/generate.ts` |

**Problem.** It is not stated whether two templates can share a room, or which label and tags a room holding a template has.

**Implemented.** One template per room; the room takes the template's label and tags, and draws no label from `room_labels`.

**Proposed resolution.** State both rules.

## placement-free-cells

| Field | Value |
|---|---|
| Document | `docs/generation.md` |
| Section | 7. Population (placement cells) |
| Marker | `lib/generator/draft.ts` |

**Problem.** Placement cells must be "free", which engine.md defines for movers, not for placing entities. Nothing says whether link cells can hold placements.

**Implemented.** A cell is free for a placement when it is in the room on passable terrain and holds no link and no movement-obstructing entity; when placing a creature it also holds no creature, and when placing an obstructing entity it holds nothing. The doorway restriction applies to every footprint cell. A link takes a placement cell and reserves it.

**Proposed resolution.** Define placement freedom and whether links reserve their cell.

## lock-path

| Field | Value |
|---|---|
| Document | `docs/generation.md` |
| Section | 6. Locks, step 1 |
| Marker | `lib/generator/generate.ts` |

**Problem.** "The path from the entry to the deepest anchor" may be a path of rooms or of cells, and ties between equally deep anchors are not broken.

**Implemented.** The path is the BFS-tree path of rooms; candidate doorways are in row-major order; the first anchor in list order wins a depth tie.

**Proposed resolution.** State the path and the tie rule.

## lock-candidates

| Field | Value |
|---|---|
| Document | `docs/generation.md` |
| Section | 6. Locks, step 2 |
| Marker | `lib/generator/generate.ts` |

**Problem.** Nothing covers running out of doorways for later locks, or keeping doorways for them.

**Implemented.** Each lock's doorway must be deeper on the path than the previous lock's; with none left, the attempt fails.

**Proposed resolution.** State whether the attempt fails and whether doorways are kept for later gates.

## lock-key-order

| Field | Value |
|---|---|
| Document | `docs/generation.md` |
| Section | 6. Locks, step 4 |
| Marker | `lib/generator/generate.ts` |

**Problem.** Read in order, step 4 for one gate cannot know the later locks it must avoid, and on maps with loops a later lock can cut off an earlier key.

**Implemented.** Steps 1 to 3 run for every gate first; keys are then placed in gate order, using reachability over the room graph.

**Proposed resolution.** State that keys are placed after all locks.

## remaining-rooms

| Field | Value |
|---|---|
| Document | `docs/generation.md` |
| Section | 7. Population, step 1 |
| Marker | `lib/generator/generate.ts` |

**Problem.** "Each remaining room" is not defined.

**Implemented.** Rooms other than the entry that hold no room template and no anchor.

**Proposed resolution.** Define the remaining rooms.

## generator-probability

| Field | Value |
|---|---|
| Document | `docs/generation.md` |
| Section | 7. Population, step 1 |
| Marker | `lib/generator/generate.ts` |

**Problem.** No procedure turns a probability, such as `density`, into draws.

**Implemented.** One draw `v`; the event happens when `v < floor(p × 2^64)`, and always when `p` is at least 1.

**Proposed resolution.** Define probability draws in engine.md, Random numbers.

## loot-containers

| Field | Value |
|---|---|
| Document | `docs/generation.md` |
| Section | 7. Population, step 2 |
| Marker | `lib/generator/generate.ts` |

**Problem.** "Place containers with loot" names no container template.

**Implemented.** One container per dead end or boss room, picked by RNG, in ref order, from the container templates whose contents draw from `loot_table`; nothing is placed without a loot table or such a container.

**Proposed resolution.** Add a container template to `generation` or `population`.

## room-label-fallback

| Field | Value |
|---|---|
| Document | `docs/generation.md` |
| Section | 7. Population, step 3 |
| Marker | `lib/generator/generate.ts` |

**Problem.** "The setting pack table `room_labels`" does not identify the pack, and nothing covers a room no entry matches.

**Implemented.** Labels come from the setting that supplies `generation`; an entry matches when the room carries all its tags; with no match, the label is the room id.

**Proposed resolution.** Name the pack and the fallback.

## lit-rooms-ambient

| Field | Value |
|---|---|
| Document | `docs/generation.md`; `spec/schema/location.schema.json` |
| Section | 7. Population, step 4; `lit_rooms` |
| Marker | `lib/generator/generate.ts` |

**Problem.** It is not stated whether rooms are drawn for `lit_rooms` when the ambient light is bright.

**Implemented.** With a bright ambient no rooms are drawn and no draws are made; rooms are picked without replacement; a template's own light overrides.

**Proposed resolution.** State the rule.

## verification-passability

| Field | Value |
|---|---|
| Document | `docs/generation.md` |
| Section | 8. Verification |
| Marker | `lib/generator/draft.ts` |

**Problem.** Verification does not say whether creatures block access, or how doors with locks other than `has_item` count.

**Implemented.** Creatures never block; a door with a lock other than `has_item` never opens; every item on a reached cell counts as collected.

**Proposed resolution.** State both rules.

## combat-area-growth

| Field | Value |
|---|---|
| Document | `docs/engine.md` |
| Section | Modes |
| Marker | `lib/engine/rounds.ts` |

**Problem.** "A room joins the combat area when a combatant enters it", and combat ends when "no character is in the combat area". Characters are not called combatants, but entering rooms in combat could be read as extending the area; if characters extended it, a fleeing party could never leave combat.

**Implemented.** Only combatant entities extend the combat area, after each resolved action.

**Proposed resolution.** State that combatants are entities.

## replay-source

| Field | Value |
|---|---|
| Document | `docs/architecture.md`; `docs/guides/engine-implementation.md` |
| Section | Determinism and replay ("Replaying an instance's events from its initial state"); Command-line harness (`--log`, `replay`) |
| Marker | `lib/harness/harness.ts`, `lib/engine/replay.ts`, `supabase/migrations/20261023000000_store.sql` |

**Problem.** Replay is described as replaying events, but the event payloads cannot rebuild state. They omit the RNG counter, spawned entities' templates and cells, sheet fields such as Quest's death's door, choice options, and declaration arguments. Rebuilding state needs the inputs: tool calls and advances, which the Input log records.

**Implemented.** Every commit records its input: the start (seed and characters), a tool call, an advance, or a restore. The store keeps them in a `commits` table written by the same atomic commit; the harness log holds them line by line. Replay (`lib/engine/replay.ts`) starts the instance again and re-runs each input, failing at the first version whose events differ. A `state_restored` commit takes the state replayed up to its `to_version`. Events and state read back from Postgres `jsonb` are compared with object keys sorted.

**Proposed resolution.** Define replay as re-running the recorded inputs and checking each commit's events, and list the inputs in the harness log format.

## replay-to-version

| Field | Value |
|---|---|
| Document | `docs/api.md`; `docs/runbooks/instance-recovery.md` |
| Section | Administrative operations (`replay_instance`); C. State inconsistency, step 4 |
| Marker | `lib/coordinator/admin.ts` |

**Problem.** `replay_instance` "replays events to `to_version` and compares the result with the stored state", but only the latest state is stored, so a replay to an earlier version has nothing to compare with. The runbook's search by decreasing `to_version` assumes per-version stored states.

**Implemented.** Replay checks every commit's events on the way and stops at the first one that differs, reporting it as `diverges_at`. `matches_stored` holds when the events reproduce through `to_version` and, at the latest version, the replayed state equals the stored state.

**Proposed resolution.** Define `matches_stored` this way and add `diverges_at` to the output; the runbook then reads the diverging version directly.

## terms-version

| Field | Value |
|---|---|
| Document | `docs/data-model.md`; `docs/api.md`; `docs/app-flow.md` |
| Section | Records, User (`terms_accepted_at`); Users (`accept_terms` takes `version`); Route map ("When either document changes, users accept the new version on their next sign-in") |
| Marker | `supabase/migrations/20261023000200_users_characters.sql` |

**Problem.** `accept_terms` takes a `version` and users must accept again when either document changes, but the User record keeps only `terms_accepted_at`, and no document defines the version's value.

**Implemented.** The User record also keeps `terms_version`. The version is the `fnv1a64` hash of `legal/terms.md` followed by `legal/privacy.md` (generated into `lib/bundle/schemas.generated.ts`), so any edit to either document asks every user again. Clerk's legal-compliance acceptance at sign-up sets `terms_accepted_at` but not the version, so new users also accept in the app once.

**Proposed resolution.** Add `terms_version` to the User record and define the version, for example as the documents' effective date or a hash of their text.

## starting-abilities-supply

| Field | Value |
|---|---|
| Document | `docs/systems/quest.md`; `spec/examples/` |
| Section | Character creation (exactly `starting_abilities` (6) distinct abilities); the example settings `derelict_station` and `sunless_crypt` |
| Marker | `lib/api/characters.ts` |

**Problem.** A Quest or Cadmium character needs six distinct abilities from installed materials, but the settings installed with Cadmium define two abilities in total (`base:overload` and `crypt:turn_undead`). No character can be created with the shipped materials.

**Implemented.** The creation form offers the abilities of every listed operator setting the system accepts, and states the shortfall when there are fewer than six. Tests add five abilities to `derelict_station`.

**Proposed resolution.** Ship at least six abilities usable by any role in the example settings, or a starter setting installed with Cadmium that holds a starting set.

## cross-system-versions

| Field | Value |
|---|---|
| Document | `docs/systems/README.md`; `docs/api.md`; `docs/data-model.md` |
| Section | Compatibility; Campaigns (`system_mismatch`), Instances (`add_character`); Campaign material, Instance character |
| Marker | `lib/api/materials.ts`, `lib/api/instances.ts` |

**Problem.** A Cadmium campaign accepts characters and packs declared for Quest, but the version rules compare against the campaign's own system: a material's range "MUST overlap the campaign's `system_versions`", and a character joins only when its system "equals" the campaign's and its major version equals the instance's pinned version. A Quest range or version compared with a Cadmium range or version has no meaning, and the "equals" rule contradicts Compatibility.

**Implemented.** A declaration for the campaign's own system must be satisfied by the installed version of that system, which must also satisfy the campaign's range. A Quest declaration in a Cadmium campaign is checked against the installed Quest version instead: a material's range must be satisfied by it, and a character's major version must equal its major version.

**Proposed resolution.** State that version checks use the declared system's installed version, and that a Cadmium campaign checks only its own range against Cadmium.

## party-changes

| Field | Value |
|---|---|
| Document | `docs/api.md`; `docs/engine.md` |
| Section | Instances (`add_character` and `remove_character` in `paused`; leaving a campaign removes characters); Events |
| Marker | `lib/engine/party.ts` |

**Problem.** Characters may join and leave a paused instance, and leaving a campaign removes characters from running instances, but the engine defines no operation, placement, or event for either. Nothing says where a joining character appears or what happens to the items a leaving character carries.

**Implemented.** Joining and leaving are commits whose inputs (`join` with the character, `leave` with its id) replay like any other. A joining character appears in the room of the party's first character in id order, or the adventure's start room, on the first free cell; in exploration it takes part in the current round. A leaving character is removed from state with the items it carries, which remain in its written-back sheet, and from the round, the order, combatants, and pending choices. Neither commit emits an event.

**Proposed resolution.** Define join and leave as engine operations, the joining character's placement, and events such as `character_joined` and `character_left`.

## commit-event-visibility

| Field | Value |
|---|---|
| Document | `docs/app-flow.md`; `docs/api.md` |
| Section | Real-time channels (the `commit` message carries "the events visible to every member"); Messages (`commit`: "filtered to those visible to the recipient"); `get_history` |
| Marker | `lib/engine/visibility.ts` |

**Problem.** No document defines which events a member may see. Event payloads name hidden entities, secrets, flags, and stages that views and model contexts must never show.

**Implemented.** An event is shared when every entity, character, or item it names was visible to some character before or after the commit: characters always, carried items with their carrier, other entities when a character perceives them and they are not hidden. `flag_set`, `stage_set`, `trigger_fired`, and `revealed` with a `secret` are never shared; `room_light_changed` is shared once the room has been visited. Shared events are marked when committed, and `get_history` returns only those, so history and live messages carry the same events.

**Proposed resolution.** Define event visibility in engine.md next to the event table.

## binding-gaps

| Field | Value |
|---|---|
| Document | `docs/api.md`; `docs/app-flow.md` |
| Section | Authentication (`register`, `login`, `logout`, opaque tokens); Routes (no route for `delete_campaign` or `restore_campaign`); Rate limits (open subscriptions per user) |
| Marker | `lib/api/http.ts` |

**Problem.** The binding describes its own accounts and opaque tokens, while the stack gives identities to Clerk (app-flow.md, Stack constraints). `delete_campaign` and `restore_campaign` have no routes. The limit of 4 open subscriptions cannot be enforced by the server when subscriptions are Supabase Realtime channels.

**Implemented.** The bearer token is the Clerk session token; Clerk registers, signs in, and signs out, so the binding has no `register`, `login`, or `logout` routes. `delete_campaign` is `DELETE /v1/campaigns/{campaign_id}` with `{ confirm }`, and `restore_campaign` is `POST /v1/campaigns/{campaign_id}/restore`. The subscription limit is not enforced.

**Proposed resolution.** State that a deployment with an identity provider omits the account operations and uses the provider's tokens; add the two campaign routes; scope the subscription limit to bindings that hold connections.
