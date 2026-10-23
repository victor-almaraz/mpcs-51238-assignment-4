# Sprints

The work in `cadmium-spec/AGENTS.md` ("Phases") split into sprints that each fit one working session. Each sprint names the specification sections it implements, the modules it touches, and an exit criterion that is checked by tests before the sprint closes.

## Working agreement

- Start every sprint by reading `cadmium-spec/AGENTS.md` and the "Read" column of the sprint. The specification is the requirement.
- A sprint closes when `pnpm check` passes (generated files current, type checking, linting, tests, build) and its exit criterion holds. There is no CI service: Vercel deploys from GitHub and runs only the build, so `pnpm check` runs locally before every commit.
- Gaps or contradictions in the specification go to `SPEC_ISSUES.md` with a matching `SPEC_ISSUES.md#<anchor>` comment in code.
- Each sprint ends with a commit and a handoff note in [Status](#status): what was done, what is open, and anything the next sprint needs to know.
- Sprints run in order. Within a phase, a sprint depends only on earlier sprints.

## Plan

| # | Sprint | Phase | Modules | Read | Exit criterion |
|---|---|---|---|---|---|
| 0 | Foundations | 0 | repo, gates, `lib/bundle` registry and types | AGENTS.md, spec/README.md, app-flow.md#stack | Every example and doc YAML block validates; types compile; `pnpm check` defined |
| 1 | Random numbers and grid | 1 | `lib/rng`, `lib/grid` | engine.md#random-numbers, engine.md#space, generation.md (fnv1a64) | Every engine.md vector reproduces; sight symmetric and no corner cuts as property tests |
| 2 | Quest system | 1 | `lib/systems` contract, `lib/systems/quest` | systems/README.md, systems/quest.md, systems/quest/* | Quest meets every conformance item and its rule tests |
| 3 | Cadmium system | 1 | `lib/systems/cadmium` | systems/cadmium.md, decisions/0004, systems/cadmium/* | Every Quest case passes against Cadmium with no module; module tests pass with `armor`, `stash`, and both |
| 4 | Compiler: setting packs | 1 | `lib/materials`, bundle loader in `lib/bundle` | spec/README.md, setting-packs.md | Both example packs compile to bundles that load as typed structures; one failing fixture per setting check with the documented `FILE: PATH: MESSAGE`; `materials check` and `materials build` CLI with exit codes 0/1/2 |
| 5 | Compiler: adventure packs | 1 | `lib/materials` | adventure-packs.md (incl. Compilation), draft.schema.json | The guide's `sunken_archive` adventure compiles; one failing fixture per adventure check |
| 6 | Engine: state and exploration | 2 | `lib/engine` | engine.md (Space through Effects, Action resolution), data-model.md (state) | Every exploration tool, doors, links, lighting (`lighting` true and false), seen cells, containers, conditions, requirements, effects work; every error code is producible |
| 7 | Engine: rounds and combat | 2 | `lib/engine` | engine.md (Modes, Rounds, Entity turns, Pending choices) | Both resolution methods, every sort key, rerolls, free tools, choices, voided actions, combat area, approach, cover, structures, behaviours; arrival-order permutation tests |
| 8 | Generator | 2 | `lib/generator` | generation.md, decisions/0002 | 1,000 consecutive seeds verify or return the documented error; generated maps pass the authored map checks |
| 9 | Triggers and harness | 2 | `lib/engine` triggers, `harness` CLI | adventure-packs.md#triggers, engine-implementation.md#command-line-harness | The harness plays an adventure to every ending from scripted JSON lines; golden logs replay in `pnpm test` |
| 10 | Store and replay | 3 | `lib/store`, Supabase schema | data-model.md, architecture.md#determinism-and-replay | Commits are atomic; every golden log replays to stored state, including `state_restored` |
| 11 | Accounts and characters | 3 | Clerk, webhook, dashboard, character pages | app-flow.md (Route map, Dashboard, Character creation), api.md (users, characters) | A new user signs up, sees an empty dashboard, and creates and renames a Quest and a Cadmium character |
| 12 | Campaigns, invitations, instances | 3 | campaign pages, lobby | app-flow.md (Campaign editor, Instance lobby), api.md#campaigns, running-a-campaign.md | A second user joins by code and by link; two characters join an instance; versions pin; `system_mismatch` rejects |
| 13 | Coordinator, API, broadcast | 3 | `lib/coordinator`, `app/api`, `lib/broadcast` | architecture.md, api.md, app-flow.md#server-boundaries | Two browsers play one instance over the binding; idempotency, rate limits, timeouts, reconnection with `after_version` |
| 14 | Play without models | 4 | play page, `lib/map` canvas | app-flow.md#play-interface, design/screens.md, design/components.md | A full adventure is playable with direct actions on wide and narrow screens; Playwright journeys in `pnpm check` |
| 15 | Parser and narrator | 5 | `lib/parser`, `lib/narrator` | tools.md, engine-implementation.md#parser-evaluation-set, runbooks/model-outage.md | The evaluation set meets 90% exact match with no `overreach` resolving to a state-changing tool; play continues with Groq disabled |
| 16 | Adventure editor: forms and maps | 6 | editor pages | app-flow.md#adventure-editor, draft.schema.json | A three-room map and one-arc adventure built in the editor publishes with the CLI's diagnostics and plays |
| 17 | Adventure editor: graphs and playtest | 6 | arc graphs, simulator, seed preview | app-flow.md (Playtest, Publishing) | Unreachable endings are reported before publishing |
| 18 | Schedules and reminders | 7 | `lib/scheduler`, `lib/notifier`, Web Push, calendar | data-model.md (schedules), api.md, app-flow.md#scheduled-jobs | Weekly recurrence across DST; reminders at each lead time in app and by push; resume, pause, `session_end` award AP |
| 19 | Settings, export, deletion | 7 | Settings page, export, deletion jobs | app-flow.md#settings, data-model.md (deletion), legal/privacy.md | Export contains every listed file; deletion follows the 30- and 90-day stages |
| 20 | Operations | 8 | history, operator console, reports, holds, shutdown | app-flow.md#history, runbooks/* | A report leads to removal and a hold; simulated shutdown blocks sign-in and purges after 90 days, keeping held records |
| 21 | Modules in play | 9 | engine extensions, Cadmium modules | systems/cadmium.md, setting-packs.md (currency), engine.md#containers | A Cadmium campaign with `armor` and `stash` plays; a character earns, spends, stores, and dons armor |
| 22 | Pack art | 10 | compiler art checks, rendering | setting-packs.md#art, decisions/0005, design/components.md | Example packs render with and without art |
| 23 | Portrait uploads | 10 | uploads, sanitization, moderation | data-model.md (Asset), legal/privacy.md | A portrait is uploaded, exported, deleted, and removable after a report |
| 24 | Exemplar adventure | 11 | `lantern_coast`, `sunken_archive`, `tools/sim` | briefs/example-adventure.md | Every ending is reached by a scripted run and an agent-driven run; balance values proposed upstream |

## External prerequisites

| Needed by sprint | Item |
|---|---|
| 0 | Git URL of the specification repository, to replace the vendored `cadmium-spec/` with a submodule pinned at `54f4adcdffe5bf3c8547a5c89a9f55fefbeb2fef` |
| 10 | Supabase project (URL, anon and service keys) |
| 11 | Clerk application (publishable and secret keys, webhook secret) |
| 13 | Vercel project linked to the repository |
| 15 | Groq API key, with Zero Data Retention enabled |
| 18 | VAPID key pair for Web Push |

## Status

### Sprint 0: Foundations — closed

Done:

- Next.js App Router shell with TypeScript strict, Tailwind importing `cadmium-spec/design/theme.css`; `pnpm build` passes.
- Node 24 pinned through pnpm `devEngines.runtime`; run tools with `pnpm exec` or `pnpm <script>`.
- TypeScript 6 (typescript-eslint does not support TypeScript 7).
- `scripts/gen-bundle.ts` generates `lib/bundle/schemas.generated.ts` (schema index and rules data) and `lib/bundle/types/` from all 28 schemas.
- `lib/bundle/registry.ts`: one `Ajv2020` registry of every schema, with `ajv-formats`. `strictRequired` is off because the schemas use `not: { required: [a, b] }`.
- `lib/materials/layout.ts`: the pack and adventure directory tables of spec/README.md.
- `tests/spec-validation.test.ts`: 80 passing tests covering the meta-schema, every example file, and every complete documentation YAML block (`tests/doc-blocks.ts` decides which blocks are complete files).
- The gates of the working agreement, as `pnpm check`.
- `README.md`; `SPEC_ISSUES.md` with one entry, `complete-doc-yaml-blocks`.

Open:

- `cadmium-spec/` is a vendored copy of `cadmium-spec.zip`, not a submodule; see External prerequisites.
- Playwright is deferred to sprint 14, the first sprint with browser journeys.

### Sprint 1: Random numbers and grid — closed

Done:

- `lib/rng`: `draw` (`splitmix64_v1`), `Rng` with `next`, `die` (rejection sampling), `roll` (`NdM±K`), and `pick`; `parseDice`; `fnv1a64` for generator location seeds. The three draw vectors and the five d20 rolls reproduce; rejection on a 3-sided die consumes counters.
- `lib/grid`: `parseMap` and `TerrainGrid` (built-in and declared terrain, cells outside the map are `void`); `distance`, `footprintDistance`, `adjacent` with the corner rule, footprint adjacency and overlap; `line`, `sightLine`, `sees`, `footprintSees`; `direction` labels; `findPath` (Dijkstra, `(cost, y, x)` frontier, documented neighbour order, footprints), `reachable`, and `walk` (allowance, last free cell, early stops).
- Every geometry vector in engine.md passes. fast-check properties: sight is symmetric, paths never cut a blocked corner, and `findPath` cost equals the cheapest reachable cost.
- `SPEC_ISSUES.md`: `seed-range`, `footprint-movement`, `stopping-on-occupied-cells`, each with markers.

Notes for sprint 2 and later:

- Geometry takes predicates (`open`, `blocksMovement`, `blocksSight`, `cost`), so the engine overlays entities, doors, and creatures on `TerrainGrid` without changing `lib/grid`.
- The corner rule takes `blocksMovement`; whether opposing creatures count for it is the engine's decision in sprint 6.
- `walk` reports `arrived`, `allowance`, `early`, or `short`; the engine maps `early` to `new_room` or `hostile_seen` for the `moved` event.

### Sprint 2: Quest system — closed

Done:

- `lib/systems/contract.ts`: the contract types (`RulesSystem`, `Combatant`, `Situation`, `Resolution`, `PendingChoice`, `RulesError`, ordering policy, `SPATIAL`) and `emptyResolution`.
- `lib/systems/quest`: every contract name, reading `data.json` and the six schemas from the specification. Tiers, setbacks (tough choice as a pending choice, failure, severe), attacks by tier, harm with death's door, healing, rests, AP costs and the session award, creature and structure sheets, reach, speed, senses, summary, and ordering.
- `lib/systems/index.ts`: the `SYSTEMS` registry.
- `lib/systems/testing/conformance.ts`: every item of the conformance list as a suite taking a system. `testing/quest-cases.ts`: every rule in quest.md as a suite taking a system, including the api.md partial-hit example.
- `SPEC_ISSUES.md`: `systems-generated-types`, `quest-tool-priority`, `quest-setbacks`, `quest-event-payloads`, `quest-creation-items`.

Notes for sprint 3 and later:

- Cadmium runs `conformance(CADMIUM)` and `questCases(CADMIUM)` unchanged for the no-module case, and `conformance` for each module combination.
- Quest exports `harmSheet`, `healSheet`, `standardDamage`, and `tierOf` so that Cadmium's `armor` module can wrap harm without copying it.
- Setback harm and drops are returned as `damage` and `drop_item` effects; the engine applies effects after updates (sprint 6).
- `initiative` returns ascending ids with no draws; Quest orders combat by `side`, so the engine never calls it for Quest.

### Sprint 3: Cadmium system — closed

Done:

- `lib/systems/cadmium`: Cadmium delegating every contract function to Quest; `configure` builds one cached system per module set in canonical order (`ENABLED`), and rejects unknown modules.
- Module `armor`: default and creature pools, harm through the pool (bypass types, death's door), attack damage through the pool, donning with `consume: true` and the full-pool refusal, `summary` resource. Module `stash`: `can_carry` with `base_slots`, container `slots`, and `max_containers`.
- `schemasFor(modules)`: the schemas with disabled module fields removed.
- Quest's `attack` takes its harm function through `attackWith`, so `armor` reaches attack damage.
- Tests: conformance for Cadmium and for `armor`, `stash`, and both; every Quest case against Cadmium; a property test that Cadmium with no module returns Quest's results; schema superset and module-field tests; module rule tests.
- `SPEC_ISSUES.md`: `module-schema-fields`, `armor-events`.

Phase 1's systems criterion holds. Notes for sprint 4:

- The compiler validates `system_stats` with the system configured by `system.modules`: use `SYSTEMS[id].configure(modules).SCHEMAS` in a registry per configuration, since configured schemas keep their `$id`.
- Error messages from system schemas name the system and kind, as in `quest creature: 'goon' is not one of [...]` (spec/README.md, Compiler interface).

### Sprint 4: Compiler for setting packs — closed

Done:

- `lib/materials`: `compile(files)` over an in-memory file map. `pack.ts` reads the layout, parses YAML 1.2, validates each file, and merges directories. `explain.ts` turns a failed validation into one specific message per cause, choosing the intended `oneOf` branch. `rules.ts` binds the system and validates `system_stats` and check specifications against the configured system. `setting.ts` runs cross-reference, declaration, generation, remains, depth, light, and currency checks, and builds the bundle. `maps.ts` runs the map checks. `art.ts` checks assets and reads PNG and WebP sizes. `semver.ts` handles version ranges.
- `lib/materials/cli.ts`: `materials check|build [--json] [-o FILE] [--] DIR`, exit statuses 0, 1, and 2, atomic `-o`.
- `lib/bundle/setting.ts`: `SettingBundle` types, built-in terrain and conditions, and `loadSettingBundle`, which fails on unknown fields.
- `lib/materials/testing/fixtures.ts`: 57 fixtures, at least one for every check id, each asserting its exact `FILE: PATH: MESSAGE`, including both examples in spec/README.md.
- `SPEC_ISSUES.md`: `diagnostic-check-ids`, `pack-file-names`, `attribution-licenses`, `ref-kinds`, `bundle-format`.

Notes for sprint 5:

- `readPack("adventure", ...)` already reads the adventure layout and keys `plot/`, `locations/`, and `npcs/` by `id`.
- `checkGrid` and `checkPlacements` take a `MapContext` and work for authored locations; adventure-specific checks (rooms covering every passable cell, links, `npc`, `id`, `room`) are still to add.
- `languageVisitor` collects refs and declaration checks for any effect list; adventure refs may point into required settings' namespaces, so resolution needs the setting bundles.

### Sprint 5: Compiler for adventure packs — closed

Done:

- `lib/materials/adventure.ts`: `compileAdventure(files, settings)` with all 17 checks of adventure-packs.md, "Compilation". It covers settings and modules, refs across the adventure's and its settings' namespaces, flags (declarations, literal types and ranges, `target` scope, currency), arcs, stages, endings, NPCs, topics, secrets, doors, entity ids, room references with generated-room aliases and actor scopes, map, room, and link checks, ending reachability, flag-only door locks, anchor and generated-link constraints, start-room capacity, and NPC placement.
- `lib/materials/content.ts`: the catalog, ref resolution, entity checks, and content visitor shared with setting packs. Missing refs read `unknown ref 'x'`, and occupancy reads `is already occupied by PATH`, as in the specification's examples.
- `lib/bundle/adventure.ts`: `AdventureBundle` (arcs in file order, `requires_settings[].resolved`, flag `scope` and trigger `once` defaults) and `loadAdventureBundle`.
- `compileDraft` compiles an editor draft through the same code; `materials --setting PATH` supplies required settings.
- Fixtures: the guide's `sunken_archive` assembled from its YAML blocks compiles cleanly; 41 adventure fixtures each assert an exact diagnostic; every check id has a fixture.
- `SPEC_ISSUES.md`: `cli-adventure-settings`, `trigger-match-refs`, `container-locks`, `treasure-role`, `ending-reachability`, `start-free-cells`, `room-scopes`, `draft-entity-files`.

Phase 1 is complete. Notes for sprint 6:

- `guideAdventure()` and `derelictStation()` in `lib/materials/testing/fixtures.ts` give a compiled setting and adventure for engine tests; `lower_archive` is generated, so playing past the lift needs sprint 8's generator.
- Bundle refs are qualified (`base:hatch`); room references stay as written and resolve at runtime by the scopes in adventure-packs.md, "Room references".

### Sprint 6: Engine state and exploration — closed

Done:

- `lib/engine`: `submit`, `advance`, `startInstance`, and `view`. Each call works on a private copy of state and returns a complete result or an error.
  - `world.ts`: terrain, rooms, occupancy, obstruction, light, perception, and visibility.
  - `movement.ts`: goal cells, the exploration walk (opening unlocked doors, stopping on new rooms and newly seen hostiles), link travel, moving away, approach, and reach.
  - `actions.ts`: validation and resolution of all fifteen tools.
  - `effects.ts`: every setting and plot effect.
  - `requirements.ts`: every requirement form, and room references.
  - `situation.ts`: advantage, modifier, cover, and illumination tags.
  - `rounds.ts`: declarations validated by a dry run, closing, ordering, voiding, `tick`, durations, and the clock.
  - `triggers.ts`: three passes in event and arc order.
  - `start.ts`: placements, characters, starting items, flags, stages, and start effects.
- `lib/engine/testing/world.ts`: the `trial` adventure, compiled through `lib/materials`.
- `lib/engine/engine.test.ts`: 71 tests.
  - Every error code is produced.
  - Movement covers doors, the `new_room` and `hostile_seen` stops, and link travel.
  - Containers, use, light, talk, search, rest, and free tools are covered.
  - An arrival-order permutation test checks simultaneous resolution.
  - Pending choices, triggers, endings, effects, requirements, conditions, and situations are covered.
  - Lighting is tested with `SPATIAL.lighting` true and false.
  - Views, determinism, and input immutability are covered.
- `SPEC_ISSUES.md`: `engine-state-fields`, `dead-creatures`, `container-contents`, `weighted-tables`, `effect-events`, `ability-roll`, `outside-combat-area`.

Already in place for sprint 7:

- Both resolution methods, every sort key, and initiative rerolls.
- Combat start, combat area, combatant recruitment, and combat end.
- Entity behaviours, approach, and cover.

Sprint 7 adds the tests for those parts, and a fake sequential system with initiative.
