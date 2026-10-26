# Dungeon Generation

The generator converts a generated location spec into a map: terrain rows, rooms, doors, links, and contents. Its output has the same structure as an authored location, so the engine treats both alike.

## Interface

```
generate(spec, setting_bundles, adventure_bundle, metric, seed) -> { ok: true, location: Location, aliases: Aliases, attempt: int }
                                                                 | { ok: false, error: string }
```

`setting_bundles` are the campaign's setting bundles in campaign material order. `metric` is the rules system's `SPATIAL.metric`, used for adjacency in placement and verification. `seed` is the instance seed. `aliases` and `attempt` are described in [Output](#output).

The generator MUST be deterministic for identical input. The location seed is `draw(instance_seed XOR fnv1a64(location_id), 0)`, using `draw` from [engine.md](engine.md#random-numbers). `fnv1a64` is 64-bit FNV-1a over the UTF-8 bytes of the id (offset basis `0xCBF29CE484222325`, prime `0x100000001B3`).

Generation makes at most 20 attempts, numbered from 0. Attempt 0 uses the location seed as its seed; attempt `n`, for `n` from 1 to 19, uses `draw(location_seed, n)`. Each attempt runs the whole pipeline with its own random-number state: the attempt seed and a counter starting at 0. The generator never reads or advances `state.rng_counter`. Implementations MAY generate all locations at instance start or each location on first entry.

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

The *generation pack* is the first setting pack, in campaign material order (ascending `position`, see [data-model.md](data-model.md#campaign-material)), whose manifest declares `generation`. It supplies `generation.door` for every doorway, `generation.locks` for lock-and-key pairs, and the table `room_labels` for room labels. See [setting-packs.md](setting-packs.md#manifestyaml). An adventure that depends on the doors and locks of its own setting pack lists that pack in `requires_settings`; campaign creation places the required settings before the other settings in material order, so the required pack that declares `generation` precedes any other.

## Pipeline

The steps run in the order below. Each attempt either passes verification or fails; a failed attempt is discarded whole.

### Draws and orders

- Selections "by RNG" use the attempt's counter and the selection rule in [engine.md](engine.md#random-numbers). A selection by RNG rolls its die even from a list of one item. The boss tie-break in step 3.4 is the one selection made only when there is more than one candidate. A step whose candidate list is empty makes no draw.
- Candidate lists are in row-major order (by `y`, then `x`), in room order, or in ascending id order before a selection, so results do not depend on hash order. Ids and refs compare by code point. *Room order* is ascending room number: until the renumbering of step 3.2, rooms are numbered in row-major order of their region's top-left cell; from then on, room `rK` has number `K`.
- `round(x)` is the integer nearest to `x`, halves rounded up. Products inside `round`, and `p × 2^64` in a chance, are evaluated in IEEE 754 binary64 arithmetic.
- A *chance* of probability `p` takes one draw `v`, also when `p` is 0 or at least 1. The event occurs when `p` is at least 1 or `v < floor(p × 2^64)`.
- A draw from a weighted table uses the weighted selection rule in [engine.md](engine.md#random-numbers), over the eligible entries in table order. With no eligible entry, nothing is drawn and nothing is placed.
- An entry's `count` gives the number of entities placed: an integer, or a dice expression rolled when the entry is placed, where a total below 0 places none. Without `count`, one entity is placed. Each entity chooses its own cell.

### 1. Layout

A region is a rectangle of cells that includes its boundary walls. Neighbouring regions share the wall line between them.

1. The root region is the whole map. Draw the room count `N` by RNG from `generator.rooms[0]` to `generator.rooms[1]`.
2. A region *can split* when its interior width or height is at least `2 × min_room + 1`. Repeat until there are `N` regions or no region can split:
   1. Take the region with the largest interior area among the regions that can split; ties go to the earliest created.
   2. Split it with a vertical wall line when its interior is wider than tall, with a horizontal wall line when it is taller than wide, and, when both are equal, by RNG from `[vertical, horizontal]`.
   3. Choose the wall line by RNG among the positions, in ascending order, that leave both interiors at least `min_room` cells across.
   4. Replace the region with its two children. The west child of a vertical line, or the north child of a horizontal line, is created first.
3. Fewer than `generator.rooms[0]` regions fails the attempt.
4. Each region becomes a room, numbered in row-major order of its region's top-left cell: boundary cells are `wall`, interior cells are `floor`. Cells outside every interior stay `wall`.

### 2. Adjacency and connectivity

1. Two rooms are adjacent when they share a wall line along which at least one wall cell has an interior cell of each room on its two opposite sides. Those wall cells are the candidate doorways, in row-major order. Adjacencies are ordered by the pair `(a, b)` of their room numbers, `a < b`.
2. Weight each adjacency by the squared distance between the centres of the two regions, in doubled coordinates so every value is an integer: the doubled centre of a region at `[x, y]` with size `[w, h]` is `[2x + w, 2y + h]`.
3. Compute a minimum spanning tree with Kruskal's algorithm, taking adjacencies in ascending order of weight, then `a`, then `b`.
4. Add `round(loop_ratio × (adjacencies − tree edges))` further adjacencies, chosen one at a time by RNG, without replacement, from the non-tree adjacencies in `(a, b)` order.
5. For every selected adjacency, in `(a, b)` order, choose one candidate doorway by RNG, set its terrain to `floor`, and place the generation pack's door template there.

The result MUST be connected; an attempt whose rooms are not connected fails.

### 3. Roles and depth

1. Choose the entry room by RNG, in room order, among rooms whose region lies on the map's outer wall: its boundary includes a cell of the first or last row or column. Assign role `entry`.
2. Compute BFS depth over doorways from the entry. Neighbours are visited in ascending room number. Renumber rooms `r1` to `rN` in BFS order; the entry is `r1`. Each room other than the entry has a *BFS parent*, the room from which the search first reached it.
3. Assign role `dead_end` to rooms with exactly one doorway.
4. Assign role `boss` to the room of maximum depth. When several rooms share the maximum depth, choose one by RNG among them in room order.
5. Each doorway cell belongs to the shallower of its two rooms; ties go to the lower room number. *Doorway order* is row-major order of doorway cells.

A room holds a set of roles: none, one, or several, such as an entry with one doorway. The generator assigns only `entry`, `dead_end`, and `boss`. A role constraint of a room template, anchor, or link holds when the room holds that role. The schemas also accept the role `treasure`, which no room holds: a room template with role `treasure` is never placed, `prefer_role: treasure` selects no preferred room, and a generated link with role `treasure` fails compilation ([adventure-packs.md](adventure-packs.md), compilation check 9).

### 4. Room templates

Room templates are placed in `population.room_templates` list order. For each template:

1. The eligible rooms hold no room template, hold the template's `role` (any room is eligible for `any`), have a depth within `min_depth` and `max_depth`, and have an interior at least the template's width and height.
2. With no eligible room, the template is not placed and the attempt continues. Otherwise choose the room by RNG.
3. Copy the template's map onto the interior, offset by `floor((interior width − template width) / 2)` and `floor((interior height − template height) / 2)`. Void cells in the template keep the generated floor.
4. Place the entities of the map's legend `place` entries at their cells, in row-major order. Then place the template's contents in list order: an entry with `at` is placed at that cell, relative to the template's top-left cell; an entry without `at` places `count` entities at placement cells.
5. The room takes the template's `label` and `tags` (no tags when the template has none). It draws no label in step 7.3, and the template's `light`, when set, overrides step 7.4.

A room holds at most one room template, and each template is placed at most once.

### 5. Anchors and links

Anchors are placed in list order. Each anchor's candidate rooms satisfy its constraints:

| Constraint | Meaning |
|---|---|
| `min_depth`, `max_depth` | BFS depth range. |
| `prefer_role` | When candidate rooms hold this role, only those remain candidates; otherwise every candidate remains. |
| `room_tags` | Room must carry all listed tags. |

Each anchor occupies a room that holds no other anchor and no room template, unless the anchor sets `shared: true`. Choose the room by RNG among the candidates, then place the anchor's entity at a placement cell.

Links are placed in ascending id order. Each link is placed in a room, chosen by RNG, among the rooms that hold its `role`, at a placement cell for a one-cell entity that obstructs nothing. A link reserves its cell: no later placement uses it. Links MAY share a room with anchors, room templates, and other links.

If no room satisfies an anchor or link, the attempt fails.

### 6. Locks

Steps 1 to 3 choose every lock; step 4 then places every key. With `gates_per_location` 0, this stage makes no draws.

1. The target room is the room of the deepest anchor, the first in list order among equally deep anchors, or, without anchors, the `boss` room. The *lock path* is the chain of rooms from the entry to the target through BFS parents. Its doorways are the doorways that join consecutive rooms of the chain, ordered from the entry outward.
2. For each lock-and-key pair in turn, the candidate doorways are the doorways of the lock path that lie further along it than the previous lock's doorway and do not belong to the entry room, in doorway order. Choose one by RNG. With no candidate, the attempt fails.
3. Choose a lock template by RNG from the keys of `generation.locks`, in ascending ref order. Replace the door with it, and set its `lock` to `has_item` for the key item that `generation.locks` maps it to.
4. For each pair in order, the key's candidate rooms are the rooms reachable from the entry over doorways without crossing this pair's door or the door of any later pair, in room order. Reachability here follows the room graph only. Choose the room by RNG, then place the key item at a placement cell.

Each lock lies further along the lock path than every earlier lock.

### 7. Population

1. The *remaining rooms* are the rooms other than the entry that hold no room template and no anchor. For each remaining room in room order, take a chance of `population.density`. When it occurs, draw from the encounter table, among the entries whose `depth` range includes the room's depth and the entries without `depth`, and place `count` entities of the drawn entry at placement cells.
2. With a `population.loot_table`, the *loot containers* are the container templates, in the setting packs and the adventure, whose `contents` draw from that table, in ascending ref order. When there is at least one, each room in room order that holds `dead_end` or `boss` receives one loot container, chosen by RNG, at a placement cell. Without a loot table or a loot container, no containers are placed.
3. Each room in room order without a label draws its label from the generation pack's `room_labels`, among the entries whose `tags` the room carries in full; an entry without `tags` matches every room. With no matching entry, the room's label is its id.
4. With a `dim` or `dark` ambient, choose `round(lit_rooms × N)` rooms by RNG, one at a time without replacement, from every room in room order. With a `bright` ambient, no rooms are chosen and no draws are made. Each room's `light` is its room template's `light` when set, otherwise `bright` for a chosen room, otherwise `population.ambient`.

Every placement without a fixed cell chooses its anchor cell by RNG among the room's *placement cells* for the entity. A cell is *free for a placement* when it belongs to the room, its terrain is not `void` and does not obstruct movement, it is not a link cell, and no non-creature entity on it obstructs movement; in addition, no creature is on it when the entity is a creature, and no entity is on it when the entity obstructs movement. Obstruction follows [engine.md](engine.md#entities-on-the-map); a creature obstructs nothing for placement. The placement cells are the room's cells, interior cells and owned doorways in row-major order, from which the entity's whole footprint is free for the placement and no footprint cell is a doorway or adjacent to a doorway under `metric`. If none exist, the doorway restriction is dropped. If still none exist, the attempt fails.

*Placement order* is the order of the stages above: room template entities, anchors, keys, encounters, then loot containers.

### 8. Verification

Simulate access from the entry room with the adjacency rules in [engine.md](engine.md#distance-and-adjacency) under `metric`:

1. A cell is passable when its terrain does not obstruct movement and no non-creature entity on it obstructs movement, except a door that counts as open. Creatures never block access. A door counts as open when it has no lock, from its content entry or else its template, or when its lock is `has_item` for a collected key. A door with any other lock never counts as open.
2. Mark the passable cells of the entry room, then every passable cell reachable from them in steps between adjacent passable cells.
3. Collect every item on a marked cell; its ref counts as a collected key.
4. Repeat until neither the marked cells nor the collected keys change.

The attempt passes when every anchor's entity has a marked footprint cell, or, for an entity that obstructs movement, a marked cell adjacent to its footprint; every link cell is marked; and a cell of the `boss` room is marked. On failure, the generator retries with the next attempt seed. After 20 failed attempts, the generator returns an error, and instance start fails. A problem that no attempt can fix, such as no generation pack or a ref, table, or NPC that does not resolve, returns an error without further attempts.

## Output

The output is a location in the authored format of [adventure-packs.md](adventure-packs.md#authored), compiled:

```json
{
  "rows": ["########", "#......#", "#.......", "########"],
  "legend": {},
  "rooms": { "r1": { "label": "maintenance corridor", "tags": [], "role": "entry", "depth": 0, "light": "dark", "area": [[1, 1, 6, 2]] } },
  "links": { "x_up": { "label": "service lift", "at": [1, 1], "to": { "location": "dock", "link": "x_lift" } } },
  "contents": [ { "ref": "base:maintenance_drone", "at": [5, 2], "id": "lower_archive/e1" },
                { "ref": "base:bulkhead", "at": [7, 2], "id": "lower_archive/d1", "lock": { "has_item": "base:keycard" } } ]
}
```

| Field | Contents |
|---|---|
| `rows` | One string per map row: ` ` for `void`, `.` for `floor`, `#` for `wall`, and the `legend` character of every other terrain. |
| `legend` | Character to terrain id, for each terrain other than `void`, `floor`, and `wall` that appears in `rows`, in ascending character order. |
| `rooms` | `r1` to `rN`: `label`, `tags`, `role`, `depth`, `light`, and `area`. `role` is the first of `entry`, `boss`, and `dead_end` that the room holds, or `null`. `area` is the interior rectangle, then one `[x, y, 1, 1]` rectangle per owned doorway in row-major order. |
| `links` | Each link in ascending id order: its `label` and `to` from the spec, and its cell `at`. |
| `contents` | Placed entities in placement order, then doors in doorway order. An entity entry has `ref`, `at`, and `id`; an NPC entry has `npc` and `at`, and the NPC id is its entity id. A gated door carries `lock`; a hidden entity carries `hidden: true`. |

Legend characters are assigned in two passes:

1. For each placed room template in placement order, each character of its map legend in ascending order takes its terrain, unless the terrain is `void`, `floor`, or `wall`, already has a character, or the character is taken.
2. Each terrain on the map without a character, in ascending id order, takes the first character not yet taken among the printable ASCII characters `!` to `~`, in ascending order, excluding `.` and `#`.

Every placed entity that is not an NPC and has no id from its material receives an id `<location>/e1`, `<location>/e2`, … in placement order. The door in the `i`-th doorway in doorway order receives `<location>/d<i>`. The `/` keeps generated ids distinct from every material id. Materials never write generated ids; they reach generated content through anchor ids. A generated content entry MAY carry `lock`, which overrides the door template's lock.

`aliases` maps the room references of [adventure-packs.md](adventure-packs.md#room-references) to room ids: `r1` and `entry` to `r1`, `boss` to the `boss` room, each anchor id to the room that holds its entity, and each link id to the room that holds the link. `attempt` is the number of the attempt that passed verification.
