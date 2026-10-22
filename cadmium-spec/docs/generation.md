# Dungeon Generation

The generator converts a generated location spec into a map: terrain rows, rooms, doors, links, and contents. Its output has the same structure as an authored location, so the engine treats both alike.

## Interface

```
generate(spec, setting_bundles, adventure_bundle, metric, seed) -> { ok: true, location: Location }
                                                                 | { ok: false, error: string }
```

`metric` is the rules system's `SPATIAL.metric`, used for verification paths.

The generator MUST be deterministic for identical input. The location seed is `draw(instance_seed XOR fnv1a64(location_id), 0)`, using `draw` from [engine.md](engine.md#random-numbers). `fnv1a64` is 64-bit FNV-1a over the UTF-8 bytes of the id (offset basis `0xCBF29CE484222325`, prime `0x100000001B3`). The generator keeps its own counter, starting at 0 for each location, and never reads or advances `state.rng_counter`. A retry after failed verification uses `draw(location_seed, attempt)` as the seed for attempt number `attempt`. Implementations MAY generate all locations at instance start or each location on first entry.

## Spec

| Key | Type | Default | Meaning |
|---|---|---|---|
| `generator.algorithm` | `bsp` | `bsp` | Layout algorithm. |
| `generator.size` | `[width, height]`, 16–64 each | `[40, 28]` | Map size in cells, including the outer wall. |
| `generator.rooms` | `[min, max]` | `[8, 12]` | Room count range. |
| `generator.min_room` | int 3–12 | 3 | Minimum interior width and height of a room. |
| `generator.loop_ratio` | 0.0–0.5 | 0.1 | Fraction of non-tree adjacencies that also receive a door. |
| `population.encounter_table` | ref | required | Weighted table of creatures. |
| `population.loot_table` | ref | none | Weighted table of items for containers. |
| `population.room_templates` | ref[] | `[]` | Prefabricated rooms eligible for placement. |
| `population.density` | 0.0–1.0 | 0.5 | Probability that an eligible room receives an encounter. |
| `population.ambient` | `bright`, `dim`, `dark` | `bright` | Ambient light of generated rooms. |
| `population.lit_rooms` | 0.0–1.0 | 0 | With a dim or dark ambient, the fraction of rooms made `bright`. |
| `anchors` | list | `[]` | Required placements. |
| `links` | map | `{}` | Links to other locations, each placed in a room with a given role. |
| `gates_per_location` | int 0–3 | 1 | Number of lock-and-key pairs. |

Doors and locks come from the first setting pack, in campaign material order, whose manifest declares `generation`: `generation.door` for every doorway and `generation.locks` for lock-and-key pairs. See [setting-packs.md](setting-packs.md#manifestyaml).

## Pipeline

Selections "by RNG" use the generator's own counter and the selection rule in [engine.md](engine.md#random-numbers). Candidate lists are always in row-major order (by `y`, then `x`) or ascending id order before a selection, so results do not depend on hash order.

### 1. Layout

A region is a rectangle of cells that includes its boundary walls. Neighbouring regions share the wall line between them.

1. The root region is the whole map. Draw the room count `N` by RNG from `generator.rooms`.
2. A region can split when its interior width or height is at least `2 × min_room + 1`. Repeat until there are `N` regions or none can split: take the region with the largest interior area, ties to the earliest created; split it across its longer side, or by RNG when the sides are equal; choose the wall line by RNG among positions that leave both interiors at least `min_room` wide.
3. Fewer than `generator.rooms[0]` regions fails the attempt.
4. Each region becomes a room: boundary cells are `wall`, interior cells are `floor`. Cells outside every interior stay `wall`.

### 2. Adjacency and connectivity

1. Two rooms are adjacent when they share a wall line along which at least one wall cell has an interior cell of each room on its two opposite sides. Those wall cells are the candidate doorways.
2. Weight each adjacency by the squared distance between room centres, using doubled coordinates so every value is an integer.
3. Compute a minimum spanning tree with Kruskal's algorithm, ties broken by the pair of room ids.
4. Add `round(loop_ratio × (adjacencies − tree edges))` further adjacencies, chosen by RNG.
5. For every selected adjacency, choose one candidate doorway by RNG, set its terrain to `floor`, and place the door template there.

The result MUST be connected.

### 3. Roles and depth

1. Choose the entry room by RNG among rooms that touch the map's outer wall. Assign role `entry`.
2. Compute BFS depth over doorways from the entry. Neighbours are visited in ascending id order. Renumber rooms `r1` to `rN` in BFS order.
3. Assign role `dead_end` to rooms with exactly one doorway.
4. Assign role `boss` to the room of maximum depth. Ties break by RNG.
5. Each doorway cell belongs to the shallower of its two rooms; ties go to the lower id.

### 4. Room templates

Place each room template from `population.room_templates` at most once, in a room whose role and depth satisfy it and whose interior is at least the template's size, chosen by RNG. The template's map is copied onto the interior, offset by `floor((interior width − template width) / 2)` and `floor((interior height − template height) / 2)`. Void cells in the template keep the generated floor. Template contents follow, with `at` relative to the template's top-left cell.

### 5. Anchors and links

Place each anchor in a room satisfying its constraints:

| Constraint | Meaning |
|---|---|
| `min_depth`, `max_depth` | BFS depth range. |
| `prefer_role` | Choose a room with this role if one satisfies the other constraints. |
| `room_tags` | Room must carry all listed tags. |

Each anchor occupies a room that holds no other anchor and no room template, unless the anchor sets `shared: true`. Each link is placed in a room with its `role`. If no room satisfies an anchor or link, the attempt fails.

### 6. Locks

For each of the `gates_per_location` lock-and-key pairs, in order:

1. Take the path from the entry to the deepest anchor or, without anchors, to the `boss` room.
2. Choose a doorway on the path that is not yet locked and does not belong to the entry room, by RNG.
3. Choose a lock template from `generation.locks` by RNG. Replace the door with it, and set its `lock` to `has_item` for the lock's key item.
4. Place the key item in a room reachable from the entry without crossing this lock or any later lock.

Later locks lie deeper on the path than earlier locks.

### 7. Population

1. For each remaining room except the entry, add an encounter with probability `density`. Draw from the encounter table, filtered by the room's depth.
2. Place containers with loot in rooms with role `dead_end` or `boss`.
3. Assign room labels from the setting pack table `room_labels`, filtered by room tags.
4. Set every room's `light` to `population.ambient`, then set `round(lit_rooms × rooms)` rooms, chosen by RNG, to `bright`. A room template's own `light` overrides both.

Every placement without a fixed cell chooses its anchor cell by RNG among the room's *placement cells*: cells where the whole footprint is free, not a doorway, and not adjacent to a doorway. If none exist, the doorway restriction is dropped. If still none exist, the attempt fails.

### 8. Verification

Simulate access from the entry room with the pathfinding rules in [engine.md](engine.md#pathfinding), treating unlocked doors as passable:

1. Mark cells reachable from the entry.
2. Collect key items on reachable cells.
3. Treat locked doors whose key is collected as passable.
4. Repeat until no change.

The attempt passes if every anchor, link, and the `boss` room are reachable. On failure, the generator retries with the next attempt seed. After 20 failed attempts, the generator returns an error, and instance start fails.

## Output

The output is a location in the authored format of [adventure-packs.md](adventure-packs.md#authored), compiled:

```json
{
  "rows": ["########", "#......#", "#.......", "########"],
  "rooms": { "r1": { "label": "maintenance corridor", "tags": [], "role": "entry", "depth": 0, "light": "dark", "area": [[1, 1, 6, 2]] } },
  "links": { "x_up": { "label": "service lift", "at": [1, 1], "to": { "location": "dock", "link": "x_lift" } } },
  "contents": [ { "ref": "base:maintenance_drone", "at": [5, 2], "id": "lower_archive/e1" },
                { "ref": "base:bulkhead", "at": [7, 2], "id": "lower_archive/d1", "lock": { "has_item": "base:keycard" } } ]
}
```

Generated entities receive ids `<location>/e1`, `<location>/e2`, … in placement order, and generated doors `<location>/d1`, `<location>/d2`, … in doorway order. The `/` keeps them distinct from every material id. Materials never write generated ids; they reach generated content through anchor ids. A generated content entry MAY carry `lock`, which overrides the door template's lock.
