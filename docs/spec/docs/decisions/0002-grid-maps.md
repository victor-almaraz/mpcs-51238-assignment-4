# ADR-0002: Grid Maps

**Status:** Accepted
**Date:** 2026-10-22
**Deciders:** Project team

## Context

Each room had two abstract zones, `near` and `far`. Melee required a shared zone, ranged attacks reached the whole room, and nothing else about position existed. With a human referee, that abstraction works because the referee decides what is in the way, who can see whom, and how far someone can run. Cadmium has no referee. The engine has to make those decisions itself, and with zones it could not: line of sight, cover, blocking, chokepoints, and creature size had no representation, so they either never mattered or depended on narration the engine cannot trust.

## Decision

Represent every location as a square grid of at most 64 × 64 cells.

- Terrain is the static layer: `void`, `floor`, `wall`, and types declared by setting packs, each with what it obstructs and a movement cost.
- Everything that can change or be acted on is an entity on cells: creatures, NPCs, characters, items, containers, fixtures, obstacles, and doors. Entity templates come from setting and adventure packs; rules statistics come from the bound rules system, including durability for destructible obstacles and doors.
- Rooms are named sets of cells. Links join locations.
- The engine specifies distance, adjacency, line of sight, pathfinding, and movement exactly, with test vectors, so every implementation resolves the same state the same way.
- Rules systems supply the distance metric, movement speed, and attack reach.
- Tools name rooms, doors, links, and entities by id. Models never read or write coordinates; parser context carries distance, direction, and whether a target is in reach.

## Options Considered

### Option A: Zones per room

| Dimension | Assessment |
|---|---|
| Complexity | Low |
| Automation | Reach and sight are undefined beyond "same room" |
| Model context | Short |

**Pros:** Small state; short prompts.
**Cons:** No basis for blocking, cover, or sight; every positional question falls to narration.

### Option B: Square grid, ids in tools (chosen)

| Dimension | Assessment |
|---|---|
| Complexity | Medium |
| Automation | Reach, sight, cover, and obstruction are computed from state |
| Model context | Short: ids with distance and direction |

**Pros:** Deterministic answers to positional questions; authored maps that clients can draw; generated maps verified by real paths.
**Cons:** Authors draw maps; the engine implements pathfinding and line of sight.

### Option C: Square grid, coordinates in tools

| Dimension | Assessment |
|---|---|
| Complexity | Medium |
| Automation | As Option B |
| Model context | Long; models must reason about coordinates |

**Pros:** Precise player control.
**Cons:** Small models misplace coordinates; players describe intent, not cells.

## Consequences

- Setting packs move to `format_version: 2`: `terrain` and `generation` replace gate types and keys; room templates carry maps; obstacles and doors are entity kinds.
- Adventure locations are maps with rooms, links, and contents; gates are locked doors.
- The rules-system contract adds `SPATIAL`, `speed`, `reach`, `instantiate_structure`, and the `structure` schema.
- The generator produces grid layouts and verifies reachability with the engine's pathfinding.
- Views carry the seen part of the map, so clients draw it.
- The adventure editor gains a map editor; the play screen gains a map.

## Action Items

1. [x] Schemas: `map.schema.json`, entity kinds, manifest version 2, room template maps.
2. [x] Engine, tools, generation, pack, and data-model documents.
3. [ ] Implement the geometry in `lib/engine` and pass the test vectors in [engine.md](../engine.md#test-vectors).
4. [ ] Map editor and play map in the web application.
5. [ ] Confirm the Quest spatial values listed in `confirm`.
