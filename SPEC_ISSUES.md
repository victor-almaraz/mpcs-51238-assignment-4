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
