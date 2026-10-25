# The Lantern Coast

A setting pack for Cadmium with the modules `armor` and `stash`: a coastal region of Renaissance
city-states, salt towns, and fog-bound isles, where the tides follow two moons and lanterns matter.
It supplies the world content of the exemplar adventure [`sunken_archive`](sunken_archive.md).

| Field | Value |
|---|---|
| Id, namespace | `lantern_coast`, `coast` |
| Version | 1.0.0, `format_version: 2` |
| System | `cadmium ^1.0`, modules `armor`, `stash` |
| Currency | `coast:floret`, stored in quarter florets: quarter (1), half (2), oner (4), fiver (20), tener (40) |
| Generation | Doors `hatch`; lock-and-key pair `vault_door` with `vault_key` |

## Contents

| File | Contents |
|---|---|
| `manifest.yaml` | Terrain `deep_water`, `shallows`, `kelp`, `whirlpool`, `salt_marsh`, `window`, and `low_wall`; currency; generation; narration style |
| `conditions.yaml` | `fevered` (salt marsh), `entangled` (kelp), `chilled` |
| `entities/people.yaml` | Townsfolk, pickpocket, guardsman, sailor, Gull Company privateer and captain, House Morcante's wharf-hands and bailiff |
| `entities/creatures.yaml` | Sea, shore, and ship creatures, among them the great octopus and the drowned |
| `entities/items.yaml` | Hand lamp, prybar, cold chisel, vault key, and small kit |
| `entities/goods.yaml` | Chandlers' and booksellers' goods: weapons, armor (`armor`), carried containers (`slots`), tonic, and decorative goods |
| `entities/structures.yaml` | Doors, chests with `capacity`, fixtures, and obstacles, one destructible with remains |
| `rooms/registry_vault.yaml` | The registry vault, a `boss` room template with shelves |
| `tables.yaml` | `room_labels`, the starting kit, hold encounters, hold loot, and pickpocket loot |
| `parser.yaml` | Synonyms and examples for prying, sealing, buying, and lighting |

House fronts use `window` and outdoor dividers use `low_wall`. Both obstruct movement but not
sight. A door in a solid wall line is out of sight from most cells of a plaza, because a sight line
that grazes the wall is blocked; see [Maps](sunken_archive.md#maps).

The pack has no abilities. A campaign adds the Quest Quick Start (`materials/quest_starter`) for
character abilities, which Cadmium accepts.

Check it with:

```bash
pnpm materials check cadmium-spec/spec/examples/lantern_coast
```
