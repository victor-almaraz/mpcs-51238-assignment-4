# Adventure Authoring

This guide builds a short adventure pack, `sunken_archive`, for the Quest rules system and the `derelict_station` setting pack. The adventure has one plot arc, an authored location, a generated location, and an NPC. Players restore power to a lift, descend into a generated archive, recover a reactor core, and escape.

Reference: [adventure-packs.md](../adventure-packs.md) for file formats and trigger evaluation, [engine.md](../engine.md) for requirements and effects, [generation.md](../generation.md) for generated locations.

## Prerequisites

- A compiled setting pack for the adventure's rules system. Either use an existing one, or write one for the adventure's world with [setting-pack-authoring.md](setting-pack-authoring.md). This guide uses `spec/examples/derelict_station` (namespace `base`, system `quest`).
- Familiarity with the setting's entities. Adventures reuse them by reference, and add story-specific content in their own `entities/`; see [adventure-packs.md](../adventure-packs.md#materials-are-authored).

This guide writes YAML files. The same adventure can be built in the adventure editor ([app-flow.md](../app-flow.md#adventure-editor)), which exports and imports these files. Adventure validation follows the rules in [adventure-packs.md](../adventure-packs.md#compilation).

## How an adventure works

An adventure is a set of state machines driven by engine and rules-system events:

1. Players act. The engine resolves actions and emits events such as `moved`, `interacted`, `item_taken`, and `talked`.
2. After each action, the engine tests every trigger against the events.
3. A trigger whose event match and `when` requirement hold applies its effects: setting flags, changing arc stages, opening doors, spawning entities, or ending the instance.

Triggers never see player text. A trigger fires because something happened in the game, not because someone typed a phrase.

## 1. Create the manifest

Create `adventures/sunken_archive/adventure.yaml`:

```yaml
format_version: 2
kind: adventure
id: sunken_archive
version: 0.1.0
title: The Sunken Archive
system: { id: quest, versions: "^1.0" }
requires_settings:
  - { id: derelict_station, versions: "^3.0" }
players: [1, 4]
start:
  location: dock
  room: airlock
  effects: []
endings:
  escaped: { label: Escaped with the core }
  lost: { label: Lost in the dark }
```

`system` must match the system of every required setting. `requires_settings` uses semantic version ranges; `^3.0` accepts any 3.x version of the setting.

Declaring the ending `lost` makes it the automatic ending when no character remains active.

## 2. Declare flags

Create `adventures/sunken_archive/flags.yaml`:

```yaml
lift_powered: { type: bool, initial: false }
alarm_level:  { type: int, min: 0, max: 3, initial: 0 }
```

Every flag the adventure reads or writes must appear here.

## 3. Build the authored location

Create `adventures/sunken_archive/locations/dock.yaml`:

```yaml
id: dock
kind: authored
map:
  legend:
    "+": { terrain: floor, place: base:hatch }
    "o": { terrain: floor, place: base:crate_stack }
  rows:
    - "################"
    - "#....#.........#"
    - "#....+...o.....#"
    - "#....#.........#"
    - "#....#...o.....#"
    - "################"
  rooms:
    airlock: { label: airlock, tags: [entry], area: [[1, 1, 4, 4]] }
    hangar:  { label: hangar, tags: [large], area: [[5, 2, 1, 1], [6, 1, 9, 4]] }
  links:
    x_lift: { label: lift, at: [14, 2], to: { location: lower_archive, link: x_up } }
  contents:
    - { id: lift_door, ref: base:bulkhead, at: [14, 2], lock: { flag: lift_powered } }
    - { id: lift_panel, ref: base:control_panel, at: [13, 1] }
    - { ref: base:locker, at: [13, 4] }
    - { ref: base:keycard, room: hangar }
    - { npc: archivist, at: [7, 3] }
```

Points to note:

- Each row is one line of cells, north first. `#` is wall and `.` is floor; `+` and `o` come from the legend and place a hatch and two crate stacks. Cell `[x, y]` counts from the top-left corner, starting at 0.
- Every floor cell belongs to one room. The hatch's cell `[5, 2]` is part of the hangar.
- The lift is a link on the same cell as the lift door. Players reach it only after the door opens, and the lock keeps it shut until `lift_powered` is true.
- The control panel and the lift door have ids so triggers can refer to them. The locker and keycard do not need one; the keycard lands on a free cell of the hangar chosen by RNG.
- The archivist is placed with `npc`. NPCs MAY instead be placed in generated locations with an anchor; each NPC is placed once.
- The setting defines the control panel's `operate` verb with requirement `has_item: base:keycard` and no effects. The adventure gives the verb meaning with a trigger.

## 4. Build the generated location

Create `adventures/sunken_archive/locations/lower_archive.yaml`:

```yaml
id: lower_archive
kind: generated
generator:
  algorithm: bsp
  size: [40, 28]
  rooms: [8, 12]
  loop_ratio: 0.1
population:
  encounter_table: base:encounters_machine
  loot_table: base:locker_loot
  room_templates: [base:reactor_room]
  density: 0.4
anchors:
  - id: core_anchor
    place: { ref: sunken_archive:reactor_core }
    constraints: { min_depth: 4, prefer_role: dead_end }
links:
  x_up: { label: service lift, role: entry, to: { location: dock, link: x_lift } }
gates_per_location: 1
```

The `x_up` link puts the way back to the dock in the entry room. The generator lays out rooms on a 40 × 28 grid, adds doors and one lock-and-key pair, places the anchor, populates the rest from the setting's tables, and verifies that the anchor is reachable. See [generation.md](../generation.md#pipeline).

## 5. Add adventure-specific content

The reactor core does not exist in the setting pack. Create `adventures/sunken_archive/entities/items.yaml`:

```yaml
reactor_core:
  kind: item
  label: reactor core
  tags: [objective]
```

Adventure entities use the adventure id as their namespace: `sunken_archive:reactor_core`.

## 6. Add the NPC

Create `adventures/sunken_archive/npcs/archivist.yaml`:

```yaml
id: archivist
name: Archivist Oyelaran
template: base:civilian
disposition: wary
topics:
  core:
    label: the power core
    brief: The core sits in the deepest stacks. The lift panel needs a keycard.
    effects: []
  keycard:
    label: the keycard
    when: { stage: [find_the_core, searching] }
    brief: Someone dropped a keycard by the far wall of the hangar.
secrets:
  sabotage: She disabled the lift deliberately.
```

Topics populate the `talk` tool's `topic_id` enum. A topic with `when` is offered only while the requirement holds. `secrets` stay hidden from the narrator until a `reveal` effect releases them.

## 7. Write the arc

Create `adventures/sunken_archive/plot/find_the_core.yaml`:

```yaml
id: find_the_core
title: Find the Core
stages: [inactive, searching, core_found, done]
initial: inactive
triggers:
  - id: learn_of_core
    on: { type: talked, npc: archivist, topic: core }
    when: { stage: [find_the_core, inactive] }
    effects:
      - set_stage: { arc: find_the_core, stage: searching }
    narrate: The archivist points toward the lift.
    once: true

  - id: power_lift
    on: { type: interacted, target: lift_panel, verb: operate }
    effects:
      - set_flag: { flag: lift_powered, value: true }
      - open_door: { door: lift_door }
    narrate: The lift hums awake.
    once: true

  - id: take_core
    on: { type: item_taken, ref: sunken_archive:reactor_core }
    effects:
      - set_stage: { arc: find_the_core, stage: core_found }
      - add_flag: { flag: alarm_level, value: 1 }
      - spawn: { ref: base:security_frame, room: dock.hangar, at: [12, 3] }
      - reveal: { secret: archivist.sabotage }
    narrate: Alarms wail through the stacks.
    once: true

  - id: escape
    on: { type: moved, location: dock, to: airlock }
    when: { stage: [find_the_core, core_found] }
    effects:
      - set_stage: { arc: find_the_core, stage: done }
      - end_campaign: { ending: escaped }
```

The engine has already checked the panel's `has_item: base:keycard` requirement before `interacted` is emitted, so `power_lift` needs no `when`. `take_core` fires while the party is in `lower_archive`, so its `spawn` names the hangar as `dock.hangar`.

## 8. Validate

The adventure compiler rejects the adventure if any check in [adventure-packs.md](../adventure-packs.md#compilation) fails. Errors use the `FILE: PATH: MESSAGE` format. Typical errors and their causes:

| Error | Cause |
|---|---|
| `plot/find_the_core.yaml: triggers[2].on.ref: unknown ref 'sunken_archive:reactor_cor'` | Misspelled reference. |
| `plot/find_the_core.yaml: triggers[1].effects[0].set_flag.flag: undeclared flag 'lift_power'` | Flag missing from `flags.yaml` or misspelled. |
| `locations/dock.yaml: map.contents[0].lock: no effect sets flag 'lift_powered'` | No trigger can unlock the door. |
| `locations/dock.yaml: map.rooms.hangar.area: cell [5, 2] belongs to no room` | A floor cell is missing from every room's area. |
| `locations/dock.yaml: map.contents[4].at: cell [9, 2] is already occupied by map.rows[2]` | The archivist was placed on a crate stack. |
| `adventure.yaml: endings: no ending is reachable` | No trigger chain leads to `end_campaign`. |
| `locations/lower_archive.yaml: anchors[0]: min_depth 4 unreachable with at most 12 rooms` | Constraint stricter than the room count allows. |

## 9. Play-test

Create a campaign with the setting and the adventure, start an instance with one Quest character, and play to each ending. Check:

- [ ] Each trigger fires once where intended. The event log shows `trigger_fired` with the trigger id.
- [ ] Every topic `brief` reads well when narrated.
- [ ] No locked door or link traps players without a way forward, and every link has a link back.
- [ ] Generation succeeds across several seeds. Start several instances and confirm none fails generation.

## Patterns

| Goal | Pattern |
|---|---|
| Lever opens a door | Fixture with an id in an authored location; trigger on `interacted` with that target and verb; `open_door` effect. |
| Ambush when players approach | Trigger on `moved` with `location` and `to`; `when: { near: altar, within: 2 }`. |
| One trigger for every NPC that knows a clue | Give each NPC a topic with the same id; trigger on `{ type: talked, topic: clue }`, with no `npc` key. |
| One trigger for every readable fixture | Trigger on `{ type: interacted, verb: read }`, with no `target` key. |
| React to any death | Trigger on `{ type: died }`, with no other key; narrow it with `when`. |
| An NPC who travels | `move_entity` with a qualified room, such as `{ target: kassiani, room: roccavela.quay }`, in a trigger on `moved` with `via` the link out of the town. |
| A chest with a lock | A fixture whose verb has the lock as its requirement and `give_item` effects; a container has no lock. |
| A door the party may force | A door with `lock` and `system_stats`; the key opens it, harm breaks it. |
| A rule that applies in one place | Add `when: { location: harbour }`, or `location` in `on` for `moved`. |
| A journey between places | One location per place, joined by a pair of links; gate the link with a door lock or a flag. |
| Something in a generated room | Place it with an anchor that sets `id`; trigger on events naming that id or its ref. |
| Fetch quest | Adventure item placed by an anchor; trigger on `item_taken` with its ref. |
| Information gated by progress | Topic with `when: { stage: [...] }`. |
| Consequences that escalate | `add_flag` on an int flag; later requirements test `gte`. |
| Ambush | `spawn` hostile creatures and `start_combat` in a trigger effect. |
| Hidden twist | `secrets` entry released by `reveal` at the dramatic moment. |
| Multiple endings | Separate triggers with different `when` requirements calling `end_campaign` with different endings. |
