# Material Specification

Machine-readable specification of setting packs, adventure packs, and maps. JSON Schema files define the formats. The Content Compiler validates a pack against them and against the bound rules system, and emits its bundle.

Rules systems are specified separately: data and schemas in `../systems/<id>/`, contract in [docs/systems/README.md](../docs/systems/README.md). The Content Compiler is implemented in the web application (`lib/materials`) and shared by setting packs, adventure packs, the adventure editor, and publishing; see [docs/app-flow.md](../docs/app-flow.md#adventure-editor). Adventure semantics and compilation checks are in [docs/adventure-packs.md](../docs/adventure-packs.md#compilation).

## Layout

```
schema/
  defs.schema.json         shared types: ids, refs, dice, cells, rectangles, footprints, light, requirements, setting and adventure effects, event types, verbs, system binding
  map.schema.json          map rows and legend, placements, rooms, links, authored locations
  manifest.schema.json     identity, system binding, terrain, generation templates, starting items, narration
  conditions.schema.json   conditions, with roll situations
  abilities.schema.json    abilities, with range and system_stats
  entities.schema.json     creature, item, container, fixture, obstacle, and door templates, with system_stats
  rooms.schema.json        prefabricated room templates with maps
  tables.schema.json       weighted tables, including the required room_labels
  assets.schema.json       art declarations: icons, portraits, tiles
  parser.schema.json       parser synonyms and examples
  adventure.schema.json    adventure manifest: identity, system, required settings, players, start, endings
  flags.schema.json        adventure flag declarations
  arc.schema.json          one plot arc: stages and triggers
  location.schema.json     one authored or generated location
  npc.schema.json          one NPC: template, topics, secrets
  draft.schema.json        the adventure editor's draft document
examples/
  derelict_station/        Quest setting, science fiction
  sunless_crypt/           Quest setting, fantasy
```

The packs in `examples/` demonstrate the formats and are validated against them. They are neither a catalogue of available content nor a limit on what packs contain.

All schemas share the base URI `https://schema.dungeon-crawler.invalid/v1/` and refer to each other by file name, so a validator loads the whole directory as one registry.

## Layers

| Layer | Defined by | Changes require |
|---|---|---|
| Engine primitives: effects, requirements, tools, sort keys, map geometry | `defs.schema.json`, `map.schema.json`, and the engine | Engine code and a `format_version` increment |
| Rules: sheets, statistics, checks, ordering | The bound rules system's schemas and code | A rules-system release |
| Setting content: entities, abilities, conditions, rooms, tables, parser hints | The files in this specification | Pack data only |

## Pack directory

| Path | Schema | Required |
|---|---|---|
| `manifest.yaml` | `manifest.schema.json` | yes |
| `conditions.yaml` | `conditions.schema.json` | no |
| `abilities/*.yaml` | `abilities.schema.json` | no |
| `entities/*.yaml` | `entities.schema.json` | yes |
| `rooms/*.yaml` | `rooms.schema.json` | no |
| `tables.yaml` | `tables.schema.json` | yes |
| `parser.yaml` | `parser.schema.json` | no |
| `assets.yaml` | `assets.schema.json` | no |
| `assets/*` | file types and limits in [setting-packs.md](../docs/setting-packs.md#art) | no |

Files in `abilities/`, `entities/`, and `rooms/` are merged per directory. A key defined in two files is an error. Any other file in the pack directory is an error.

YAML is read as JSON-compatible data. Only `true` and `false` are booleans; `yes`, `no`, `on`, and `off` are strings. Dates are strings.

## Adventure directory

| Path | Schema | Required |
|---|---|---|
| `adventure.yaml` | `adventure.schema.json` | yes |
| `flags.yaml` | `flags.schema.json` | no |
| `plot/*.yaml` | `arc.schema.json`, one arc per file | yes, at least one |
| `locations/*.yaml` | `location.schema.json`, one location per file | yes, at least one |
| `npcs/*.yaml` | `npc.schema.json`, one NPC per file | no |
| `entities/*.yaml` | `entities.schema.json`, merged per directory | no |
| `assets.yaml`, `assets/*` | as for setting packs | no |

In `plot/`, `locations/`, and `npcs/`, each file's `id` is unique within its directory. Any other file is an error. The adventure editor's draft document (`draft.schema.json`) holds the same records keyed by id and maps one-to-one onto these files.

## Compiler interface

The Content Compiler is a library first; the adventure editor, publishing, and the command line call the same code. The command line has two subcommands:

```
materials check [--json] [--] DIR
materials build [--json] [-o FILE] [--] DIR
materials --help | --version
```

| Subcommand | Job |
|---|---|
| `check` | Validate the pack in `DIR`. Writes nothing on success. |
| `build` | Validate, then write the bundle as JSON to stdout, or atomically to `FILE` with `-o`. |

| Exit status | Meaning |
|---|---|
| 0 | Valid. |
| 1 | Invalid. Diagnostics are on stderr; no bundle is written. |
| 2 | Usage error: unknown flag, missing or unreadable `DIR`. |

Diagnostics go to stderr, one per line, as `FILE: PATH: MESSAGE`. With `--json`, each diagnostic is a JSON object on its own line: `{ "file", "path", "message", "check" }`, where `check` names the failed check. The same objects are what the library returns, and what `validate_draft` returns as `diagnostics[]`. stdout carries only the bundle.

Errors name the most specific cause. A wrong key in an effect or requirement reports the unknown key and the expected keys, not every alternative of the schema. Errors from a rules system's schemas name the system and kind:

```
entities/creatures.yaml: skeleton.system_stats.template: quest creature: 'goon' is not one of ['commoner', 'minion', 'boss']
rooms/tomb.yaml: founders_tomb.contents[1].at: cell [9, 0] is outside the 7x4 map
```

## Checks

Schema checks, per file:

- Types, ranges, patterns, and required fields; unknown keys.
- Effects limited to the setting effect set. Plot effects (`set_flag`, `add_flag`, `set_stage`, `end_campaign`, and `reveal` of secrets) are available only to adventures.

Rules-system checks:

- The system id exists, its installed version satisfies `system.versions`, and `system.modules` lists only modules of that system. Validation uses the system configured with `system.modules`, so module fields fail unless their module is declared.
- Every creature's, item's, and ability's `system_stats`, every obstacle's and door's `system_stats` against the `structure` schema, and every `check` specification match the system's schemas.

Cross-reference checks:

- Every ref resolves to a template, table, or ability of the expected kind, in the pack's own namespace.
- Every damage type, terrain type, and condition used is declared. `incapacitated` and `hidden` are built in, as are the terrain types `void`, `floor`, and `wall`.
- `generation.door` and every key of `generation.locks` are door templates; every lock's value is an item.
- `remains` appears only on templates with `system_stats`.
- Depth ranges are ordered.
- Art: every ref resolves to an asset of `assets.yaml`, no `art` list repeats a kind, and every asset file exists, has an allowed type, fits the size limits, and has `alt` and any required `credit`.
- Currency: a denomination of value 1, positive integer values.

Map checks, for every room template:

- Rows have equal length, at most 64, and there are at most 64 rows.
- Every character is built in (` `, `.`, `#`) or defined in the map's `legend`, and every legend terrain is declared.
- Every placement with `at`, and every entity placed through the legend, lies inside the map with its whole footprint on cells that are not `void` and whose terrain does not obstruct movement.
- No cell holds two creatures or two doors, and no cell holds a movement-obstructing entity together with any other placed entity.
- `at` and `count` are not combined, and room template contents use none of `npc`, `id`, or `room`.

## Bundle

```json
{
  "kind": "setting",
  "format_version": 2,
  "id": "derelict_station",
  "version": "3.0.0",
  "namespace": "base",
  "manifest": { "system": { "id": "quest", "versions": "^1.0", "resolved": "1.1.0" } },
  "conditions": {}, "abilities": {}, "entities": {}, "rooms": {}, "tables": {}, "parser": {}
}
```

Compilation qualifies every ref as `namespace:key`, records the system version it validated against, writes every engine default into each entity (`footprint`, `obstructs`, `cover`, `open`, and `uses: null`), merges the built-in terrain into `manifest.terrain` with defaults, and adds the built-in conditions.

## License

Schemas and examples: CC0 1.0. See [LICENSES.md](../LICENSES.md).
