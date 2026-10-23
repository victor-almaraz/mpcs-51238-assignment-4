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

**Implemented.** Quest uses the engine.md list verbatim: `move`, `talk`, `interact`, `take`, `give`, `drop`, `use`, `ability`, `attack`, `search`, `wait`.

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
