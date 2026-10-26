# Adventure Packs

An adventure pack is a material pack that defines a specific story for one rules system: plot arcs, locations, NPCs, and adventure-specific content. It builds on one or more setting packs for the same system. Adventure files contain data only. Plot logic is expressed with the requirement and effect languages defined in [engine.md](engine.md).

A campaign uses exactly one adventure pack together with the setting packs it requires; each instance of the campaign plays the adventure from its start. See [data-model.md](data-model.md#campaign-material).

## Materials are authored

Setting packs and adventure packs are written by users. The packs in `spec/examples/` demonstrate the formats; they are not a catalogue, and nothing in the engine depends on their content. An adventure MAY require any compiled setting pack for its system, including one written for that adventure.

| Content | Belongs in |
|---|---|
| Creatures, items, terrain, doors, obstacles, room templates, tables, and conditions that several stories in one world can share | A setting pack |
| Content that exists for one story: a plot item, a named NPC's stat template, a unique door | The adventure's `entities/` |

An adventure has any number of files in `plot/`, `locations/`, `npcs/`, and `entities/`.

## Directory layout

```
sunken_archive/
  adventure.yaml
  flags.yaml
  plot/*.yaml
  locations/*.yaml
  npcs/*.yaml
  entities/*.yaml
```

`entities/` uses the entity format in [setting-packs.md](setting-packs.md#entitiesyaml), including `system_stats`. Its namespace is the adventure id.

Each file has a JSON Schema in `spec/schema/`; see [spec/README.md](../spec/README.md#adventure-directory). YAML is read as JSON-compatible data under YAML 1.2: only `true` and `false` are booleans, so the trigger key `on` is a string.

## adventure.yaml

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

| Key | Required | Meaning |
|---|---|---|
| `kind` | yes | `adventure`. |
| `system` | yes | Rules system id and compatible version range. Every required setting MUST bind the same system. |
| `requires_settings` | yes | Setting pack ids and semantic version ranges. At least one. |
| `players` | yes | Minimum and maximum characters per instance. |
| `start` | yes | Starting location, room, and effects applied when an instance starts. Characters are placed on the room's free cells in row-major order, in ascending character id. |
| `endings` | yes | Ending ids referenced by `end_campaign`. At least one. |
| `description` | no | Up to 2,000 characters, shown when choosing materials. |

The instance ends with ending `lost` when no character's status is `active`, if `lost` is declared. Otherwise the instance ends with no ending.

## flags.yaml

Every flag used in the adventure MUST be declared.

Excerpt of `spec/examples/sunken_archive/flags.yaml`:

```yaml
path:             { type: enum, values: [none, contract, rumor], initial: none }
clues:            { type: int, min: 0, max: 5, initial: 0 }
passage:          { type: bool, initial: false }
keeper_fed:       { type: bool, initial: false }
purse:            { type: int, min: 0, max: 400, initial: 12, scope: character, currency: coast:floret }
```

Effects that set a flag outside its type or range fail compilation when the value is a literal, and are clamped at runtime when computed.

| Key | Meaning |
|---|---|
| `type` | `bool`, `int`, or `enum`. |
| `initial` | Starting value. |
| `min`, `max` | Range of an `int` flag. |
| `values` | Values of an `enum` flag. |
| `scope` | `party` (default): one value for the instance. `character`: one value per character, set to `initial` when the character joins. |
| `currency` | On an `int` flag: a setting's currency. The value is an amount in the currency's smallest unit, and the client shows it as coins. |

Requirements read a character-scoped flag's value for the actor. `set_flag` and `add_flag` change the actor's value, or, with `target: room`, the value of every character in the actor's room; `target` on a party-scoped flag is a compilation error. Spending is `add_flag` with a negative value; affordability is `{ flag: purse, gte: 20 }`. No tool moves a flag value between characters, so coin cannot be given from one character to another. The client shows the acting character's currency flags in the character panel; models receive no flags, so a shop topic's `brief` states its price in words.

## plot/*.yaml

Each file defines one arc. An arc is a state machine with named stages and triggers.

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
  - id: opened_book
    on: { type: interacted, target: box_book, verb: open }
    effects:
      - spawn: { ref: opened_box, room: perpetua_holds.box_book }
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

### Triggers

| Key | Required | Meaning |
|---|---|---|
| `id` | yes | Unique within the adventure. |
| `on` | yes | Event match. `type` is an event type from [engine.md](engine.md#events). Every other key is optional and matches the payload field of the same name by equality; an omitted key matches any value, so `{ type: died }` matches every `died` event. `ref` is a content ref and is qualified like any other ref. `item`, `target`, `door`, and `entity`, and `to` on item events, are entity ids. `room`, `from`, and `to` on other events are room ids, in the location named by `location` when the match sets it. |
| `when` | no | Requirement evaluated against state after the matched event. Requirements about the actor (`has_item`, `location`, `room`, `near`, `illumination`) test the matched event's actor, and are false for events without one. |
| `effects` | yes | Effects applied when the trigger fires. |
| `narrate` | no | Text passed to the narrator as a fact to convey. |
| `once` | no | If true, the trigger fires at most once per instance. Default false. |

Triggers react only to engine and rules-system events. Triggers never read player input or model output.

#### Evaluation order

1. After an action resolves, the engine tests every trigger against each event produced, in event order.
2. Within one event, triggers are tested in arc file order (lexicographic by path), then in listed order.
3. Events produced by fired triggers are tested in a following pass.
4. Evaluation stops after 3 passes. Events produced by the third pass are committed but not tested.
5. Evaluation also stops when an effect ends the instance. The remaining effects of the firing trigger are not applied, and no further trigger is tested, on the same event or in a later pass. A trigger that narrates a path's outcome before its ending is therefore listed before the trigger that ends the campaign.

## locations/*.yaml

A location is one map: terrain, rooms, doors, links, and contents. Two kinds exist. Both compile to the same state structure. The map format is defined in [setting-packs.md](setting-packs.md#maps) and [engine.md](engine.md#space).

### Places and regions

A location is a single grid of at most 64 × 64 cells. A world of several places, such as towns, a ship, and the sea between them, is several locations joined by links. There is no overland map: a region is modelled as linked locations, and a journey is a link, optionally gated by a door, flag lock, or trigger.

### Room references

Room ids are unique within a location; different locations MAY reuse an id. A room reference is `room` or `location.room`:

| Reference written in | Unqualified `room` resolves in |
|---|---|
| `start.room` | `start.location` |
| A location's `contents` | That location |
| `start.effects` | `start.location` |
| A trigger's effects and `when` | The location of the matched event's actor; for a `moved` match that sets `location`, that location |
| Item, ability, and verb effects | The actor's location |
| An NPC topic's `when` and `effects` | The location of the character who discusses the topic |

Qualify the reference when the room is elsewhere, and in triggers on events without an actor.

Entity ids, including NPC and door ids, are unique across the instance, so `despawn`, `move_entity`, `set_light`, `open_door`, and requirements name an entity wherever it is. `spawn` and `move_entity` place into the location of their room reference, so `move_entity: { target: kassiani, room: roccavela.quay }` moves an NPC between locations. Link ids are unique within a location and are named in another location's links as `to: { location, link }`. The compiler rejects an unqualified room reference in a trigger whose event type has no actor.

A generated location's rooms receive ids `r1` to `rN` in BFS order from the entry; only `r1`, the entry, is the same for every seed. Room references reach generated rooms through aliases:

| Reference | Room |
|---|---|
| `location.r1` or `location.entry` | The entry room |
| `location.boss` | The room with role `boss` |
| `location.<anchor_id>` | The room where that anchor was placed |
| `location.<link_id>` | The room holding that generated link |

The generator returns these aliases with the location; see [generation.md](generation.md#output). Anchor and link ids of a generated location MUST NOT be `entry`, `boss`, or of the form `r` followed by digits. Triggers about anchored content can also use the anchored entity: `item_taken` with its ref, `defeated`, or `near`. Room-template contents have no ids, so triggers cannot name them.

`moved` events carry the room in `to` and the location in `location`. A trigger on arrival in a room matches both: `{ type: moved, location: perpetua_deck, to: mooring }`.

### Authored

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

| Key | Required | Meaning |
|---|---|---|
| `map.rows`, `map.legend` | rows required | The map. |
| `map.rooms` | yes | Rooms by id: `label`, `tags`, `light` (ambient: `bright`, `dim`, or `dark`; default `bright`), and `area`, a list of `[x, y, width, height]` rectangles. Every cell whose terrain is not `void` and does not obstruct movement belongs to exactly one room. |
| `map.links` | no | Links by id: `label`, `at`, and `to: { location, link }`. |
| `map.contents` | no | Placements, as in [setting-packs.md](setting-packs.md#maps). A door placement MAY set `lock`, which overrides the template's lock. |

Each `contents` entry places a template given by `ref`, or an NPC given by `npc`. An NPC's entity id is its NPC id. A `ref` entry MAY set `id`; triggers and effects refer to the entity by that id. Entries without `id` receive a generated id and cannot be referenced by triggers.

A link leads to the named link of another location; travel in both directions needs a link on each side. A link at a door's cell is passable only while the door is open: in the example, the link `x_down` to the holds is usable once the `winch` trigger applies `open_door: { door: holds_hatch }`.

### Generated

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

Generator keys are defined in [generation.md](generation.md). Each entry in `links` is placed by the generator in a room with the given `role`. An anchor's `place` MAY set `id`, so triggers and effects can refer to the placed entity. Each anchor occupies a room of its own, which holds no room template, unless the anchor sets `shared: true`. An NPC is placed once per instance: either in an authored location's `contents` or by one anchor.

## npcs/*.yaml

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

| Key | Meaning |
|---|---|
| `template` | Creature template supplying `system_stats`. The NPC overrides `label` with `name`. |
| `disposition` | `friendly`, `neutral`, `wary`, or `hostile`; passed to the narrator. `hostile` gives the NPC the `hostile` tag. |
| `art` | Art refs; a portrait for the NPC's token. See [setting-packs.md](setting-packs.md#art). |
| `topics` | Topics available to the `talk` tool. A topic is available when its `when` holds. |
| `brief` | Facts the narrator MAY state when the topic is discussed. |
| `effects` | Effects applied when the topic is discussed. |
| `secrets` | Facts withheld from the narrator until revealed with `reveal: { secret: vantane.forgery }`. |

## What the models receive

The parser and the narrator see only the fields below. Everything else in an adventure, including flags, stages, door locks, and trigger conditions, is visible to the engine alone. Context shapes are in [tools.md](tools.md#parser-context).

| Adventure field | Recipient | Limit |
|---|---|---|
| Trigger `narrate` | Narrator, in the commit where the trigger fires | 500 characters |
| Topic `label` | Parser, while the topic's `when` holds and the NPC is in reach for `talk` | 60 characters |
| Topic `brief` | Narrator, in each commit that discusses the topic | 500 characters |
| Secret, after `reveal` | Narrator, in the commit that reveals it | 500 characters |
| Entity `label`, NPC `name` | Parser, while visible; narrator, when named in an event | 60 characters |
| Room `label` | Parser and narrator, for the actor's room; parser, for destinations | 60 characters |
| Room and entity `tags` | Parser and narrator, as summary tags of the actor's room | Ids |
| NPC `disposition` | Narrator, with the NPC's `talked` events | One of four values |
| Flags and arc stages | Neither | |
| Character sheet text, such as Quest's `profile` | Neither | |

The narrator states only what events and facts give it. Guidance for narration therefore goes in `narrate`, topic `brief`, or secret text: a place's atmosphere in the `narrate` of a trigger on arriving there, a character's knowledge in a topic `brief`, a twist in a secret.

A setting pack's `narration` block carries style instructions only. Setting lore, such as history, politics, and religion, reaches the models only as `narrate` text, topic `brief` text, and revealed secrets, each at most 500 characters per fact. Parser synonyms and examples come only from setting packs' `parser.yaml`.

## Compilation

The Content Compiler accepts an adventure directory, or an adventure editor draft, and the bundles of its required setting packs. The web application's implementation is `lib/materials`; the editor and the server run the same code. It MUST reject the adventure on any of these:

1. A file fails its schema. Unknown keys are errors.
2. A reference does not resolve: flag, arc, stage, location, room, door, link, NPC, topic, secret, ending, or content ref.
3. `requires_settings` is not satisfied by the supplied setting packs, or a setting binds a different system.
4. An entity's `system_stats` or a `check` specification fails the system's schema.
5. A map fails the map checks in [setting-packs.md](setting-packs.md#validation), or a room's area covers a cell of another room, or a passable cell belongs to no room.
6. A link's `to` names a link that does not exist, or a link's cell is not in a room.
7. No ending is reachable. Reachability is tested by treating every trigger as able to fire once and every requirement as satisfiable, so an ending is reachable when an `end_campaign` effect names it: in `start.effects`, a trigger, an NPC topic, or an effect of the adventure's entities. The automatic ending `lost` is reached without an effect and does not satisfy this check.
8. A door lock references only flags that no effect can set.
9. An anchor constraint cannot be met by the generator's room count range, or a generated link names a role the generator cannot produce.
10. The start room of an authored start location has fewer free cells than the adventure's maximum player count, or `players` has a minimum greater than its maximum. A free cell is a cell of the room whose terrain is not `void` and does not obstruct movement, and that no creature, NPC, or movement-obstructing entity placed with `at` or through the legend covers. Placements whose cells are chosen by RNG, and generated start locations, are not checked; an instance whose start room has no free cell for a character fails to start with `requirement_unmet`.
11. A room reference does not resolve under [Room references](#room-references), or a trigger on an event type without an actor uses an unqualified room reference.
12. An NPC is placed more than once, across locations and anchors.
13. An anchor or generated link id is `entry`, `boss`, or `r` followed by digits.
14. A flag declares `currency` that does not resolve to a setting's currency, or declares `currency` without `type: int`.
15. The adventure's `system.modules` is not a subset of the modules of its system, a required setting needs a module the adventure does not declare, or a file uses a module field the declared modules do not enable.
16. An art ref does not resolve, or an `art` list holds two assets of the same kind.
17. A `set_flag` or `add_flag` sets `target` on a party-scoped flag.

Errors identify file, path, and cause:

```
plot/the_archive.yaml: triggers[15].on.ref: unknown ref 'antique_priest_rng'
```

The compiler exits with a non-zero status on any error and emits no bundle.
