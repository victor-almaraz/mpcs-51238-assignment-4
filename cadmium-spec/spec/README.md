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
  lantern_coast/           Cadmium setting with the armor and stash modules, coastal city-states
  sunken_archive/          Cadmium adventure on lantern_coast, the exemplar adventure
```

The packs in `examples/` demonstrate the formats and are validated against them. They are neither a catalogue of available content nor a limit on what packs contain. `sunken_archive` and `lantern_coast` form the exemplar: a complete adventure and its setting that exercise the adventure format, the setting format, and the Cadmium modules together. The [adventure authoring guide](../docs/guides/adventure-authoring.md) builds a subset of it.

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

Files in `abilities/`, `entities/`, and `rooms/` are merged per directory. A key defined in two files is an error.

A file MAY be written as JSON: a path ending in `.json` stands for the path of the same name ending in `.yaml`, so `manifest.json` takes the place of `manifest.yaml` and `entities/crew.json` the place of `entities/crew.yaml`. A file and its JSON counterpart together are an error. Files and directories whose name begins with `.`, such as `.DS_Store`, are ignored. Any other file in the pack directory is an error.

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

In `plot/`, `locations/`, and `npcs/`, each file's `id` is unique within its directory. JSON files and ignored names follow the rules of the [pack directory](#pack-directory). Any other file is an error.

The adventure editor's draft document (`draft.schema.json`) holds the same records keyed by id:

| Draft key | Files |
|---|---|
| `adventure` | `adventure.yaml` |
| `flags` | `flags.yaml`, written when it declares a flag |
| `arcs` | `plot/<id>.yaml`, one file per arc |
| `locations` | `locations/<id>.yaml`, one file per location |
| `npcs` | `npcs/<id>.yaml`, one file per NPC |
| `entities` | `entities/entities.yaml`, written when it defines an entity |

Reading a directory into a draft merges every file of `entities/` into `entities`; writing a draft to a directory puts every entity in `entities/entities.yaml`. `editor` holds editor state and maps onto no file. A draft compiles as the files it writes.

## Compiler interface

The Content Compiler is a library first; the adventure editor, publishing, and the command line call the same code. The command line has two subcommands:

```
materials check [--json] [--setting PATH]... [--] DIR
materials build [--json] [-o FILE] [--setting PATH]... [--] DIR
materials --help | --version
```

| Subcommand | Job |
|---|---|
| `check` | Validate the pack in `DIR`. Writes nothing on success. |
| `build` | Validate, then write the bundle as JSON to stdout, or atomically to `FILE` with `-o`. |

`DIR` holds a setting pack when it contains `manifest.yaml` and an adventure pack when it contains `adventure.yaml`.

| Option | Meaning |
|---|---|
| `--json` | Write diagnostics as JSON objects. |
| `-o FILE` | `build` only: write the bundle to `FILE`. |
| `--setting PATH` | A setting that the adventure in `DIR` requires: a setting bundle as `materials build` writes it, or a setting pack directory, which is compiled first. Repeated once per required setting. A setting directory's diagnostics are written with `PATH/` before their `FILE`. |

| Exit status | Meaning |
|---|---|
| 0 | Valid. |
| 1 | Invalid, or a setting directory given with `--setting` is invalid. Diagnostics are on stderr; no bundle is written. |
| 2 | Usage error: unknown flag, missing or unreadable `DIR`, unreadable `--setting` path, or a `--setting` file that is not a setting bundle. |

Diagnostics go to stderr, one per line, as `FILE: PATH: MESSAGE`. With `--json`, each diagnostic is a JSON object on its own line: `{ "file", "path", "message", "check" }`. The same objects are what the library returns, and what `validate_draft` returns as `diagnostics[]`. stdout carries only the bundle.

| Field | Meaning |
|---|---|
| `file` | The file's path relative to the pack directory, as written, such as `entities/creatures.yaml`. A diagnostic about an editor draft that fails `draft.schema.json` has file `draft`. |
| `path` | The location in the file's data. Object keys are joined with `.`, and list indexes are written `[n]`. A key that is not an identifier (letters, digits, and `_`, not starting with a digit) is written as a JSON string in brackets, as in `legend["~"]`. A diagnostic about the whole file has path `.`. |
| `message` | The cause, in English. |
| `check` | The id of the failed check, from [Checks](#checks). |

Errors name the most specific cause. A wrong key in an effect or requirement reports the unknown key and the expected keys, not every alternative of the schema. Errors from a rules system's schemas name the system and kind:

```
entities/creatures.yaml: skeleton.system_stats.template: quest creature: 'goon' is not one of ['commoner', 'minion', 'boss']
rooms/tomb.yaml: founders_tomb.contents[1].at: cell [9, 0] is outside the 7x4 map
```

## Checks

Each check has an id, which a diagnostic carries in `check`. A setting pack is compiled with these checks; an adventure pack with the checks it shares with setting packs and those of [Adventure checks](#adventure-checks).

| Id | Check |
|---|---|
| `file` | Every file is UTF-8 text, parses as JSON-compatible YAML, and belongs to the [pack directory](#pack-directory) or [adventure directory](#adventure-directory) layout. |
| `duplicate_key` | No key is defined in two files of a merged directory, and no `id` in two files of `plot/`, `locations/`, or `npcs/`. |
| `schema` | Every file matches its schema: types, ranges, patterns, and required fields; unknown keys; `at` and `count` not combined in one placement. Effects are limited to the setting effect set; plot effects (`set_flag`, `add_flag`, `set_stage`, `end_campaign`, and `reveal` of secrets) are available only to adventures. |
| `system` | The system id exists, its installed version satisfies `system.versions`, and `system.modules` lists only modules of that system. |
| `system_stats` | Every creature's, item's, and ability's `system_stats`, every obstacle's and door's `system_stats` against the `structure` schema, and every `check` specification match the system's schemas. Validation uses the system configured with `system.modules`, so module fields fail unless their module is declared. |
| `ref` | Every ref resolves, in the pack's own namespace or a namespace it requires, to content of the kind in [Ref kinds](#ref-kinds). |
| `declared` | Every damage type, terrain type, and condition used is declared. `incapacitated` and `hidden` are built in, as are the terrain types `void`, `floor`, and `wall`. |
| `generation` | `generation.door` and every key of `generation.locks` are door templates; every value of `generation.locks` is an item. |
| `remains` | `remains` appears only on templates with `system_stats`. |
| `depth` | Depth ranges in tables and room templates are ordered. |
| `light` | Every `light` has a `dim` radius at least its `bright` radius. |
| `currency` | `currency` has a denomination of value 1, and every denomination value is a positive integer. |
| `map` | In every map, rows have equal length, at most 64, and there are at most 64 rows; every character is built in (` `, `.`, `#`) or defined in the map's `legend`. |
| `placement` | Every placement with `at`, and every entity placed through the legend, lies inside the map with its whole footprint on cells that are not `void` and whose terrain does not obstruct movement. No cell holds two creatures or two doors, and no cell holds a movement-obstructing entity together with any other placed entity. Room template contents use none of `npc`, `id`, or `room`. |
| `art` | Every art ref resolves to an asset of `assets.yaml`, no `art` list repeats a kind, and every asset file exists, has an allowed type, fits the size limits, and has `alt` and any required `credit`; see [setting-packs.md](../docs/setting-packs.md#art). |

### Ref kinds

A ref names content of one kind. A ref of the wrong kind fails `ref`, except where the table names another check.

| Ref | Resolves to |
|---|---|
| `has_item`; `ref` of `give_item`, `remove_item`, and `drop_item`; each ref of a container's `contents` list | An item template |
| `generation.door`; each key of `generation.locks` | A door template (check `generation`) |
| Each value of `generation.locks` | An item template (check `generation`) |
| `ref` of a placement that sets `lock`, in a room template or an authored location | A door template |
| An NPC's `template` | A creature template (check `npc`) |
| `ref` of `spawn`; `remains`; a legend entry's `place`; `ref` of a placement or anchor `place`; a table entry's `ref`; `ref` in a trigger's `on` | An entity template of any kind |
| `starting_items.table`; a creature's `loot.table`; a container's `contents.table`; a generated location's `population.loot_table` | A table whose every entry is an item template |
| A generated location's `population.encounter_table` | A table |
| A generated location's `population.room_templates` | A room template |
| A flag's `currency` | A setting's currency (check `flag`) |
| Each ref of an `art` list | An asset (check `art`) |

No ref names the table `room_labels`, which holds labels rather than templates.

### Adventure checks

The compilation checks of [adventure-packs.md](../docs/adventure-packs.md#compilation) carry these ids:

| Id | Compilation checks |
|---|---|
| `settings` | Check 3, and the part of check 15 about a required setting that needs a module the adventure does not declare. |
| `flag` | An undeclared flag (check 2); checks 14 and 17; a literal value or `initial` outside the flag's type or range; a comparison the flag's type cannot satisfy. |
| `plot` | An unknown arc, stage, ending, NPC, topic, secret, or entity id, a door id that names an entity other than a door, an unknown location outside a link's `to`, and an unknown link in a trigger's `on` (check 2); a `spawn` id already in use; a placement with `id` whose `count` is not 1. |
| `rooms` | Room areas outside the map, overlapping areas, and passable cells in no room (check 5). |
| `link` | Check 6, including an unknown location in a link's `to`. |
| `ending` | Check 7. |
| `lock` | Check 8. |
| `anchors` | Checks 9 and 13, and a `generator.rooms` range whose minimum exceeds its maximum. |
| `start` | Check 10. |
| `room` | Check 11, including an unknown room (check 2). |
| `npc` | Check 12, and an NPC `template` that is not a creature template. |

Checks 1, 4, and 16, the remaining parts of checks 2, 5, and 15, and the checks of entity templates use the ids of the table above.

## Bundle

A bundle is the compiled form of a pack, one JSON object. A setting bundle:

```json
{
  "kind": "setting",
  "format_version": 2,
  "id": "derelict_station",
  "version": "3.0.0",
  "namespace": "base",
  "manifest": { "system": { "id": "quest", "versions": "^1.0", "modules": [], "resolved": "1.1.0" } },
  "conditions": {}, "abilities": {}, "entities": {}, "rooms": {}, "tables": {}, "parser": {}, "assets": {}
}
```

| Setting bundle field | Contents |
|---|---|
| `kind`, `format_version`, `id`, `version`, `namespace` | From `manifest.yaml`. |
| `manifest` | Every other field of `manifest.yaml`. `terrain` holds the built-in terrain types and every declared terrain type, each with `obstructs`, `cost`, and `tags` defaulted. `system` holds `id`, `versions`, `modules` (default `[]`), and `resolved`, the system version the pack was validated against. |
| `conditions` | `conditions.yaml`, with the built-in conditions `incapacitated` and `hidden`. |
| `abilities`, `entities`, `rooms` | The merged files of `abilities/`, `entities/`, and `rooms/`, by key. |
| `tables`, `parser`, `assets` | `tables.yaml`, `parser.yaml`, and `assets.yaml`. |

| Adventure bundle field | Contents |
|---|---|
| `kind`, `format_version`, `id`, `version` | From `adventure.yaml`. |
| `namespace` | The adventure id. |
| `manifest` | Every other field of `adventure.yaml`. `system` is as for a setting bundle. Each entry of `requires_settings` adds `resolved`, the version of the setting the adventure was compiled against. `start.effects` defaults to `[]`. |
| `flags` | `flags.yaml`, each flag with `scope` defaulted. |
| `arcs` | The files of `plot/`, as a list in file order, lexicographic by path; each trigger has `once` defaulted. |
| `locations`, `npcs` | The files of `locations/` and `npcs/`, by id. |
| `entities` | The merged files of `entities/`, by key. |
| `assets` | `assets.yaml`. |

A field whose file is absent holds `{}`. Compilation qualifies every ref as `namespace:key` and writes every engine default into each entity template: `footprint`, `obstructs`, `cover`, `open`, and `uses: null`. A bundle holds only the fields above, the fields of the pack schemas within them, and the defaults written by compilation; a loader rejects any other field.

### Asset files

Compilation adds two fields to each asset whose `source` is a `file`: `hash`, the lowercase hexadecimal SHA-256 of the file's bytes, and `mime`, one of `image/svg+xml`, `image/png`, and `image/webp`. An asset with a `game_icons` source carries neither; clients that hold no copy of the icon draw its fallback.

`materials build` writes the bundle with one more top-level field when it has file assets: `files`, an object that maps each `hash` to `{ mime, data, width, height }`. `data` is the file's bytes in base64; `width` and `height` are the pixel size of a PNG or WebP image and are absent for SVG. `files` carries the bytes to publishing and is not part of the bundle: `publish_bundle` accepts the bundle with `files`, checks each file against its asset's `hash` and `mime`, stores each file once by hash, and stores the bundle without `files`. A file whose hash is already stored MAY be left out of `files`. `--setting` accepts a bundle with or without `files`.

## License

Schemas and examples: CC0 1.0. See [LICENSES.md](../LICENSES.md).
