# Engine

The engine resolves tool calls against the state of a campaign instance. It owns everything that is the same in every game: maps, terrain, rooms, doors, line of sight, movement, conditions, rounds and ordering, requirements and effects, triggers, and the event log. Everything a ruleset decides — what a character sheet contains, how a roll works, what damage does, when a creature dies, how far a creature moves, how far a weapon reaches, who acts first in combat — is delegated to the campaign's rules system. See [systems/README.md](systems/README.md).

Material packs (settings and adventures) MUST NOT add rule logic. They supply data that the engine and the rules system interpret.

## Division of responsibility

| Concern | Engine | Rules system |
|---|---|---|
| Character sheet contents and creation | Stores the sheet; validates it with the system's schema | Defines the schema; creates sheets |
| Creature and item statistics | Stores `system_stats` from materials | Defines the schemas; builds runtime creature sheets with `instantiate` |
| Destructible obstacles and doors | Places them; removes their obstruction when destroyed | Defines the `structure` schema; builds sheets with `instantiate_structure` |
| Checks | Builds the situation; calls the system; applies the outcome | `check` |
| Attacks | Validates reach, line of sight, and possession; calls the system | `attack`, `reach` |
| Movement | Finds paths, enforces occupancy, spends movement | `speed`, `SPATIAL.metric` |
| Light and vision | Computes illumination; applies it to sight when the system enables it | `SPATIAL.lighting`, `senses` |
| Damage, healing, death, destruction | Applies the returned sheets and events | `harm`, `heal`, `tick` |
| Resting | Validates the `rest` tool | `rest` |
| Ability costs | Validates the ability, target, and range | `pay_cost` |
| Carrying capacity | Calls `can_carry` with the inventory after every change | `can_carry` |
| Using items | Applies item effects and uses | `use_item` for the item's rules effect |
| Ordering | Runs rounds; applies sort keys | Supplies the ordering policy; implements `initiative` |
| Maps, terrain, rooms, doors, links, sight, conditions, effects, triggers, events | All | None |
| Random numbers | Owns the seed and counter; passes an `Rng` | Draws only from the `Rng` it receives |

## Random numbers

All randomness derives from the instance seed and `state.rng_counter`. Each draw uses the current counter and increments it by 1. The algorithm identifier `splitmix64_v1` is defined as:

```
draw(seed, counter):
  z = (seed + (counter + 1) * 0x9E3779B97F4A7C15) mod 2^64
  z = ((z XOR (z >> 30)) * 0xBF58476D1CE4E5B9) mod 2^64
  z = ((z XOR (z >> 27)) * 0x94D049BB133111EB) mod 2^64
  return z XOR (z >> 31)
```

A die with `n` faces takes draws until a value `v < floor(2^64 / n) * n` appears, then returns `(v mod n) + 1`. Rejected draws consume counters. A dice expression `NdM+K` rolls N dice in sequence and adds K. Selections "by RNG" from a list of length `n` use a die with `n` faces and take the item at index `result - 1`.

The engine passes one `Rng` through each resolution, including every call into the rules system, and stores the final counter. Draw order is therefore the order of calls in this document, in event order, and the order of draws inside each system function.

Test vectors:

| Input | Output |
|---|---|
| `draw(0, 0)` | `0xE220A8397B1DCDAF` |
| `draw(0, 1)` | `0x6E789E6AA1B965F4` |
| `draw(42, 0)` | `0xBDD732262FEB6E95` |
| Five `d20` rolls, seed 42, counter from 0 | 14, 12, 19, 5, 11 |

## Combatants and sheets

Every creature in state has a `sheet` owned by the rules system:

- A character's sheet is the system character sheet, copied from the Character record when the character joins the instance.
- A creature's sheet is built by the system's `instantiate` function from the entity's `system_stats` when the creature is placed or spawned.
- An obstacle or door with `system_stats` has a structure sheet built by the system's `instantiate_structure` when it is placed.

When the engine calls the system, it passes a combatant:

```json
{ "id": "c_17", "side": "characters", "kind": "character",
  "sheet": { }, "items": { "base:wrench": { "weapon": true, "damage": 2 } } }
```

`kind` is `character`, `creature`, or `structure`. `items` maps each carried item's ref to its `system_stats`. The engine reads only `sheet.status` directly. A creature whose status is anything other than `active` cannot act. A structure whose status is anything other than `active` is destroyed.

## Situation

Before each system call that rolls, the engine builds a situation from state:

```json
{ "advantage": -1, "modifier": 0, "tags": ["melee", "cover"] }
```

| Field | Source |
|---|---|
| `advantage` | Sum of `situation.advantage` over the actor's conditions, clamped to `[-1, 1]` |
| `modifier` | Sum of `situation.modifier` over the actor's conditions |
| `tags` | The `tag` returned by the system's `reach` for attacks; `cover` when the target has cover (see [Cover](#cover)); `dim` or `dark` from the target's illumination (see [Lighting](#lighting)); the check's tags; the ability's tags |

Each system uses the fields it recognizes and ignores the rest. Models never contribute to the situation.

## Space

Every location is a square grid. The engine knows every cell's terrain and every entity's cell, and decides movement, reach, and sight from them. Players and models never handle coordinates: tools name rooms, doors, links, and entities by id, and the engine computes paths and distances.

### Cells

A cell is `[x, y]`. `x` increases east, `y` increases south, and `[0, 0]` is the top-left cell. A location is at most 64 × 64 cells. Materials draw maps as rows of characters; the formats are in [setting-packs.md](setting-packs.md#maps) and [adventure-packs.md](adventure-packs.md#authored).

### Terrain

Each cell has one terrain type. Terrain is the static layer of the map: it never changes during play.

| Field | Meaning |
|---|---|
| `obstructs` | `movement`, `sight`, both, or neither |
| `cost` | Movement spent to enter the cell, 1–4 |

Three terrain types are built in: `void` (outside the map; obstructs both), `floor` (obstructs neither, cost 1), and `wall` (obstructs both). Setting packs declare further types, such as water or rubble fields.

### Entities on the map

Every entity in a location occupies the cells of its footprint: `[width, height]` cells anchored at its top-left cell `at`, default `[1, 1]`. An entity carried in an inventory has no cell.

| Kind | Occupies | Obstructs by default |
|---|---|---|
| `creature` (characters, NPCs, other creatures) | Its footprint, exclusively among creatures | Movement of opposing creatures |
| `obstacle` | Its footprint | `movement` and `sight` |
| `door` | One cell | `movement` and `sight` while closed; nothing while open |
| `container`, `fixture` | Its footprint | Nothing |
| `item` | One cell | Nothing |

Obstacles, containers, and fixtures override the default with their `obstructs` field; doors set what they obstruct while closed. A cell is *open for a mover* when its terrain does not obstruct movement, no non-creature entity on it obstructs movement, and no creature of the other side occupies it. A cell is *free* when it is open and no other creature occupies it. Movers pass through allies' cells but stop only on free cells. Entities with the `hidden` condition still obstruct movement; they do not obstruct sight for those they are hidden from.

### Rooms

A room is a labelled set of cells given as rectangles. Every cell that is not `void` and whose terrain does not obstruct movement belongs to exactly one room, including door cells. An entity is *in* the room that contains its anchor cell. Room ids are unique within a location and identify places for players, triggers (`moved` with `location` and `to`), requirements (`room`), combat, and narration. Materials refer to rooms as `room` or `location.room`; the resolution rules are in [adventure-packs.md](adventure-packs.md#room-references).

### Containers

A container holds items. It has no open or closed state.

| Kind of container | Contents | `take` | `give` |
|---|---|---|---|
| Without `capacity` | Not shown in views or parser context | Moves all contents to the actor | Not a recipient |
| With `capacity` | Shown to characters in reach, and persisted in state | Moves one named item, or all contents, to the actor | A recipient while it holds fewer than `capacity` items |

A container with a `lock` starts locked, as a door does. While locked, it refuses `take` and `give` with `requirement_unmet` unless the lock holds for the actor; the first `take` or `give` for which it holds unlocks it for everyone. A verb named `open` is an ordinary verb with its own requirement and effects. Every character in reach shares a container's contents.

### Doors

A door is an entity of kind `door` with state `open` and `locked`. A door with a `lock` requirement starts locked.

- Opening an unlocked door, or a locked door whose `lock` holds for the actor, sets `open` and clears `locked`. The `lock` is evaluated with the [requirement](#requirements) rules.
- Using an item on a locked door whose `lock` is `has_item` for that item's ref opens it.
- A door cannot close while a creature or item occupies its cell.
- A door with `system_stats` can be attacked. When destroyed, it is removed, and its `remains`, if any, are placed in its cell. Destruction ignores the `lock`: a locked door with `system_stats` can be broken without its key.

### Links

A link is a cell that leads to a link in another location. A `move` to a link's id brings the mover to the link cell, then to the paired link's cell in the destination location, or to the nearest free cell to it by path cost. Links are the only way between locations. A link on a door cell can be travelled only while the door is open.

### Distance and adjacency

Distance uses the rules system's metric, `SPATIAL.metric`:

| Metric | Distance between `[x1, y1]` and `[x2, y2]` | Steps |
|---|---|---|
| `chebyshev` | `max(abs(x1 − x2), abs(y1 − y2))` | Eight directions |
| `manhattan` | `abs(x1 − x2) + abs(y1 − y2)` | Four directions |

The distance between two entities is the smallest distance between any cell of one footprint and any cell of the other. Two cells are *adjacent* when their distance is 1, except that a diagonal pair is not adjacent when either of the two cells it passes between obstructs movement. Movement never cuts a blocked corner.

### Line of sight

The engine draws lines between cell centres with this procedure, which returns every cell from `a` to `b`, both included:

```
line(a, b):
  (x, y) = a; (x1, y1) = b
  dx = abs(x1 − x); dy = −abs(y1 − y)
  sx = 1 if x < x1 else −1; sy = 1 if y < y1 else −1
  err = dx + dy
  loop:
    emit (x, y)
    if (x, y) = (x1, y1): stop
    e2 = 2 × err
    if e2 ≥ dy: err += dy; x += sx
    if e2 ≤ dx: err += dx; y += sy
```

Cell `a` sees cell `b` when no cell strictly between the endpoints of `line(a, b)` obstructs sight, or no such cell of `line(b, a)` does. The *sight line* is the first of the two that is clear. Sight is therefore symmetric, and the endpoints never block. An entity sees another when any cell of its footprint sees any cell of the other's. Sight has no range limit.

### Visibility and exploration

A creature *perceives* a cell when it sees the cell and, under [Lighting](#lighting), the cell is light enough for it. An entity is *visible* to a creature when the creature perceives any cell of the entity's footprint and the entity is not hidden from it. Views and parser context contain only visible entities.

After every resolved action, every cell perceived by any character becomes *seen* in the location's `seen` map. Seen cells are shared by the party and never revert. A room becomes `visited` when a character enters it. Clients draw seen cells; unseen cells are not sent.

### Lighting

Every cell has an *illumination*: `bright`, `dim`, or `dark`. After every resolved action, the engine computes it for every location that holds a character:

1. Each cell starts at the ambient light of its room, `light`, default `bright`. Cells in no room are `dark`.
2. A *light source* is an entity with `light` whose `lit` is true. It emits from every cell of its footprint, or from its carrier's cell while carried.
3. A cell within `bright` distance of an emitting cell, which that emitting cell sees, is at least `bright`. A cell within `dim` distance, which it sees, is at least `dim`. An emitting cell always lights itself.
4. A cell's illumination is the brightest of its ambient light and every source's light on it.

Distance uses `SPATIAL.metric`; sight uses the [line of sight](#line-of-sight) procedure.

The rules system decides whether illumination limits perception, with `SPATIAL.lighting`:

| `lighting` | A creature perceives a cell it sees when |
|---|---|
| `true` | The cell is `bright` or `dim`, or within the distance `senses(creature).darkvision` of the creature |
| `false` | Always; illumination never limits perception |

A lit source lights its own cell, so a creature carrying a torch is visible from the dark.

Whatever the system's setting, the engine reports illumination in views and in parser and narrator context, evaluates `illumination` requirements, and adds the tag `dim` or `dark` to the situation for an attack, ability, or check aimed at a target on such a cell. Systems interpret the tags or ignore them.

Light changes through:

| Means | Result |
|---|---|
| `use` on a carried item with `light` and no `use` effects | Toggles the item's `lit` |
| `interact` with verb `light` or `extinguish` on a container, fixture, or obstacle with `light`, in reach | Sets `lit` |
| Effect `set_light` | Sets `lit` on the target entity |
| Effect `set_room_light` | Sets a room's ambient `light` |

Each change emits `light_changed` or `room_light_changed`. Dropping, giving, or taking a light source moves where it emits from.

### Pathfinding

The engine finds the cheapest path with Dijkstra's algorithm:

1. Start with the mover's cell at cost 0. The frontier is ordered by `(cost, y, x)`, ascending.
2. Take the first cell from the frontier. If it is a goal, stop.
3. For each neighbour in the order north, east, south, west, north-east, south-east, south-west, north-west (the last four only under `chebyshev`), that is adjacent and open for the mover with its whole footprint: the new cost is the current cost plus the neighbour's terrain cost. Record the current cell as the neighbour's predecessor only when the new cost is strictly lower than any recorded cost, and add the neighbour to the frontier.
4. Repeat from step 2 until the frontier is empty, in which case there is no path.

The path is the chain of predecessors from the goal. When several goal cells are given, the first goal taken from the frontier wins: lowest cost, then lowest `y`, then lowest `x`. The result is unique for a given state.

Goal cells for a destination:

| Destination | Goal cells |
|---|---|
| Room | Its free cells |
| Item | Its cell, when free; otherwise the free cells adjacent to it |
| Link | Its cell |
| Creature, obstacle, container, fixture, door | Free cells adjacent to its footprint; for a door, also its cell when open |

### Movement

A mover walks its path one cell at a time, spending each cell's terrain cost.

| Mode | Movement per action |
|---|---|
| `exploration` | The whole path |
| `combat` | Up to the system's `speed` for the mover |

The mover stops on the last free cell it reaches within its allowance. In exploration, it also stops early on the first cell of a room that is not `visited`, and on the cell where a hostile creature first becomes visible that was not visible when the move began. The `moved` event records the reason.

In exploration, a path MAY pass a closed, unlocked door: the mover opens it on reaching it and emits `door_opened`. In combat, opening a door takes an `interact` action.

### Reach

| Action | In reach when |
|---|---|
| `attack` | Distance to the target is at most the `range` returned by the system's `reach`, and the target is visible to the attacker. A range of 1 requires adjacency. A null range means any visible target. |
| `ability` with a target | The target is visible, and within the ability's `range` when it has one. |
| `interact`, `take`, `give`, `use` on a target | The target's footprint is adjacent to the actor's, or shares a cell with it. |
| `talk` | The NPC is visible and in the actor's room. |
| `examine` | The target is visible. |

When the system's `SPATIAL.approach` is true, an `attack`, `interact`, `take`, `give`, or `use` on a visible target that is out of reach first moves the actor toward the nearest cell from which the target is in reach, under the movement rules for the mode, then acts if the target is in reach. If it is not, the move stands and the action is voided with `not_reachable`. When `approach` is false, an out-of-reach target fails with `not_reachable`.

### Cover

A target has cover against an attack when an obstacle, container, or fixture with `cover: true` occupies a cell strictly between the endpoints of the sight line from the attacker to the target. The engine adds the tag `cover` to the situation; systems interpret it.

### Test vectors

Map `crypt`:

```
#########
#...#...#
#.#.#.#.#
#.......#
#########
```

Map `hall`:

```
#######
#.....#
#.....#
#.....#
#######
```

| Input | Output |
|---|---|
| `line([0, 0], [5, 2])` | `[0,0] [1,0] [2,1] [3,1] [4,2] [5,2]` |
| `crypt`: `[1, 1]` sees `[3, 1]` | true |
| `crypt`: `[1, 1]` sees `[5, 1]` | false |
| `crypt`: `[1, 3]` sees `[7, 1]` | false |
| `crypt`, `chebyshev`, cost 1: path `[1, 1]` → `[7, 1]` | `[1,1] [2,1] [3,1] [3,2] [3,3] [4,3] [5,3] [5,2] [5,1] [6,1] [7,1]` |
| `hall`, `chebyshev`, cost 1: path `[1, 1]` → `[4, 3]` | `[1,1] [2,1] [3,2] [4,3]` |
| `hall`, `manhattan`, cost 1: path `[1, 1]` → `[4, 3]` | 6 cells |
| `hall`, `chebyshev`: path from `[3, 2]` to the nearest of `[5, 1]`, `[1, 3]`, `[1, 1]`, `[5, 3]` | ends at `[1, 1]` |
| `hall`, `chebyshev`, footprint `[2, 2]`: path `[1, 1]` → `[4, 2]` | `[1,1] [2,1] [3,1] [4,2]` |
| Map `####` / `#.##` / `##.#` / `####`: path `[1, 1]` → `[2, 2]` | none; the cells are not adjacent |

Direction labels in views and parser context use the offset `(dx, dy)` from the actor to the target: `here` when both are 0; `east` or `west` when `abs(dx) ≥ 2 × abs(dy)`; `north` or `south` when `abs(dy) ≥ 2 × abs(dx)`; otherwise the diagonal, such as `south-east`. `(3, −1)` is `east`, `(2, 2)` is `south-east`, `(1, 3)` is `south`.

## Items

Items MAY have `uses`. An item with `uses: 0` cannot be used. Items with `uses: null` are unlimited. Carrying capacity is decided by the system's `can_carry`, which the engine calls with the inventory a character would hold after any take, give, drop, or use; a change it refuses fails with `requirement_unmet`.

## Conditions

Conditions are declared by setting packs. Each condition has:

- `blocks`: tools the condition prevents.
- `on_turn_start`: effects applied when the bearer's action resolves, before the action.
- `duration`: number of rounds, or `null` for until removed.
- `situation`: optional `advantage` and `modifier` contributions.

The engine defines two conditions that every pack inherits: `incapacitated` (blocks every ordered tool) and `hidden` (the entity is absent from other parties' views and parser context until revealed, and does not block their sight). Rules systems express their own states, such as Quest's death's door, through `sheet.status`, which the engine reports as conditions in views and narration.

## Pending choices

Some rules give the player a decision in the middle of resolution, such as Quest's tough choice between two setbacks. A system returns such a decision as a pending choice. The engine:

1. Commits the rest of the resolution and stores the choice in `state.pending_choices[actor]`.
2. Emits `choice_offered` with the options' ids and labels.
3. Accepts only the `choose` tool, or free tools, from that actor until the choice is resolved.
4. Applies the chosen option's updates, events, and effects, emits `choice_made`, and continues the round.

A round cannot close while a choice is pending. When the round or turn timeout expires, the Coordinator resolves each pending choice with its first option.

## Modes

The instance mode is `exploration` or `combat`.

Combat starts when an `attack` targets a creature, or when the effect `start_combat` is applied. The room where it starts becomes the first room of the *combat area*. A room joins the combat area when a combatant enters it.

An entity is *hostile* when its template, or its NPC through `disposition: hostile`, carries the tag `hostile`. The effect `set_hostile` adds or removes the tag on one entity for the rest of the instance. A creature without the tag never becomes a combatant, even when attacked.

At each round start, a hostile entity whose status is `active` becomes a combatant when it is in the combat area or a character in the combat area is visible to it. Combatants stay combatants until combat ends.

Combat ends when no combatant entity can act, or when no character is in the combat area and no character is visible to any combatant entity.

Mode changes take effect at the start of the next round. The current round completes under the mode in which it started.

## Rounds

All play proceeds in rounds. The time at which an input arrives never determines the order in which actions resolve. The engine computes resolution order from the rules system's ordering policy for the round's mode.

A round includes every character in the instance whose sheet status is `active`. In combat, a round also includes every combatant entity (see [Modes](#modes)). Characters outside the combat area take part in combat rounds with exploration tools only.

Each round proceeds as follows:

1. The engine emits `round_started` with the round number and mode.
2. Participants act under the policy's `resolution` method.
3. The engine calls the system's `tick` for every participant and applies the results.
4. Condition durations decrease by 1 for every participant. Expired conditions are removed.
5. The engine increments `clock.turn`, emits `clock_tick` and `round_ended`, and starts the next round.

### Resolution methods

**`sequential`.** The engine computes the order at round start. Participants act one at a time in that order. Only the current participant MAY submit an action, and the action resolves on submission. A character input submitted out of turn fails with `not_your_turn`. Entity turns resolve automatically when reached. Participants whose status is not `active` are skipped.

**`simultaneous`.** Each character declares one action during the round. The engine validates a declaration when it is submitted and stores it in `state.round.declarations`. A character MAY replace its declaration until the round closes. The round closes when every character has declared, or when the Coordinator invokes `advance`. On close, the engine computes the order, adds entity actions, and resolves all actions in order. Each action is validated again at its resolution point. An action that fails validation is voided: the engine emits `action_voided` and the actor waits.

In both methods, a character with no action when its turn is skipped or the round closes takes `wait`.

### Free tools

`examine`, `improvise`, and `choose` are free tools. They resolve immediately on submission in any mode and at any point in a round. They do not occupy a turn or a declaration.

### Ordering policy

Each rules system defines one policy per mode in its `ORDERING` constant:

```json
{
  "exploration": { "resolution": "simultaneous",
                   "order": [ { "key": "tool_priority", "tools": ["move", "talk", "interact", "take", "give", "drop", "use", "ability", "attack", "search", "wait"] } ],
                   "reroll": "never" },
  "combat":      { "resolution": "sequential",
                   "order": [ { "key": "initiative" } ],
                   "reroll": "per_round" }
}
```

| Field | Values | Meaning |
|---|---|---|
| `resolution` | `sequential`, `simultaneous` | See [Resolution methods](#resolution-methods). |
| `order` | list of sort keys | Applied in sequence; later keys break ties left by earlier keys. |
| `reroll` | `never`, `per_round`, `per_combat` | When the `initiative` key is recomputed. The result is stored in `state.round.initiative`. |

Sort keys:

| Key | Arguments | Sorts by |
|---|---|---|
| `side` | `first`: `characters` or `entities` | Participant side. |
| `initiative` | none | Position in the list returned by the system's `initiative` function. |
| `tool_priority` | `tools` | Position of the declared tool in the list. Valid only with `simultaneous`. |

The engine appends ascending participant id as a final key, so every order is total. No sort key depends on submission time.

The policies of the implemented systems are listed in [systems/](systems/README.md#implemented-systems).

### Entity turns

The engine chooses entity actions without a model, from the entity's `behavior`:

| Behavior | Turn rule |
|---|---|
| `aggressive` | Attack a character in reach, chosen by RNG. Otherwise move toward the character with the cheapest path, ties broken by ascending id; with `approach`, attack if one is then in reach. |
| `defensive` | Attack a character in reach, chosen by RNG. Otherwise `wait`. |
| `passive` | `wait`. |
| `fleeing` | Move to the free cell within its `speed` that is farthest from the nearest character; ties go to the cheaper path, then lowest `y`, then lowest `x`. If no cell is farther than its current one, `wait`. |

An entity with `flee_when_harmed: true` switches to `fleeing` the first time a system returns a `damaged` event for it.

An entity attack calls the system's `attack` with the entity as attacker. A player-facing system MAY resolve it as the defending character's roll.

Under `sequential`, after a character acts, the engine resolves all following entity turns until the next character's turn, and returns all resulting events in one result. Under `simultaneous`, the engine chooses each entity's action at its resolution point.

## Requirements

Requirements are boolean expressions. Adventure trigger conditions use the same language.

| Form | True when |
|---|---|
| `{ "all": [R...] }` | every R is true |
| `{ "any": [R...] }` | at least one R is true |
| `{ "not": R }` | R is false |
| `{ "flag": "f" }` | flag `f` is truthy; for a character-scoped flag, the actor's value |
| `{ "flag": "f", "eq" \| "gte" \| "lte": v }` | comparison holds |
| `{ "stage": ["arc", "stage"] }` | arc is at the stage |
| `{ "has_item": "ref" }` | the actor holds an item with that ref |
| `{ "location": "id" }` / `{ "room": "id" }` | the actor is there |
| `{ "near": "entity_id", "within": n }` | the actor is within `n` cells of the entity |
| `{ "illumination": "dark" }` | the actor's cell has that illumination |
| `{ "defeated": "entity_id" }` | the entity's status is not `active` |
| `{ "check": spec }` | the system's `check` returns `partial`, `success`, or `critical_success` (consumes RNG) |

The *actor* is the creature whose action is being resolved. In a trigger's `when`, it is the matched event's actor; requirements about the actor are false for events without one. `room` accepts `room` or `location.room`.

`spec` is the system's check specification, validated against the system's check schema when materials compile. A `partial` result that carries a pending choice counts as passing; the choice is offered after the requirement is evaluated.

## Effects

Effects are the only way materials change state. Each effect is a single-key object.

Verbs on containers, fixtures, obstacles, and doors, item `use` effects, and ability effects apply the setting effects: every effect in this table except `set_flag`, `add_flag`, `set_stage`, `end_campaign`, and `reveal` of secrets. This holds for templates in adventure packs too. Plot effects belong in triggers, for example a trigger on `interacted` with the verb.

| Effect | Arguments | Result |
|---|---|---|
| `damage` | `target`, `dice` or `amount`, `type?` | Roll the amount and call the system's `harm` with the type. |
| `heal` | `target`, `dice` or `amount` | Call the system's `heal`. |
| `apply_condition` | `target`, `condition`, `duration?` | Add a condition. |
| `remove_condition` | `target`, `condition` | Remove a condition. |
| `give_item` / `remove_item` | `target`, `ref` | Change inventory. `give_item` respects `can_carry`; an item that cannot be carried drops to the target's cell. |
| `drop_item` | `target`, `ref` | Move a carried item to the target's cell. |
| `spawn` | `ref`, `room`, `at?`, `id?` | Create an entity at `at`, or at a free cell of the room chosen by RNG from its free cells in row-major order. Creature sheets come from `instantiate`. |
| `despawn` | `target` | Remove an entity. |
| `move_entity` | `target`, `room`, `at?` | Relocate a creature, as for `spawn`. No path is needed. |
| `open_door` / `close_door` | `door` | Open and unlock, or close, a door. `close_door` has no effect while the door's cell is occupied. |
| `set_light` | `target`, `lit` | Light or extinguish a light source. |
| `set_room_light` | `room`, `level` | Set a room's ambient light to `bright`, `dim`, or `dark`. |
| `set_flag` / `add_flag` | `flag`, `value`, `target?` | Change a flag, clamped to its range. For a character-scoped flag, change the acting character's value, or with `target: room` every character's in the actor's room. `target` is valid only on character-scoped flags. Adventures only. |
| `set_hostile` | `target`, `hostile` | Add or remove the `hostile` tag on an entity, keeping its cell, sheet, and conditions. |
| `set_stage` | `arc`, `stage` | Change an arc stage. Adventures only. |
| `reveal` | `target` or `secret` | Remove `hidden`, or release a secret to the narrator. Secrets: adventures only. |
| `start_combat` | none | Enter combat in the actor's room. |
| `end_campaign` | `ending` | End the instance with the named ending. Adventures only. |
| `if` | `when` (requirement), `then` (effects), `else?` (effects) | Conditional effects. |

`target` accepts an entity id, `actor`, `target` (the tool call's target), or `room` (every creature in the actor's room). A `spawn` or `move_entity` whose room has no free cell has no effect.

Rules systems MAY return effects in a resolution, for example Quest's `drop_item` setback. The engine applies them after the resolution's sheet updates.

When a structure's status leaves `active`, the engine emits `destroyed`, removes the entity, and places its `remains`, if any, at its anchor cell.

## Action resolution

| Tool | Validation | Resolution |
|---|---|---|
| `move` | `to_id` is a room, door, link, or visible entity, or `away_from_id` is a visible creature; a path exists; not blocked by condition | Walk as in [Movement](#movement); travel the link when `to_id` is a link and the mover reaches it; set rooms `visited`; emit `moved`. For `away_from_id`, the goal is the free cell within the allowance farthest from that creature, ties as for `fleeing`. |
| `attack` | target visible; in reach, or reachable by approach; item held if given | Call `attack(actor, target, weapon, situation, rng)`; start combat if not in combat and the target is a creature. |
| `ability` | ability known; target valid for target type and in range | Call `pay_cost` with the ability's `system_stats.cost`; if the system marks the ability as rolled (see each system's document), call `check`; on a passing outcome, apply effects. |
| `use` | item held; uses remaining; target valid and in reach; the item has `use` effects, `light`, or a non-null `use_item` result | Call `use_item`; apply its resolution, and remove the item when it returns `consume: true`; then apply item effects and decrement uses. Using an item on a door whose `lock` is `has_item` for that ref opens it. Using a light source with no `use` effects toggles it. |
| `interact` | target in reach; verb defined on target, `open` or `close` on a door, or `light` or `extinguish` on a light source; verb requirement holds | Apply verb effects. `open` and `close` on a door follow [Doors](#doors); `light` and `extinguish` follow [Lighting](#lighting). |
| `examine` | target visible, or omitted | No state change; emit `examined`. |
| `search` | not in combat | Call `check` with the system's `STANDARD_CHECKS.search`; on a passing outcome, reveal hidden entities in the actor's room that the actor sees. |
| `take` | target is an item, a container, or an item in a container with `capacity`, in reach; the container's `lock` holds; `can_carry` holds for the resulting inventory | Move the item or items to inventory. |
| `drop` / `give` | item held; `can_carry` holds for the actor's resulting inventory; for `give`, the recipient is a character or a container with `capacity` and room, in reach, whose `lock` holds; `can_carry` holds for a recipient character | Move the item to the recipient, or to the actor's cell. `item_given` carries `to` with the recipient's id. |
| `talk` | NPC in reach; topic available if given | Emit `talked`; topic briefs pass to the narrator. |
| `rest` | not in combat; `kind` is `short` or `long`; no hostile creature visible | Call `rest` for the actor. |
| `wait` | none | Emit `waited`. |
| `choose` | actor has a pending choice; option id exists | Apply the option. |
| `improvise` | none | Emit `improvised`. No other state change. |

After each action resolves, the engine evaluates triggers (see [adventure-packs.md](adventure-packs.md#triggers)), recomputes illumination, updates seen cells, then evaluates combat end conditions.

## Events

Events produced by the engine:

| Type | Payload |
|---|---|
| `moved` | `actor`, `location`, `from` (room), `to` (room), `at` (cell), `steps`, `stopped` (`arrived`, `allowance`, `new_room`, `hostile_seen`), `via?` (link id) |

When a move travels a link, `via` is the id of the link the mover entered, in the location it left; `location`, `to`, and `at` describe the arrival, and `from` is the room the mover left.
| `item_taken` / `item_dropped` / `item_given` | `actor`, `item` (entity id), `ref`, `to?` |
| `item_used` | `actor`, `item`, `target?` |
| `ability_used` | `actor`, `ability`, `target?` |
| `interacted` | `actor`, `target`, `verb` |
| `examined` | `actor`, `target?` |
| `searched` | `actor`, `success`, `revealed[]` |
| `talked` | `actor`, `npc`, `topic?`, `utterance` |
| `waited` | `actor` |
| `improvised` | `actor`, `category`, `intent`, `suggestions[]` |
| `choice_offered` | `actor`, `options[]` of `{ id, label }` |
| `choice_made` | `actor`, `option` |
| `door_opened` / `door_closed` | `door`, `actor?` |
| `destroyed` | `target`, `ref` |
| `light_changed` | `target`, `lit`, `actor?` |
| `room_light_changed` | `room`, `level` |
| `entity_spawned` / `entity_despawned` | `entity` |
| `flag_set` | `flag`, `value` |
| `stage_set` | `arc`, `stage` |
| `revealed` | `target` or `secret` |
| `trigger_fired` | `trigger` |
| `round_started` | `number`, `mode`, `resolution`, `order[]` (sequential only) |
| `action_declared` | `actor` |
| `action_voided` | `actor`, `tool`, `reason` (error code) |
| `turn_started` | `participant`, `number` |
| `round_ended` | `number` |
| `combat_started` | `room` |
| `combat_ended` | `room` |
| `clock_tick` | `turn` |
| `instance_ended` | `ending` |
| `state_restored` | `from_version`, `to_version`, `reason` |

`moved` is also emitted for entity moves and for `move_entity`, with `steps: 0` for the effect.

An event's *actor* is the creature its payload names in `actor`. Events with an actor: `moved`, `item_taken`, `item_dropped`, `item_given`, `item_used`, `ability_used`, `interacted`, `examined`, `searched`, `talked`, `waited`, `improvised`, `choice_offered`, `choice_made`, `action_declared`, `action_voided`, and `attacked`. `door_opened`, `door_closed`, and `light_changed` have an actor when an action caused them and none when an effect did. Every other event has no actor.

Events produced by rules systems, passed through unchanged. Every system emits the common events; a system MAY add its own types, which it documents.

| Type | Payload | Emitted by |
|---|---|---|
| `attacked` | `actor`, `target`, system-specific result fields | every system |
| `check_rolled` | `target`, `outcome`, system-specific fields | every system |
| `healed` | `target`, `amount` | every system |
| `condition_applied` / `condition_removed` | `target`, `condition` | every system |
| `died` | `target` | every system |
| `damaged` | `target`, `amount`, `remaining`, `cause?` | systems with numeric health (Quest) |
| `resource_changed` | `target`, `resource`, `delta?`, `value` | systems with spendable resources (Quest) |

Triggers MAY match any event type in either table.

`state_restored` is emitted only by the operator operation `restore_instance` (see [api.md](api.md#administrative-operations)). It is not produced by `submit` or `advance`. During replay, a `state_restored` event replaces the replayed state with the state replayed up to `to_version`.

## Error codes

| Code | Meaning |
|---|---|
| `invalid_call` | Tool name or arguments fail the schema. |
| `unknown_id` | A referenced id does not exist in state. |
| `not_reachable` | The target exists but is out of reach or out of sight, or no path leads to the destination. |
| `not_your_turn` | The round uses `sequential` resolution and the actor is not the current participant. |
| `invalid_in_mode` | Tool is not available in the current mode. |
| `requirement_unmet` | A requirement, lock, cost, capacity, or use limit fails. Rules systems raise this code for rule rejections. |
| `blocked_by_condition` | A condition on the actor blocks the tool. |
| `choice_pending` | The actor has a pending choice and submitted a tool other than `choose` or a free tool. |
| `instance_not_active` | Instance status is not `active`. |
