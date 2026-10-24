# The Sunken Archive

The exemplar adventure of `briefs/example-adventure.md`. Perpetua, the Ironmasters' fortress-ship,
sank among the Tessera Isles carrying the Royal Reliquary's pledged collection. The party leaves
Orvelle for a coast town, recovers a chart fragment, crosses the fog with a lit lamp, boards the
wreck, and either escapes with an artifact or seals the archive with its keeper. Evidence narrows
the culprit to someone with access to both the Reliquary and the Salvors' Concord; no one names them.

| Field | Value |
|---|---|
| Id, version | `sunken_archive` 1.0.0, `format_version: 2` |
| System | `cadmium ^1.0`, modules `armor`, `stash` |
| Requires | [`lantern_coast ^1.0`](../lantern_coast/README.md) |
| Players | 1 to 4 |
| Endings | `escaped`, `archive_sealed`, `lost` |
| Size | 13 locations (12 authored, 1 generated), 33 NPCs, 6 arcs, 76 triggers |

The packs follow the brief's layout. They live in this application as a proposal for the
specification's `spec/examples/`; see [SPEC_ISSUES.md](../../SPEC_ISSUES.md#exemplar-location).

```bash
pnpm materials check --setting materials/lantern_coast/pack materials/sunken_archive/pack
```

`pnpm bundles` builds both bundles for `/admin`. A campaign lists `lantern_coast` before any Quest
setting, so the holds take their doors and vault from it; see
[SPEC_ISSUES.md](../../SPEC_ISSUES.md#generation-order). The campaign also adds the Quest Quick Start
for abilities.

## Places

| Location | Kind | Rooms | Role |
|---|---|---|---|
| `orvelle` | authored | `plaza` (start), `guildhall`, `tavern`, `study`, `lane` | Leads, both entry paths, the troupe |
| `vessaro`, `salinara`, `roccavela` | authored | Quay, shops, houses; Salinara's fever marsh; Roccavela's cliff path | A clue, a chart fragment, and passage south in each |
| `labyrinth` | authored | `gate`, `maze`, `center` | Side quest above Roccavela |
| `boat_deck` | authored | `stern`, `bow` (dark) | The boat; four fog banks |
| `ondrel`, `kestrin`, `lamp_shoal` | authored | Two or three rooms each | Evidence, errands, the rent collectors |
| `drowned_stair` | authored | `landing`, `stair` | The great octopus and the mooring gate |
| `perpetua_deck` | authored | `mooring`, `chart_room`, `gallery` | Winch, hatch, ambush, endings |
| `perpetua_holds` | generated | `bsp`, 9 to 12 rooms, dark | Four sealed boxes, the keeper, the vault |
| `ward_chamber` | authored | `chamber` | The open box and the false seal |

### Maps

Sight follows `docs/engine.md`, Line of sight: a sight line that grazes a wall is blocked, so a door
set in a solid wall line is out of sight from most cells of a room beside it. House fronts are drawn
with the setting's `window` terrain and outdoor dividers with `low_wall`, which obstruct movement but
not sight. Every doorway holds a door entity, open by default in towns, so the parser can name it.
Doorway cells belong to the room behind the door, so characters start on plaza cells, not in a
doorway.

## Coverage

| Required coverage | Where |
|---|---|
| Link pairs travelled both ways, authored and generated | Every road and boat link; `perpetua_deck.x_down` and `perpetua_holds.x_up` |
| Authored location with legend, three rooms, destructible obstacle, flag-locked door | `perpetua_deck`: `crates` (`coast:crate_stack`, remains), `holds_hatch` locked by `deck_open` |
| Generated location with room template, anchors with ids, lock-and-key pair, dark ambient, `lit_rooms` | `perpetua_holds`: `coast:registry_vault`, `box_book`, `box_folio`, `box_glass`, `box_stone`, the keeper; `vault_door` and `vault_key` |
| Light source in the start location | `plaza_lamp` in Orvelle's plaza |
| Door lock combining `has_item` and `illumination` | `fog_bank` (four placements on `boat_deck`) |
| Door with `lock` and `system_stats` | `coast:vault_door`, hp 20 |
| Hidden entity revealed by `search` | The chart fragments in Vessaro, Salinara, and Roccavela; Roccavela's is also revealed by Orsolakis's `trade` |
| Topic gated by `when`, secret released by `reveal`, topic with effects | Vantane's `ring`, `plan`, `visitor`, `ration`; her three secrets; Hallek's `contract`, every shop topic |
| `bool`, `int`, `enum` flags read by requirements | `passage` (quay gates), `clues` and `keeper_fed` (keeper's topics), `path` (Hallek's `contract`, the codas) |
| Currency, character-scoped flag, income with `target: room`, purchase, affordability | `coast:floret`; `purse`; the contract advance and every errand reward; the shops' topics and their `gte` |
| Containers with `capacity`, one with a `lock` | `guild_strongbox` (opens for a writ holder), sea chests, `tool_chest`, `lamp_cabinet`, the iron boxes |
| `armor` and `stash` items | `leather_jerkin`, `round_shield`; `canvas_satchel`, `sailor_pack` |
| `set_hostile`; an NPC moved between locations | Kestrin's claim camp, Lamp Shoal's thugs, the calmed drowned; the troupe to `salinara.row`, Kassiani to `roccavela.quay` |
| Triggers on `interacted`, `item_taken`, `item_given`, `talked`, `moved` with `location`, `died` | `hint_ledger`, `fragment`, `case_delivered`, `lead_song`, `marsh_fever`, `octopus_gone` |
| `on` omitting a payload key | `clue` and `passage` (any NPC with the topic), `fragment` (any fragment), `ring_sealed` (any box), `gull_crew` (any quay) |
| `near` or `illumination` in `when` | `ward_cold`, `keeper_found` |
| Qualified rooms, including a generated alias, in effects | `opened_book` and the other box triggers spawn into `perpetua_holds.box_*`; `troupe_travels`, `kassiani_travels` |
| Ambush: `spawn` with `at`, then `start_combat` | `gallery_ambush`, `rivals_waiting` |
| Two endings besides `lost`, reachable through triggers | `escaped` (six variants), `archive_sealed` (two variants), each with a path coda |
| Narration in `narrate`, `brief`, and secrets, at most 500 characters | Every trigger narration, topic, and secret; checked by `lib/harness/exemplar.test.ts` |

## Validation

**Schema pass.** The Content Compiler validates every file against its schema, rejecting unknown
keys, and every `system_stats` against the Cadmium schema of its kind. Both packs compile with no
diagnostics.

**Semantic pass.** The compiler enforces the checks in `docs/adventure-packs.md`, Compilation, and
`spec/README.md`, Checks. Each check of the brief, and what holds it:

| # | Check | Holds by |
|---|---|---|
| 1 | Every ref resolves | Compiler checks 2, 14, 16 |
| 2 | Module fields belong to declared modules | Compiler check 15; both packs declare `armor` and `stash` |
| 3 | Map checks | Compiler check 5 and the setting map checks |
| 4 | Links have links back | Compiler check 6; each link's `to` names the link that points back |
| 5 | Start room has at least four free cells | Compiler check 10; the plaza has more than 100 |
| 6 | Lock flags are set by some effect | Compiler check 8: `passage` (captains' `passage`), `octopus_gone` (`octopus_gone`), `deck_open` (`winch`) |
| 7 | Every ending is reachable | Compiler check 7, and the golden runs below |
| 8 | Anchor depths fit; own rooms; no reserved ids | Compiler checks 9, 13; the keeper anchor alone sets `shared: true`, to share the vault template's room |
| 9 | Flag literals fit; a denomination of value 1 | Compiler check, `quarter` has value 1 |
| 10 | Room references resolve; actorless triggers use qualified rooms; each NPC placed once | Compiler checks 11, 12; `octopus_gone` (on `died`) uses no room |
| 11 | Art files | No art ships; clients draw the fallback |
| 12 | A walkthrough exists | Below |

## Walkthroughs

The golden scenarios in `lib/harness/scenarios.ts` play one character to each ending with seed 11;
their inputs and logs are in `lib/harness/golden/exemplar_*.jsonl`.

**`escaped`, contract path (101 inputs).**

1. Orvelle: take `plaza_lamp`. In the guildhall, talk to Hallek about `contract` (writ, prybar, cold chisel, a fiver: `lead_writ`) and `seal` (`hint_seal`). Read the ledger in the tavern (`hint_ledger`). Talk to Osk about the `tide` (`hint_tide`).
2. Take the road to Vessaro (`troupe_travels`, `arrive`). Talk to Ostrakis about the `clue` (`clue`). Search the net loft and take the fragment (`fragment`). Buy and don a leather jerkin from Gerasimos. Talk to Ostrakis about `passage` (`passage`).
3. Open the quay gate and board (`underway`). Open the fog bank to the Drowned Stair with the lit lamp (`stair`). Kill the great octopus (`octopus_gone`).
4. Board Perpetua (`aboard`). Operate the winch in the chart room (`winch`). Enter the gallery and defeat the two drowned (`gallery_ambush`). Go down the hatch (`below`).
5. Find `box_book` and open it with both tools (`opened_book`). Climb back and walk to the mooring holding the Book of Weeping (`coda_escaped_paid`, `escaped_left_quiet`).

**`archive_sealed`, rumor path (152 inputs).**

1. Orvelle: take `plaza_lamp`. Listen at the tavern's back booth (`entry_rumor`). Read the ledger (`hint_ledger`). Talk to Osk about the `tide` (`hint_tide`).
2. Take the road to Salinara (`troupe_travels`, `arrive`). Talk to Dassos about the `route` and the `clue` (`clue`). Cross the marsh by the stakes, defeat the adder, search, and take the fragment (`fragment`). On the quay, defeat the Gull crew (`gull_crew`). Talk to Sarantis about `passage` (`passage`).
3. Board (`underway`), take the prybar and cold chisel from the tool chest, part the fog (`stair`), and kill the octopus (`octopus_gone`).
4. Board Perpetua (`aboard`), operate the winch (`winch`), defeat the gallery ambush (`gallery_ambush`), and go below (`below`).
5. Find the iron door to the ward chamber (`ward_watch`, `ward_cold`). Read the open box (`hint_pry_marks`), take the ring (`ring_taken`), and seal it in the box (`ring_sealed`; the drowned lie down).
6. Take the vault key, open the vault door, and talk to Vantane (`keeper_found`) about `rising`, `ring`, `plan`, `visitor` (`hint_visitor`), and `seal` (`coda_sealed_rumor`, `archive_sealed_known`).

**`lost` (10 inputs).** Listen at the back booth (`entry_rumor`) and take the road to Vessaro without its lead (`behind_vessaro`). The Gull crew attacks on the quay (`gull_crew`) and the character falls.

## Departures from the draft

| Draft | Exemplar |
|---|---|
| Arrival in a town matches `moved` via `x_road` | `via` is the link entered in the location left (`docs/engine.md`, Events), so arrivals match the destination's `location` and the Orvelle link: `behind_vessaro` uses `location: vessaro, via: x_vessaro` |
| Island departures add to `leg` | The islands' return links are `x_deck`, distinct from the towns' `x_boat`, so `leg` matches only returns from an island |
| Hidden `wall_eel` in flooded rooms | Left to the holds' encounter table; a hidden hostile creature fights unseen |
| The ward's drowned attack | They keep watch until attacked. `interact` and `take` are not available in combat, so the ring could not be sealed during a fight. Sealing sets them non-hostile, as the narration says |
| Ending variants (14.1) | Implemented as eight triggers with exclusive `when`; the ring state uses the added flag `ring_taken` |
| Path codas (14.2) | Five narrate-only triggers keyed on `path`, on the same events as the endings and with their conditions. The engine tests no trigger after `end_campaign`, so they are listed before the endings and their narration comes first. On the contract path with an artifact the Concord pays (`coda_escaped_paid`) unless the ring was sealed in iron (`coda_escaped_refused`): the writ binds the party to hand over everything raised, and the sealed ring is the one thing raised and kept back. Sealing the archive on the contract path is refused payment (`coda_sealed_refused`); the rumor path is outlawed and free after either ending (`coda_escaped_rumor`, `coda_sealed_rumor`) |
| Giving a ration to the keeper | `give` hands items only to characters and containers, so Vantane's `ration` topic, available while the actor holds `coast:ration`, removes it and sets `keeper_fed`. The flag opens `ring` and `plan` without their `clues`; `visitor` keeps its gates. A ration is in the starting kit for some characters and in the holds' loot |
| Lore names (14.10) | Not implemented |
| Lamplighter's reward on both thugs' `died` | `died` has no actor, so `target: room` cannot apply; Phaidon's `thanks` topic, gated on both `defeated`, pays instead |
| Shop goods as narrative topics | Each good is its own topic with a price in its label and `brief` |

## Balance

Combat numbers are Quest's templates and the draft's values, before the simulation of the draft's
section 14.9. The golden runs give their one character 40 hit points: a 10-hit-point character alone
does not survive the octopus. A party of four Quest characters is the expected table.
