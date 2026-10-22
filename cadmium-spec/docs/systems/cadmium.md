# Cadmium

| | |
|---|---|
| System id | `cadmium` |
| Version | 1.0.0 |
| Modules | `armor`, `stash` |
| Data and schemas | `systems/cadmium/` |
| Implementation | `lib/systems/cadmium` in the web application, composing `lib/systems/quest` |
| Source | Derived from Quest by The Adventure Guild — https://www.adventure.game/rules/ |
| License | Quest-derived values in `data.json`: CC BY 4.0, attributed in `systems/cadmium/NOTICE`. Module data (`modules.json`) and schemas: CC0 1.0. |

## Summary

Cadmium is the default system of the specification. It is Quest with optional modules that a campaign enables, for house rules and for mechanics Quest lacks. The name Quest identifies compatibility only; Cadmium is not endorsed by The Adventure Guild, LLC.

## Relation to Quest

| Rule | Statement |
|---|---|
| Identity | With no module enabled, every contract function returns results identical to Quest's for identical arguments and `Rng` state. Everything in [quest.md](quest.md) applies. |
| Superset | Every valid Quest character, creature, item, ability, check, and structure is valid in Cadmium. Module fields are optional and have defaults. |
| Compatibility | A Cadmium campaign accepts characters and packs declared for `quest` or `cadmium`. See [README.md](README.md#compatibility). |
| Implementation | `lib/systems/cadmium` delegates every contract function to `lib/systems/quest`, and a module overrides or extends a function only while it is enabled. |
| Components | `CreationForm`, `SheetView`, and `StatsEditor` extend Quest's, adding module fields when the campaign enables their module. |
| Values to confirm | Cadmium inherits Quest's `confirm` list in `data.json`. Only a check against the rulebook removes an entry. |

Module values that playtesting and simulation set are listed in `tune` in `modules.json`.

## Module `armor`

Armor is a consumable pool of points that absorbs harm before hit points.

| Element | Rule |
|---|---|
| Sheet | `armor: { value, max }`. Default `{ value: 0, max: modules.armor.max }` (6). |
| Item `system_stats` | `armor`: points, 1–40. |
| Creature `system_stats` | `armor`: starting pool; `instantiate` sets `{ value: armor, max: armor }`. |
| Donning | `use_item` on an item with `armor` adds its points to the pool, up to `max`, and returns `consume: true`. Points beyond `max` are lost. With the pool full, `use_item` raises `requirement_unmet`. |
| Harm | `harm` reduces `armor.value` first and hit points by the remainder. Harm of a type in `bypass_types` (default none) skips the pool. With `absorbs_at_deaths_door` (default true), the pool also absorbs harm at death's door. |
| Rest | Rests do not restore armor. |
| Summary | `summary` reports the pool as the resource `armor`; each change emits `resource_changed`. |

## Module `stash`

The module raises carrying capacity with carried containers.

| Element | Rule |
|---|---|
| Item `system_stats` | `slots`: 2–24. The item occupies one slot and adds `slots`, a net gain of `slots − 1`. |
| Limit | `can_carry` holds while the inventory has at most `base_slots` (12) plus the `slots` of carried items with `slots`, and at most `max_containers` (2) such items. |
| Removal | The engine calls `can_carry` with the inventory after a `drop` or `give`, so dropping a carried container fails while the rest exceeds the reduced limit. |
| Character schema | `inventory` has no fixed maximum; `can_carry` enforces the limit. |

Shared storage, such as chests, is part of the engine for every system: containers with `capacity`. See [engine.md](../engine.md#containers).

## Movement, reach, and vision

As Quest; see [quest.md](quest.md#movement-reach-and-vision).

## Ordering

As Quest; see [quest.md](quest.md#ordering).
