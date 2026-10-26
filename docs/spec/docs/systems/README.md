# Rules Systems

A rules system is a swappable module that decides everything a ruleset decides: what a character sheet contains, how characters are created, how rolls resolve, what harm does, when creatures die, how resting works, how far creatures move and reach, and who acts first. The engine calls the system through a fixed contract and owns everything else. See [engine.md](../engine.md#division-of-responsibility).

Each campaign binds one system, a version range, and a list of enabled modules; each instance pins one installed version and the module list at creation. Characters, setting packs, and adventure packs declare the system they are written for, and a campaign accepts only those that match under [Compatibility](#compatibility).

Each system's rule data and JSON Schemas are in `systems/<id>/` in this repository. Its code is a module in the web application's `lib/systems/<id>`, which implements the contract below.

## Implemented systems

| Id | Ruleset | Core roll | Health model | Combat order | Document |
|---|---|---|---|---|---|
| `quest` | Quest | Unmodified d20, five outcome tiers | 10 HP, death's door at 0 | Simultaneous; no initiative | [quest.md](quest.md) |
| `cadmium` | Quest with optional modules; the default system | As Quest | As Quest; module `armor` adds an armor pool | As Quest | [cadmium.md](cadmium.md) |

The engine, data model, API, and material formats treat the system as a parameter everywhere, so further systems are added without changing them; see [Adding a system](#adding-a-system).

## Compatibility

A campaign accepts characters, setting packs, and adventure packs whose system matches its own, with one extension: a `cadmium` campaign also accepts those declared for `quest`. A `quest` campaign accepts only `quest`. A pack's `system.modules` lists the modules it requires; a campaign accepts the pack only when it enables every one of them.

Version checks use the installed version of the system a declaration names:

| Declaration | Accepted when |
|---|---|
| A pack for the campaign's own system | The installed version of the system satisfies both the pack's range and the campaign's `system_versions`. |
| A pack for another accepted system, such as `quest` in a `cadmium` campaign | The installed version of the declared system satisfies the pack's range. The campaign's `system_versions` is not compared with it. |
| A character for the instance's own system | The character's `system_version` has the major version of the instance's pinned `system_version`. |
| A character for another accepted system | The character's `system_version` has the major version of the installed version of its own system. |

## Modules

A module is an optional part of a system that a campaign enables. A system lists its modules in `MODULES`. `configure(modules)` returns the system with those modules enabled, and the engine uses only the configured system for an instance. Module fields in schemas, module behaviour in functions, and module data apply only while the module is enabled. With no module enabled, a system with modules behaves as documented without them.

A *module field* is a schema property whose `description` begins with `Module <id>:`, such as `Module armor:`. The schemas of a configured system are the full schemas with the module fields of every disabled module removed. A configured schema keeps the full schema's `$id`, so a validator compiles each module configuration in a registry of its own.

## Contract

A system module exposes these names. Every function is pure: it does not mutate its arguments, draws randomness only from the `Rng` it receives, and returns new values.

### Constants

| Name | Type | Meaning |
|---|---|---|
| `ID` | string | System id, matching `^[a-z][a-z0-9_]*$`. |
| `VERSION` | string | Semantic version of the implementation. Materials and characters declare a compatible range. |
| `SCHEMAS` | object | JSON Schemas keyed by kind: `character`, `creature`, `item`, `ability`, `check`, `structure`. A system MAY add more, for example a schema for lookup tables it loads. |
| `ORDERING` | object | Ordering policy for `exploration` and `combat`. See [engine.md](../engine.md#ordering-policy). |
| `STANDARD_CHECKS` | object | Check specifications for engine-initiated checks. Contains at least `search`. |
| `MODULES` | list | Module ids the system offers, each documented in the system's document. Empty for systems without modules. |
| `SPATIAL` | object | `metric`: `chebyshev` or `manhattan`. `approach`: whether an action on an out-of-reach target first moves toward it. `lighting`: whether illumination limits what creatures perceive. See [engine.md](../engine.md#space). |

### Functions

| Function | Returns | Purpose |
|---|---|---|
| `configure(modules)` | system | The system with the listed modules enabled. Raises `RulesError` for an unknown module. `configure([])` is the system without modules. |
| `create_character(name, choices, rng)` | sheet | Build a new character sheet from player choices. Raises `RulesError` on invalid choices. |
| `instantiate(stats, rng)` | sheet | Build a runtime creature sheet from an entity's `system_stats`. |
| `instantiate_structure(stats)` | sheet | Build a structure sheet for a destructible obstacle or door from its `system_stats`. A structure whose sheet status leaves `active` is destroyed. |
| `speed(combatant)` | integer ≥ 1 | Cells the combatant moves in one combat turn. |
| `senses(combatant)` | `{ darkvision }` | Distance in cells within which the combatant perceives dark cells; 0 for none. Used only when `SPATIAL.lighting` is true. |
| `reach(combatant, weapon)` | `{ range, tag }` | Attack range in cells, or null for any visible target, and the situation tag `melee` or `ranged`. `weapon` is as for `attack`. |
| `summary(sheet)` | object | Display fields for views and model context: `health`, `status`, and optional `resources`. Labels only. |
| `check(actor, spec, situation, rng)` | Resolution | Resolve a check described by `spec`. |
| `attack(attacker, defender, weapon, situation, rng)` | Resolution | Resolve one attack. `weapon` is `{ "ref", "stats" }` or null. |
| `harm(target, amount, rng, type)` | Resolution | Apply harm of `amount` from an effect. `type` is the damage type, or null. |
| `heal(target, amount)` | Resolution | Apply healing of `amount`. |
| `rest(target, kind)` | Resolution | Apply a `short` or `long` rest. |
| `tick(target)` | Resolution | Apply end-of-round changes, such as bleeding. |
| `session_end(target)` | Resolution | Apply end-of-session changes, such as Quest's AP award. Called by the Coordinator for each character when a scheduled session occurrence ends. |
| `initiative(participants, rng)` | list of ids | Order for the `initiative` sort key. Must be a permutation of the participants' ids. |
| `pay_cost(sheet, cost)` | sheet | Deduct an ability cost. Raises `RulesError` with code `requirement_unmet` when unaffordable. |
| `can_carry(combatant, inventory)` | bool | Whether the character may hold `inventory`, the list of `{ ref, stats }` it would hold after a take, give, drop, or use. The engine calls it for every change to a character's inventory. |
| `use_item(combatant, item, rng)` | Resolution or null | Rules effect of using a held item, `{ ref, stats }`. Null means none. A resolution MAY set `consume: true` to remove the item. Raises `RulesError` with `requirement_unmet` to refuse the use. |

### Ability statistics

The engine reads two fields of an ability's `system_stats`. It passes `cost` to `pay_cost`. When `roll` is `true`, the ability is rolled: the engine calls `check` with the empty check specification `{}`, and applies the ability's effects only on a passing outcome; see [engine.md](../engine.md#action-resolution). A system with rolled abilities defines `roll` as a boolean in its `ability` schema. Every other field of `system_stats` belongs to the system.

### Types

**Combatant** — see [engine.md](../engine.md#combatants-and-sheets):

```json
{ "id": "c_17", "side": "characters", "kind": "character", "sheet": { }, "items": { } }
```

`kind` is `character`, `creature`, or `structure`. `harm` accepts structures; `attack` accepts a structure as defender.

**Situation** — see [engine.md](../engine.md#situation):

```json
{ "advantage": 0, "modifier": 0, "tags": ["melee"] }
```

**Resolution**:

| Field | Type | Meaning |
|---|---|---|
| `outcome` | tier or null | One of `critical_failure`, `failure`, `partial`, `success`, `critical_success`. Null when nothing was rolled. |
| `rolls` | list | `{ label, dice[], total }` per roll, for narration and audit. |
| `updates` | object | New sheets keyed by combatant id. The engine replaces each sheet. |
| `events` | list | Events appended to the log. See [engine.md](../engine.md#events). |
| `effects` | list | Engine effects to apply after updates. |
| `consume` | bool | Returned only by `use_item`: remove the used item. Default false. |
| `choice` | object or null | A pending choice: `{ actor, prompt, options[] }`. Each option carries its own `updates`, `events`, and `effects`. See [engine.md](../engine.md#pending-choices). |

Outcomes `partial`, `success`, and `critical_success` pass requirements.

**RulesError** carries an engine error code (`invalid_call` or `requirement_unmet`) and a detail string. The engine returns it to the caller unchanged.

### Determinism

A system MUST produce identical results for identical arguments and `Rng` state. It MUST NOT read the clock, the network, files other than its own data at load time, or global mutable state other than data installed before an instance starts.

## Data and confirmation

Each system keeps rule numbers in `systems/<id>/data.json`. Values whose source text was not available are listed in the file's `confirm` array. Before a campaign using that system is published:

1. Check every listed value against the rulebook.
2. Correct the value if needed.
3. Remove it from `confirm`.

## Conformance

A system implementation conforms when:

- Every name in the contract exists.
- Every schema in `SCHEMAS` is a valid JSON Schema draft 2020-12, and `STANDARD_CHECKS.search` and the empty specification `{}` validate against `SCHEMAS.check`.
- `create_character` output validates against `SCHEMAS.character` and is identical for identical arguments and seed.
- `instantiate` and `instantiate_structure` return sheets with status `active`.
- Repeated `harm` to a structure makes its status leave `active` without a `died` event.
- `attack`, `check`, `harm`, `heal`, `rest`, `tick`, and `session_end` return resolutions with exactly the fields `outcome`, `rolls`, `updates`, `events`, `effects`, and `choice`, and do not mutate their arguments.
- `initiative` returns a permutation of the participants' ids.
- `configure([])` behaves identically to the unconfigured system, and `configure` rejects an unknown module.
- `use_item` returns null for an item whose `stats` carry no field the configured system uses.
- `speed` returns an integer of at least 1, `reach` returns a range of null or at least 1, and `senses` returns a `darkvision` of at least 0.
- `SPATIAL.lighting` is a boolean.
- Every ordering policy uses only the documented resolution methods and sort keys.

## Adding a system

The extension points are fixed: one data directory, one module, one registry entry, one schema enum value, and one document. Nothing else in the engine, API, or data model names a system.

1. Create `systems/<id>/` with `data.json`, the six schema files (`character`, `creature`, `item`, `ability`, `check`, `structure`).
2. Implement every name in the contract in `lib/systems/<id>` and register the id.
3. Add the id to the `system_ref` enum in `spec/schema/defs.schema.json`.
4. Meet every item in [Conformance](#conformance), and write tests for the system's rules.
5. Add a `NOTICE` and the data license to the system folder, choosing the most permissive license the source allows, and list it in [LICENSES.md](../../LICENSES.md).
6. Write `docs/systems/<id>.md` following [quest.md](quest.md): source and license, sheet, creation, outcome tiers, checks, attacks, harm, resting, abilities, statistics, movement, reach, and vision, ordering, automation adaptations, values to confirm.
7. Give the system's `CreationForm`, `SheetView`, and `StatsEditor` components to the web application; see [app-flow.md](../app-flow.md#character-creation-and-editor).

### Candidate systems

Two systems were evaluated and deferred. Their findings are recorded for whoever adds them.

| System | Fit | Blocking gaps |
|---|---|---|
| OSRIC 3.0 (first-edition AD&D procedures) | d20 against attack-matrix and saving-throw tables; HP with unconsciousness at 0 and death at −10; d6 side initiative. All procedures fit the contract; tables fit a `tables` schema. | Every numeric table must be transcribed. OSRIC 3.0 text is AELF Open Gaming Content; numbers restated from SRD 5.1 (CC BY 4.0) avoid the AELF. OSRIC 2.x (OGL with the OSRIC Open License) excludes complete games. |
| Flexpiel (FlexD6) | Pool of d6, check dice succeed on 5+ and bonus dice on 6; three wound slots with minor and severe wounds; player-facing combat; armor and shields block wounds through pending choices. | The outcome and combat tables are not public outside the rulebook. Flexpiel states no license; the FlexD6 core mechanic is Creative Commons with attribution; Flex Edge is CC BY-SA 4.0. |
