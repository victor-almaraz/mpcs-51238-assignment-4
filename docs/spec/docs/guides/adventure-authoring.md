# Adventure Authoring

This guide builds the wreck of Perpetua, the final act of the exemplar adventure `sunken_archive`. The adventure binds the Cadmium rules system with the modules `armor` and `stash`, and requires the setting pack `lantern_coast`. The wreck has an authored deck, a generated hold, a small authored chamber, adventure entities, one NPC, and one plot arc with both endings besides `lost`.

The complete pack is in [`spec/examples/sunken_archive`](../../spec/examples/sunken_archive), and its setting in [`spec/examples/lantern_coast`](../../spec/examples/lantern_coast). Every YAML block in this guide is one of the exemplar's files or a labelled excerpt of one. The excerpts compile only together with the rest of the pack, which adds the coast towns, the crossing, and the leads that bring the party to the wreck.

Reference: [adventure-packs.md](../adventure-packs.md) for file formats and trigger evaluation, [engine.md](../engine.md) for requirements and effects, [generation.md](../generation.md) for generated locations, [cadmium.md](../systems/cadmium.md) for the modules.

## Prerequisites

- A compiled setting pack for the adventure's rules system. Either use an existing one, or write one for the adventure's world with [setting-pack-authoring.md](setting-pack-authoring.md). This guide uses `spec/examples/lantern_coast` (namespace `coast`, system `cadmium` with `armor` and `stash`).
- Familiarity with the setting's entities. Adventures reuse them by reference, and add story-specific content in their own `entities/`; see [adventure-packs.md](../adventure-packs.md#materials-are-authored).

This guide writes YAML files. The same adventure can be built in the adventure editor ([app-flow.md](../app-flow.md#adventure-editor)), which exports and imports these files. Adventure validation follows the rules in [adventure-packs.md](../adventure-packs.md#compilation).

## How an adventure works

An adventure is a set of state machines driven by engine and rules-system events:

1. Players act. The engine resolves actions and emits events such as `moved`, `interacted`, `item_taken`, and `talked`.
2. After each action, the engine tests every trigger against the events.
3. A trigger whose event match and `when` requirement hold applies its effects: setting flags, changing arc stages, opening doors, spawning entities, or ending the instance.

Triggers never see player text. A trigger fires because something happened in the game, not because someone typed a phrase.

## 1. Create the manifest

The exemplar's `spec/examples/sunken_archive/adventure.yaml`:

```yaml
format_version: 2
kind: adventure
id: sunken_archive
version: 1.0.0
title: The Sunken Archive
description: >-
  Perpetua, the Ironmasters' fortress-ship, sank among the Tessera Isles carrying the Royal
  Reliquary's pledged collection. Crews race for it. Gather a chart fragment in a coast town,
  cross the fog with a lit lamp, board the half-drowned wreck, and choose between leaving with an
  artifact and sealing the archive with its keeper. For one to four characters.
system: { id: cadmium, versions: "^1.0", modules: [armor, stash] }
requires_settings:
  - { id: lantern_coast, versions: "^1.0" }
players: [1, 4]
start:
  location: orvelle
  room: plaza
  effects: []
endings:
  escaped: { label: Escaped with an artifact }
  archive_sealed: { label: Sealed the archive }
  lost: { label: Lost to the tide }
```

`system` must match the system of every required setting, including its modules: `lantern_coast` declares `armor` and `stash`, so the adventure declares both. `requires_settings` uses semantic version ranges; `^1.0` accepts any 1.x version of the setting.

The instance starts in the plaza of Orvelle, a town of the complete pack. Declaring the ending `lost` makes it the automatic ending when no character remains active. The endings `escaped` and `archive_sealed` are reached through triggers in step 7.

## 2. Declare flags

Excerpt of `spec/examples/sunken_archive/flags.yaml`:

```yaml
path:             { type: enum, values: [none, contract, rumor], initial: none }
clues:            { type: int, min: 0, max: 5, initial: 0 }
deck_open:        { type: bool, initial: false }
ward_sealed:      { type: bool, initial: false }
ring_taken:       { type: bool, initial: false }
keeper_fed:       { type: bool, initial: false }
hints:            { type: int, min: 0, max: 8, initial: 0 }
purse:            { type: int, min: 0, max: 400, initial: 12, scope: character, currency: coast:floret }
```

Every flag the adventure reads or writes must appear here. The excerpt shows the three flag types: `path` is an `enum`, `clues` and `hints` are bounded `int` flags, and the rest are `bool`. `purse` is character-scoped and holds an amount of the setting's currency, `coast:floret`, in its smallest unit, the quarter floret. Triggers and topics add to it with `add_flag`, and shop topics test it with `gte`.

## 3. Build the authored location

The exemplar's `spec/examples/sunken_archive/locations/perpetua_deck.yaml`:

```yaml
id: perpetua_deck
kind: authored
map:
  legend:
    "w": window
    "~": shallows
  rows:
    - "########################"
    - "#.......w......w.......#"
    - "#..............w.......#"
    - "#.......w..............#"
    - "#.......w......w.......#"
    - "#~~~~~~~#~~~~~~#~~~~~~~#"
    - "########################"
  rooms:
    mooring: { label: Perpetua's mooring, tags: [ship, wreck], light: dim, area: [[1, 1, 7, 5], [8, 2, 1, 1]] }
    chart_room: { label: chart room, tags: [ship, wreck], light: dim, area: [[9, 1, 6, 5], [15, 3, 1, 1]] }
    gallery: { label: long gallery, tags: [ship, wreck], light: dark, area: [[16, 1, 7, 5]] }
  links:
    x_stair: { label: down to the Drowned Stair, at: [1, 3], to: { location: drowned_stair, link: x_perpetua } }
    x_down: { label: the hatch to the holds, at: [22, 3], to: { location: perpetua_holds, link: x_up } }
  contents:
    - { id: chart_door, ref: coast:hatch, at: [8, 2] }
    - { id: gallery_door, ref: coast:hatch, at: [15, 3] }
    - { id: crates, ref: coast:crate_stack, at: [4, 2] }
    - { id: winch, ref: coast:winch, at: [12, 1] }
    - { id: holds_hatch, ref: coast:deck_hatch, at: [22, 3], lock: { flag: deck_open } }
```

Points to note:

- Each row is one line of cells, north first. `#` is wall and `.` is floor. `w` and `~` come from the legend and use the setting's terrain: `window` obstructs movement but not sight, and `shallows` is passable water. Cell `[x, y]` counts from the top-left corner, starting at 0.
- Every passable cell belongs to exactly one room, including door cells. The hatch at `[8, 2]` belongs to the mooring and the hatch at `[15, 3]` to the chart room.
- Room `light` sets the ambient illumination. Cadmium sets `lighting: false`, so darkness hides nothing, but `illumination` requirements and narration still read it.
- `crates` is a destructible obstacle: the setting's `crate_stack` has `system_stats` with hit points and leaves `broken_crates` as remains.
- `holds_hatch` is a door with a flag lock. The link `x_down` stands on its cell, so the way to the holds opens only with the door, and the lock keeps the door shut until `deck_open` is true.
- `x_stair` leads back to the Drowned Stair, a location of the complete pack. Each link names the link that points back.
- The winch has an id so a trigger can refer to it. The setting defines its `operate` verb with no effects; the adventure gives the verb meaning with a trigger in step 7.

## 4. Build the generated location

The exemplar's `spec/examples/sunken_archive/locations/perpetua_holds.yaml`:

```yaml
id: perpetua_holds
kind: generated
generator:
  algorithm: bsp
  size: [44, 30]
  rooms: [9, 12]
  min_room: 4
  loop_ratio: 0.1
population:
  encounter_table: coast:encounters_holds
  loot_table: coast:hold_loot
  room_templates: [coast:registry_vault]
  density: 0.4
  ambient: dark
  lit_rooms: 0.25
anchors:
  - { id: box_book, place: { ref: sealed_iron_box_book, id: box_book }, constraints: { min_depth: 1 } }
  - { id: box_folio, place: { ref: sealed_iron_box_folio, id: box_folio }, constraints: { min_depth: 1 } }
  - { id: box_glass, place: { ref: sealed_iron_box_glass, id: box_glass }, constraints: { min_depth: 1 } }
  - { id: box_stone, place: { ref: sealed_iron_box_stone, id: box_stone }, constraints: { min_depth: 1 } }
  - { id: keeper, place: { npc: vantane }, constraints: { prefer_role: boss }, shared: true }
links:
  x_up: { label: the ladder to the deck, role: entry, to: { location: perpetua_deck, link: x_down } }
  x_ward: { label: the iron door to the ward chamber, role: dead_end, to: { location: ward_chamber, link: x_in } }
gates_per_location: 1
```

The generator lays out 9 to 12 rooms on a 44 × 30 grid, places the links and anchors, populates the rest from the setting's tables, and verifies that every anchor is reachable. See [generation.md](../generation.md#pipeline).

- `room_templates` places the setting's `registry_vault`, a `boss` room with shelves.
- Each anchor places an adventure entity with an `id`, so triggers name the boxes. Each anchor takes a room of its own. The keeper anchor sets `shared: true` and prefers the `boss` role, so Vantane stands in the vault.
- `gates_per_location: 1` adds one lock-and-key pair from the setting's `generation.locks`: a `vault_door` and its `vault_key`. The vault door has both a lock and `system_stats`, so the key opens it and harm breaks it.
- `ambient: dark` with `lit_rooms: 0.25` leaves about a quarter of the rooms lit.
- Generated rooms receive ids `r1` to `rN`. Triggers reach them through aliases: `perpetua_holds.box_book` is the room where the anchor `box_book` was placed.

The iron door `x_ward` leads to a small authored location. The exemplar's `spec/examples/sunken_archive/locations/ward_chamber.yaml`:

```yaml
id: ward_chamber
kind: authored
map:
  rows:
    - "##########"
    - "#........#"
    - "#........#"
    - "#........#"
    - "##########"
  rooms:
    chamber: { label: ward chamber, tags: [ship, wreck, cold], light: dark, area: [[1, 1, 8, 3]] }
  links:
    x_in: { label: back to the holds, at: [1, 2], to: { location: perpetua_holds, link: x_ward } }
  contents:
    - { id: open_iron_box, ref: open_iron_box, at: [7, 2] }
    - { id: ward_drowned_1, ref: coast:drowned, at: [5, 1] }
    - { id: ward_drowned_2, ref: coast:drowned, at: [5, 3] }
    - { id: ward_drowned_3, ref: coast:drowned, at: [6, 2] }
```

The three drowned have ids, so a trigger can change their hostility.

## 5. Add adventure-specific content

The artifacts exist only in this story. The exemplar's `spec/examples/sunken_archive/entities/artifacts.yaml`:

```yaml
book_of_weeping:
  kind: item
  label: Book of Weeping
  tags: [artifact, magic, book]
three_martyrs_folio:
  kind: item
  label: Collected Writings of the Three Martyrs
  tags: [artifact, religious, folio]
divining_glass:
  kind: item
  label: Divining Glass
  tags: [artifact, magic]
navigation_stone:
  kind: item
  label: Navigation Stone
  tags: [artifact, magic]
antique_priest_ring:
  kind: item
  label: Antique Priest Ring
  tags: [cursed, forged]
```

Excerpt of `spec/examples/sunken_archive/entities/boxes.yaml`:

```yaml
sealed_iron_box_book:
  kind: fixture
  label: sealed iron box
  tags: [iron, sealed]
  obstructs: [movement]
  verbs:
    open:
      requirement: { all: [ { has_item: coast:prybar }, { has_item: coast:cold_chisel } ] }
      effects:
        - give_item: { target: actor, ref: book_of_weeping }
        - despawn: { target: target }
opened_box:
  kind: container
  label: opened iron box
  tags: [iron]
  capacity: 4
  contents: []
  verbs:
    seal:
      requirement: { all: [ { has_item: antique_priest_ring }, { has_item: coast:prybar }, { has_item: coast:cold_chisel } ] }
      effects:
        - remove_item: { target: actor, ref: antique_priest_ring }
open_iron_box:
  kind: container
  label: open iron box
  tags: [iron, cold]
  capacity: 4
  contents: [antique_priest_ring]
  verbs:
    read:
      effects: []
    seal:
      requirement: { all: [ { has_item: antique_priest_ring }, { has_item: coast:prybar }, { has_item: coast:cold_chisel } ] }
      effects:
        - remove_item: { target: actor, ref: antique_priest_ring }
```

Adventure entities use the adventure id as their namespace, and refs without a namespace resolve to it: `book_of_weeping` is `sunken_archive:book_of_weeping`. Each sealed box is a fixture whose `open` verb needs the setting's prybar and cold chisel, gives its artifact, and removes the box. Verbs apply setting effects only, so flags change in triggers on `interacted`. The opened and open boxes are containers with `capacity`.

## 6. Add the NPC

Excerpt of `spec/examples/sunken_archive/npcs/vantane.yaml`:

```yaml
id: vantane
name: Oriel Vantane
template: coast:commoner
disposition: wary
topics:
  rising:
    label: how Perpetua sank
    brief: >-
      She saw the dead rise from the sea, sailors with no eyes painted on their lids. They climbed the
      sides of the ship and tore at the hatches until the holds flooded, and she locked herself in the
      vault, which opens only from outside.
  ration:
    label: a ship's biscuit from your pack
    when: { has_item: coast:ration }
    brief: >-
      Vantane takes the biscuit in both hands and eats it slowly, crumb by crumb, as if it might be
      the last. When she looks up she has stopped counting the halls, and she talks to you the way
      she once talked to her crew.
    effects:
      - remove_item: { target: actor, ref: coast:ration }
      - set_flag: { flag: keeper_fed, value: true }
  ring:
    label: the ring in the open box
    when: { any: [ { flag: clues, gte: 2 }, { flag: keeper_fed } ] }
    brief: She calls the ring in the ward chamber a false seal, and asks what you have heard of it.
    effects:
      - set_flag: { flag: ward_known, value: true }
      - reveal: { secret: vantane.forgery }
  seal:
    label: sealing the archive
    when: { flag: ward_sealed }
    brief: >-
      With the false seal shut in iron, Vantane agrees to leave the vault. She asks you to close the
      iron doors behind you and flood the lower stacks, so the archive stays beneath the water.
secrets:
  forgery: >-
    The ring is a recent forgery. Its three faces follow the Reliquary's registry drawing of the head,
    not the Chapter's liturgical order, so whoever forged it had the registry open in front of them. It
    commands the dead who died unseen.
```

Topics populate the `talk` tool's `topic_id` enum. A topic with `when` is offered only while the requirement holds: `ration` while the actor carries a ration, `ring` after two clues or the ration, and `seal` after the ring is sealed. A topic's `effects` apply when it is discussed. `secrets` stay hidden from the narrator until a `reveal` effect releases them, as the `ring` topic does with `vantane.forgery`. Each `brief` and secret is at most 500 characters and carries what the narrator may say.

## 7. Write the arc

Excerpt of `spec/examples/sunken_archive/plot/the_archive.yaml`:

```yaml
id: the_archive
title: The Archive
stages: [outside, aboard, below, resolved]
initial: outside
triggers:
  - id: aboard
    on: { type: moved, location: perpetua_deck }
    effects:
      - set_stage: { arc: the_archive, stage: aboard }
    narrate: >-
      Perpetua leans in the shallows like a sleeper. Her iron decks are warm with sun above the water
      line and cold below it, and every hatch has been torn at from outside.
    once: true
  - id: gallery_ambush
    on: { type: moved, location: perpetua_deck, to: gallery }
    effects:
      - spawn: { ref: coast:drowned, room: gallery, at: [18, 1], id: deck_drowned_1 }
      - spawn: { ref: coast:drowned, room: gallery, at: [18, 4], id: deck_drowned_2 }
      - start_combat: {}
    narrate: >-
      Two drowned sailors stand up out of the shallows of the gallery floor. Their lids are bare, no
      eyes painted on them. They died unseen, and something below still commands them.
    once: true
  - id: winch
    on: { type: interacted, target: winch, verb: operate }
    effects:
      - set_flag: { flag: deck_open, value: true }
      - open_door: { door: holds_hatch }
    narrate: The winch groans and the iron hatch to the holds lifts on its chain, breathing out cold air.
    once: true
  - id: below
    on: { type: moved, location: perpetua_holds }
    effects:
      - set_stage: { arc: the_archive, stage: below }
    narrate: >-
      The holds are dark and half full of sea. Iron boxes stand in the flooded stacks like stones in
      a field, each stamped with the Ironmasters' mark.
    once: true
  - id: keeper_found
    on: { type: moved, location: perpetua_holds }
    when: { near: vantane, within: 3 }
    effects: []
    narrate: >-
      A thin woman in a custodian's coat looks out from among the registry shelves and makes the
      lantern gesture, a cupped hand at the brow, for the crew she lost.
    once: true
  - id: opened_book
    on: { type: interacted, target: box_book, verb: open }
    effects:
      - spawn: { ref: opened_box, room: perpetua_holds.box_book }
    once: true
  - id: ring_taken
    on: { type: item_taken, ref: antique_priest_ring }
    effects:
      - set_flag: { flag: ring_taken, value: true }
    narrate: The ring is colder than the water. Somewhere below, the drowned stop moving and turn toward you.
    once: true
  - id: ring_sealed
    on: { type: interacted, verb: seal }
    effects:
      - set_flag: { flag: ward_sealed, value: true }
      - set_hostile: { target: ward_drowned_1, hostile: false }
      - set_hostile: { target: ward_drowned_2, hostile: false }
      - set_hostile: { target: ward_drowned_3, hostile: false }
    narrate: >-
      You shut the false seal in iron and drive the chisel through the hasp. All through the ship the
      drowned lie down in the water, as if someone had finally painted their eyes.
    once: true
  - id: escaped_left_quiet
    on: { type: moved, location: perpetua_deck, to: mooring }
    when:
      all:
        - { any: [ { has_item: book_of_weeping }, { has_item: three_martyrs_folio }, { has_item: divining_glass }, { has_item: navigation_stone } ] }
        - { not: { flag: ring_taken } }
        - { flag: hints, lte: 4 }
    effects:
      - set_stage: { arc: the_archive, stage: resolved }
      - end_campaign: { ending: escaped }
    narrate: >-
      You sail with the artifact. Behind you the drowned still walk the holds of Perpetua, and the wreck stays dangerous for the next crew.
    once: true
  - id: archive_sealed_quiet
    on: { type: talked, npc: vantane, topic: seal }
    when: { flag: hints, lte: 4 }
    effects:
      - set_stage: { arc: the_archive, stage: resolved }
      - end_campaign: { ending: archive_sealed }
    narrate: >-
      Vantane walks out of the vault on your arm. Together you close the iron doors and open the sea-cocks, and the lower stacks fill with quiet water. The archive stays beneath the sea, and you leave with nothing but her account.
    once: true
```

- `aboard` and `below` match `moved` by `location` alone, so they fire on arrival in any room of the location.
- `gallery_ambush` is an ambush: it spawns two drowned with `at` and starts combat.
- `winch` sets the lock flag and opens the hatch. The engine has already checked any requirement of the verb before `interacted` is emitted.
- `keeper_found` tests `near` in its `when`, so it fires on the first move that brings the actor within 3 cells of Vantane.
- `opened_book` names the generated room through the alias `perpetua_holds.box_book`.
- `ring_sealed` omits `target` from its `on`, so it matches the `seal` verb on any box. `set_hostile` turns the ward's drowned peaceful.
- `escaped_left_quiet` and `archive_sealed_quiet` end the instance. The complete arc has eight ending triggers whose `when` requirements are mutually exclusive, so each ending has one narration for each state of the ring and the hints.

## 8. Validate

The adventure compiler rejects the adventure if any check in [adventure-packs.md](../adventure-packs.md#compilation) fails. Errors use the `FILE: PATH: MESSAGE` format. Typical errors in the exemplar's files and their causes:

| Error | Cause |
|---|---|
| `plot/the_archive.yaml: triggers[15].on.ref: unknown ref 'antique_priest_rng'` | Misspelled reference. |
| `plot/the_archive.yaml: triggers[8].on.target: unknown entity id 'box_bok'` | Misspelled placement id. |
| `plot/the_archive.yaml: triggers[8].effects[0].spawn.room: location 'perpetua_holds' has no room 'box_bok'` | A generated alias that names no anchor or link. |
| `plot/the_archive.yaml: triggers[5].effects[0].set_flag.flag: undeclared flag 'deck_opened'` | Flag missing from `flags.yaml` or misspelled. |
| `locations/perpetua_deck.yaml: map.contents[4].lock: no effect sets flag 'deck_open'` | No trigger can unlock the hatch. |
| `locations/perpetua_deck.yaml: map.rooms: cell [8, 2] belongs to no room` | The hatch cell is missing from every room's area. |
| `locations/perpetua_deck.yaml: map.contents[3].at: cell [4, 2] is already occupied by map.contents[2]` | The winch was placed on the crates. |
| `locations/perpetua_holds.yaml: anchors[0]: min_depth 12 unreachable with at most 12 rooms` | Constraint stricter than the room count allows. |
| `npcs/vantane.yaml: topics.ring.effects[1].reveal.secret: NPC 'vantane' has no secret 'forgry'` | Misspelled secret. |

## 9. Play-test

Create a campaign with the setting and the adventure, start an instance with one Cadmium character, and play to each ending. Check:

- [ ] Each trigger fires once where intended. The event log shows `trigger_fired` with the trigger id.
- [ ] Every topic `brief` reads well when narrated.
- [ ] No locked door or link traps players without a way forward, and every link has a link back.
- [ ] Generation succeeds across several seeds. Start several instances and confirm none fails generation.

## Patterns

| Goal | Pattern |
|---|---|
| Lever opens a door | Fixture with an id in an authored location; trigger on `interacted` with that target and verb; `open_door` effect, as `winch` does. |
| Ambush when players approach | Trigger on `moved` with `location` and `to`; `when: { near: altar, within: 2 }`. |
| One trigger for every NPC that knows a clue | Give each NPC a topic with the same id; trigger on `{ type: talked, topic: clue }`, with no `npc` key. |
| One trigger for every readable fixture | Trigger on `{ type: interacted, verb: read }`, with no `target` key. |
| React to any death | Trigger on `{ type: died }`, with no other key; narrow it with `when`. |
| An NPC who travels | `move_entity` with a qualified room, such as `{ target: kassiani, room: roccavela.quay }`, in a trigger on `moved` with `via` the link out of the town. |
| A chest with a lock | A container with `capacity` and `lock`, such as the exemplar's `guild_strongbox`, which opens for a holder of the charter writ. |
| A door the party may force | A door with `lock` and `system_stats`; the key opens it, harm breaks it. |
| A passage that needs a lit lamp | A door whose lock combines `has_item` and `illumination`, such as the exemplar's `fog_bank`. |
| A rule that applies in one place | Add `when: { location: harbour }`, or `location` in `on` for `moved`. |
| A journey between places | One location per place, joined by a pair of links; gate the link with a door lock or a flag. |
| Something in a generated room | Place it with an anchor that sets `id`; trigger on events naming that id or its ref. |
| Fetch quest | Adventure item placed by an anchor; trigger on `item_taken` with its ref. |
| Information gated by progress | Topic with `when: { stage: [...] }`. |
| Giving an item to an NPC | `give` reaches characters and containers only. Give the NPC a topic whose `when` is `has_item` and whose effects `remove_item` from the actor and set a flag, as Vantane's `ration` topic does. |
| Consequences that escalate | `add_flag` on an int flag; later requirements test `gte`. |
| Coin and shops | A character-scoped `int` flag with `currency`; income with `add_flag` and `target: room`; a shop topic with `when: { flag: purse, gte: 20 }` and effects that subtract the price and give the item. |
| Ambush | `spawn` hostile creatures and `start_combat` in a trigger effect. |
| Hidden twist | `secrets` entry released by `reveal` at the dramatic moment. |
| Multiple endings | Separate triggers with different `when` requirements calling `end_campaign` with different endings. A trigger that narrates an outcome before its ending is listed before the trigger that ends the campaign, because an ending stops trigger evaluation. |
