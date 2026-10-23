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

### Sprint 8: Generator — closed

Done:

- `lib/generator` (written by a subagent, reviewed and integrated here): `generate(spec, settings, adventure, metric, seed)` implements generation.md's pipeline. It covers location and attempt seeds, BSP layout, adjacency with Kruskal and loops, roles and BFS renumbering, room templates, anchors and links, locks and keys, population, placement cells, verification, and 20 attempts. Output is the compiled authored format plus `legend` and `aliases`.
- Tests:
  - A 1,000-seed sweep of the guide's `lower_archive`: every map verifies and passes the authored map checks of `lib/materials`.
  - Synthetic specs of 200 seeds each.
  - Determinism, room templates, lighting, and the documented errors.
- `lib/engine/start.ts` generates every generated location at instance start and stores its aliases. Engine and generator share `pickWeighted`.
- `lib/engine/adventure.test.ts`: the guide's `sunken_archive` starts, powers its lift with the keycard, and travels into the generated archive.
- `SPEC_ISSUES.md`: 17 generator entries, from `generator-attempt-seeds` to `verification-passability`; `treasure-role` and `weighted-tables` extended.

Notes for sprints 7 and 9:

- Sprint 7 tests rounds and combat: sequential and initiative policies with a fake system, entity behaviours, approach, cover, structures, the combat area, and combat end.
- Sprint 9 adds the harness and golden logs; `sunken_archive` and `trial` are the adventures to script to every ending.

### Sprint 7: Rounds and combat — closed

Done:

- The combat area grows when a combatant entity enters a room (`SPEC_ISSUES.md#combat-area-growth`).
- `lib/engine/combat.test.ts`: 28 tests with Quest variants for sequential resolution, initiative, and no approach. They cover:
  - mode changes at the next round, and characters-first ordering;
  - combat end by defeat and by leaving;
  - combat area growth, and exploration tools outside the area;
  - sequential order from initiative, with automatic entity turns and `turn_started`;
  - `advance` skipping a sequential turn, and initiative rerolls `per_round`, `per_combat`, and `never`;
  - every behaviour, including `flee_when_harmed`;
  - approach and its voiding, `approach: false`, cover, and structure destruction with remains;
  - a combat round under Quest and under Cadmium with both modules.

Engine milestones 4 to 7 are met. Sprint 9 adds the command-line harness, scripted scenarios to every ending, and golden replays.

### Sprint 9: Triggers and harness — closed

Done:

- Triggers are part of sprint 6's engine (`lib/engine/triggers.ts`). The scenarios exercise them on both adventures.
- `lib/harness/harness.ts`: `begin`, `step`, `play`, and `replay` over JSON lines. Rejections are data. A malformed line raises `HarnessError` with its line number. The log records each commit's input and events (`SPEC_ISSUES.md#replay-source`).
- `lib/harness/cli.ts`:
  - `harness play --bundle FILE... --seed N --character ID=SHEET_FILE... [--state FILE] [--log FILE]` and `harness replay --bundle FILE... LOG`.
  - Exit status 0, 1 (malformed line, or a replay mismatch naming the version), or 2 (usage).
- `lib/harness/scenarios.ts`: an autopilot that authors scenarios, reaching every ending of both adventures: `trial_escaped`, `trial_lost`, `sunken_escaped`, and `sunken_lost`.
- `lib/harness/golden/`: each scenario's input lines and log. `pnpm golden` rewrites them.
- `lib/harness/harness.test.ts`: 29 tests.
  - Each scenario plays to its ending and reproduces its golden log byte for byte.
  - Every golden log replays, and a tampered log reports the first differing version.
  - Input-line parsing and the command line are tested.
- Verified end to end: `materials build` writes bundles to disk, and `harness play` and `replay` run on them.

Phase 2 is complete: the harness plays an adventure to every ending from scripted JSON lines, golden logs replay in `pnpm test`, and 1,000 generator seeds verify.

Phase 3 begins with sprint 10 (`store` and replay). It is the first sprint that needs external services: a Supabase project (URL, anon key, service key). The store can be written and tested against a local Postgres-compatible schema without one, but the deployment needs it.

### Sprint 10: Store and replay — closed

Done:

- `supabase/migrations/20261023000000_store.sql`:
  - Tables `bundles` (data immutable by trigger), `instances`, `instance_characters`, `events`, `commits`, `input_logs` (idempotency key unique per user and instance), and `narrations`.
  - `cadmium_commit` writes a commit's events (contiguous `seq`), state, version, input, and input-log outcome in one transaction. It fails with `CD409` unless the stored version is the expected one.
- `lib/store`: `Store` over a narrow `Db` interface (`query(text, params)`), covering bundles, instances, commits, events after a version, commits for replay, input log, and narration. `VersionConflict` signals a lost race.
- `lib/store/testing/pglite.ts`: an in-process Postgres (PGlite) with every migration applied.
- `lib/engine/replay.ts`: replay of commit inputs with `state_restored`, and canonical JSON comparison. The harness delegates to it.
- `lib/coordinator/admin.ts`: `pinnedBundles`, `replayInstance`, and `restoreInstance` (requires `paused`).
- `lib/store/store.test.ts`: 15 tests.
  - Atomic rollback after the events are inserted, version conflicts with nothing written, and exactly one winner between two concurrent writers.
  - Idempotency keys, and bundle immutability.
  - Every golden scenario stored commit by commit replays to the stored state.
  - Restore, play continuing after a restore, and undoing a restore.
  - Divergence reported at the right version.
- `SPEC_ISSUES.md`: `replay-to-version`; `replay-source` extended.

Notes for sprints 11 to 13:

- Production needs a `Db` over Supabase Postgres, for example `postgres` (`sql.unsafe(text, params)`) with the Supabase pooler connection string. The migrations apply with `supabase db push`.
- Users, characters, campaigns, members, invitations, and schedules get their own migrations in sprints 11 and 12. `instances.campaign_id` gains its foreign key when `campaigns` exists.

### Supabase wiring (between sprints 10 and 11)

- `supabase/migrations/20261023000100_store_api.sql`: one function per store operation, and access limited to the service role (execute revoked from `public`, `anon`, `authenticated`; row-level security on every table, no policies). It is tested with Supabase's roles in PGlite.
- `lib/store`: `Store` calls those functions through an `Rpc`; `sql-rpc.ts` runs them as SQL (tests), `lib/server/supabase.ts` through supabase-js `.rpc()` with the service-role key. The `postgres` driver and `DATABASE_URL` are not needed.
- `lib/store/migrate.ts`: an ordered, transactional migration runner with a read-only dry run, used by the test database.
- `lib/server/env.ts` and `GET /api/health`.
- The first two migrations are applied to the remote database through the SQL Editor.

### Sprint 11: Accounts and characters — open

Done:

- `supabase/migrations/20261023000200_users_characters.sql`: `users` (the id is the Clerk user id) and `characters`, with one function per operation and access limited to the service role. A late identity update never revives a deleted user.
- `app/api/webhooks/clerk/route.ts`: verifies the Clerk signature (`CLERK_WEBHOOK_SIGNING_SECRET`) and upserts the user on `user.created` and `user.updated`; `user.deleted` marks the user deleted. `lib/server/session.ts` creates the user on first request when the webhook has not arrived.
- `lib/api`: `get_me`, `accept_terms`, `list_systems`, `get_system_schema`, `create_character`, `get_character`, `list_characters`, `update_character`, `retire_character`, with the terms gate and the error codes of api.md. Sheets are built by the rules system from the player's choices and a server seed.
- Pages: `/accept-terms` (the terms gate), the dashboard's Characters list, `/characters/new` (system picker, then Quest's sentence form with abilities counted against six), and `/characters/[id]` (sheet, name and profile, Retire). Creation and sheet components are registered by system id in `components/systems`.
- Tests: `lib/api/api.test.ts` and `lib/api/identity.test.ts`.
- `SPEC_ISSUES.md`: `terms-version`, `starting-abilities-supply`.

Open:

- The third migration is not yet applied to the remote database.
- The installed materials cannot supply six starting abilities (`SPEC_ISSUES.md#starting-abilities-supply`), so no Quest or Cadmium character can be created in the deployed app until a setting with enough abilities is installed. Bundles are not yet installed in the remote database at all.
- Portrait uploads come with sprint 23.

### Sprint 12: Campaigns, invitations, instances — open

Done:

- `supabase/migrations/20261023000300_campaigns.sql`: `campaigns`, `campaign_members` (one author), `campaign_materials`, `invitations` (code hashes only; a pending invitation past `expires_at` reads as `expired`), foreign keys from instances and instance characters, and functions for each operation, with access limited to the service role. Accepting an invitation and adding the member happen in one transaction.
- `lib/api`: `list_materials`; `create_campaign`, `list_campaigns`, `get_campaign`, `update_campaign`, `set_materials`, `archive_campaign`, `leave_campaign`, `remove_member`, `rotate_invite_link`, `disable_invite_link`, `join_by_link`; `invite`, `preview_invitation`, `list_invitations`, `accept_invitation`, `decline_invitation`, `revoke_invitation`; `create_instance`, `list_instances`, `get_instance`, `add_character`, `remove_character`. Material checks cover usability (listed operator bundles and the author's own), system and version compatibility, required modules, one adventure, and `requires_settings`.
- Pages: `/campaigns/new`, `/campaigns/[id]`, `/campaigns/[id]/edit` (Details, Materials, Members, Invitations), `/invite/[code]`, `/join/[code]`, `/instances/[id]` (lobby: party, Add my character), and the dashboard's Active instances and Campaigns sections with a code field. `/accept-terms?next=` returns to an invitation after acceptance.
- Tests: `lib/api/campaigns.test.ts` (16): joining by code and by link, two characters in one instance, version pinning across `set_materials`, `system_mismatch` for materials and characters, archived campaigns, revocation rights, expiry.
- `SPEC_ISSUES.md`: `cross-system-versions`.

Open:

- The third and fourth migrations are not yet applied to the remote database.
- The instance lifecycle, party changes while paused, and campaign deletion moved to sprint 13.

### Sprint 13: Coordinator, API, broadcast — open

Done:

- `lib/coordinator/instance.ts`: the Instance Coordinator. Writes are serialized by optimistic versioning with retries; each commit sends `commit` (shared events), `round`, and `instance_status` on `instance:{id}`, and `declaration` and `choice` on the owner's `user:{id}`. Round deadlines (`EXPLORATION_ROUND_TIMEOUT`, `COMBAT_TURN_TIMEOUT`; defaults 120 s and 60 s; 0 disables) are stored with the instance, and any request to an expired instance invokes `advance` through the same write path. Ending, by an ending or by `end_instance`, writes every sheet back.
- `lib/engine`: `join` and `leave` for party changes, replayed as commit inputs; `sharedEvents` for what every member may see.
- `supabase/migrations/20261023000400_coordinator.sql`: round deadlines, status changes serialized with commits, `shared` events, `get_history`, character release, campaign deletion and restore, a fixed-window rate counter, and the Realtime policy admitting members to `instance:{id}` and each user to `user:{id}`.
- `lib/api`: `start_instance`, `pause_instance`, `resume_instance`, `end_instance`, `advance_round`, `submit_action` (idempotency keys, rejections as `input_rejected`), `get_instance` with the caller's view, `get_history`, `add_character` and `remove_character` while paused, `leave_campaign` and `remove_member` across started instances, `delete_campaign`, `restore_campaign`.
- `lib/api/http.ts` and `app/api/v1/[...path]/route.ts`, rewritten from `/v1`: every implemented operation, error statuses, `Retry-After`, `Idempotency-Key`, 120 requests per user per minute. `submit_input` answers `unavailable` until the parser (sprint 15).
- `lib/broadcast`: Supabase Realtime broadcast from the server; browser subscriptions on private channels with a sequencer that delivers in version order and backfills gaps from `get_history`.
- Lobby: Start, Pause, Resume, End for the author; Enter game when active.
- Tests: `lib/api/play.test.ts` (12), `lib/api/http.test.ts` (3), `lib/broadcast/sequencer.test.ts` (3).
- `SPEC_ISSUES.md`: `party-changes`, `commit-event-visibility`, `binding-gaps`.

Open:

- Migrations 3 to 5 are not yet applied to the remote database.
- Realtime private channels need Supabase's Clerk third-party auth integration (Supabase dashboard, Authentication, Third-party auth, Clerk) so Supabase accepts Clerk session tokens; until then subscriptions fail and clients see commits only through `get_history`.
- Two browsers over the deployed binding are verified only in tests with an in-memory broadcaster.
- `narration` (template and model), `action_menu`, and `submit_input` come with sprints 14 and 15.

### Sprint 14: Play without models — open

Done:

- `/instances/[id]/play`: desk (character with inventory and abilities, map, ways on, party), page (narrative log, action bar), margin (round status, countdown, Advance for the author). Below 1024 px a top bar opens Map, Character, Party, and Round as sheets. Paused returns to the lobby after 5 seconds; ended shows the ending.
- Direct actions for every tool the view allows: move, examine, attack, take, interact verbs, talk with topics, use, drop, abilities, wait, search, rest, and choices.
- `lib/map/plan.ts`: the map as drawing operations (seen cells, light overlays, rooms, doors, links, entities, party tokens) with click targets, painted on a canvas; a text list of visible entities.
- `lib/narrator/template.ts`: template narration of shared events, stored and broadcast as `narration` after each commit; declarations are not narrated.
- Messages: Realtime when the channel connects; otherwise the client polls `get_history` every 4 seconds through the same sequencer.
- Tests: `sunken_escaped` and `sunken_lost` played to their endings through `submit_action` alone; template narration; map plan.
- `SPEC_ISSUES.md`: `view-direct-play`.

Open:

- Playwright journeys in `pnpm check` need Playwright and its browsers installed (`pnpm add -D @playwright/test`, then `pnpm exec playwright install chromium`).
- Icon buttons use text labels until `lucide-react` is installed.
- Hostile creatures have no danger ring yet: the view does not mark hostility.
- The page is not yet checked in a browser: signed-in pages need migrations 3 to 5 in the remote database.
