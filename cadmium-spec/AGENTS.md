# AGENTS.md

Instructions for agents working on the Cadmium specification in this repository, and for agents implementing it in the application repository. Every agent reads the whole file; [Implementing the specification](#implementing-the-specification) applies to implementation work.

## What this repository is

The specification of Cadmium, a multiplayer text dungeon crawler run by software: documents, JSON Schemas, example packs, rules data, and design tokens. It contains no application code. The web application that implements it is a separate repository; [docs/app-flow.md](docs/app-flow.md) maps the specification onto it.

Do not add code, scripts, build files, or generated artifacts to this repository. Validation tools may be run outside it.

## Layout

| Path | Contents |
|---|---|
| `docs/` | Specification documents; start at [docs/README.md](docs/README.md) |
| `docs/decisions/` | Architecture decision records |
| `docs/legal/` | Terms of Service and Privacy Policy |
| `spec/schema/` | JSON Schemas (draft 2020-12) for setting packs, adventure packs, maps, and the editor draft |
| `spec/examples/` | Example packs; every file validates against its schema |
| `systems/<id>/` | Rules data (`data.json`), module data (`modules.json`), and JSON Schemas for each rules system |
| `design/theme.css` | Design tokens |
| `briefs/` | Task briefs for agent sessions |

## Sources of truth

When two documents disagree, the more specific one governs, in this order:

1. JSON Schemas in `spec/schema/` and `systems/<id>/`, for shapes and allowed values.
2. [docs/engine.md](docs/engine.md), for rules the engine applies, including geometry, lighting, and their test vectors.
3. The format documents: [setting-packs.md](docs/setting-packs.md), [adventure-packs.md](docs/adventure-packs.md), [generation.md](docs/generation.md), [tools.md](docs/tools.md), [api.md](docs/api.md), [data-model.md](docs/data-model.md).
4. Guides, runbooks, and examples in documents.

Report a disagreement instead of silently picking one side. Fix it in the same change when the intended behaviour is clear.

## Conventions

- MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY follow RFC 2119.
- Identifiers match `^[a-z][a-z0-9_]{0,63}$`. Refs are `namespace:key`.
- Cells are `[x, y]`; `x` increases east, `y` south, `[0, 0]` is the top-left cell.
- YAML files are JSON-compatible YAML 1.2: only `true` and `false` are booleans. A YAML 1.1 parser reads the trigger key `on` as a boolean; use a YAML 1.2 parser, such as the `yaml` npm package, or a loader restricted to `true` and `false`.
- Schemas share the base URI `https://schema.dungeon-crawler.invalid/v1/` and refer to each other by file name. Load all of `spec/schema/` and `systems/<id>/` into one registry before validating.

## Writing documentation

- Formal reference register. No first person outside the legal documents, no conversational phrases, no hedging, no hype.
- Describe the current state only. No change narration, no "now", "new", "previously", "no longer", or "updated". Rewrite a section so it reads as one coherent description; do not append notes.
- Active voice, present tense, one idea per sentence. Define a term once and use it consistently; add new terms to [docs/glossary.md](docs/glossary.md).
- Headings name topics. Numbered lists for ordered steps, tables for parameters and comparisons, code formatting for identifiers, paths, and values.
- Decision records keep context and rationale in their sections; record a superseding decision as a new ADR and link it from the old one's status line.

## Keeping documents consistent

A change in one place usually needs changes elsewhere:

| When you change | Also check |
|---|---|
| A schema in `spec/schema/` | The format document, `spec/README.md` layout and checks, every example and YAML snippet in `docs/` |
| An effect, requirement, or event | `engine.md` tables, `defs.schema.json`, the trigger editor in `app-flow.md` |
| A tool or its arguments | `tools.md`, `engine.md` action resolution, `api.md` `submit_action`, the play interface in `app-flow.md` |
| The rules-system contract | `docs/systems/README.md` contract and conformance, each system document and `data.json`, `engine.md` division of responsibility |
| A system module | The system's document and `modules.json`, its schemas, `api.md` system object, campaign creation in `app-flow.md` |
| Art | `assets.schema.json`, the `art` def, `setting-packs.md` art, `data-model.md` Asset, `design/components.md` art, the attribution page |
| A record or field in `data-model.md` | `api.md` objects and operations, the Privacy Policy's collection and retention tables, the data export contents |
| Deletion, retention, or shutdown | `data-model.md` deletion, Privacy Policy sections 5–7, Terms section 3, `app-flow.md` scheduled jobs and Settings, the runbooks |
| A user-visible page | `app-flow.md` routes and pages, `design/screens.md` |

## Validation before finishing

1. Every schema passes the JSON Schema 2020-12 meta-schema.
2. Every file in `spec/examples/` validates against its schema, as listed in [spec/README.md](spec/README.md).
3. Every YAML block in `docs/` that is a complete pack file validates against its schema. A block introduced by a paragraph that begins `Excerpt of` and names a file in `spec/examples/` is an excerpt: its lines appear in that file in the same order, and its data is contained in the file's data.
4. Every YAML block that names a file in `spec/examples/` without `Excerpt of` is identical to that file.
5. Every relative link and heading anchor in Markdown resolves.
6. The prose passes the rules in [Writing documentation](#writing-documentation).

## Do not

- Fill the placeholders `[EMAIL]`, `[DATE]`, and `[END DATE]` in `docs/legal/` and `docs/runbooks/`. The project owner fills them.
- Name a person as an escalation or legal contact.
- Change the Terms of Service or Privacy Policy without an explicit request.
- Remove values from a system's `confirm` list. Only checking against the rulebook removes them.
- Copy rulebook text that the system's license does not cover; see [LICENSES.md](LICENSES.md).

## Open items

| Item | Where |
|---|---|
| Quest values to confirm, inherited by Cadmium: `ap_award_per_session`, `npc_templates`, `setbacks`, `spatial` | `systems/quest/data.json`, `systems/cadmium/data.json` |
| Cadmium module values set by simulation: `armor.max`, `armor.bypass_types` | `systems/cadmium/modules.json` |
| Groq zero data retention to confirm before publishing | Privacy Policy section 4 |

## Implementing the specification

This section governs agents that build the web application. The application lives in its own repository and consumes this one; it never edits this repository except through the specification process above.

### Setup

1. Create the application repository with the stack in [docs/app-flow.md](docs/app-flow.md#stack): Next.js App Router, TypeScript in strict mode, Clerk, Supabase, Vercel, Groq.
2. Add this repository as a git submodule at `cadmium-spec/`, pinned to a commit. The application reads schemas, examples, rules data, and `theme.css` from it at build time and copies nothing by hand. Updating the pin is its own change, with the specification diff summarized.
3. Generate TypeScript types from `cadmium-spec/spec/schema/` and `cadmium-spec/systems/*/` into `lib/bundle/types/` with a JSON Schema code generator, and validate with Ajv (`Ajv2020`) using one registry of every schema. Generated files are never edited.
4. Use Vitest for unit and property tests, Playwright for browser journeys, and run both, plus type checking, linting, and example validation, in CI on every change. A failing gate blocks merging.
5. Module paths follow [docs/guides/engine-implementation.md](docs/guides/engine-implementation.md#module-boundaries) under `lib/`: `rng`, `grid`, `bundle`, `systems/quest`, `systems/cadmium`, `materials`, `generator`, `engine`, `store`, `coordinator`, `parser`, `narrator`, `broadcast`, `scheduler`, `notifier`, `map`. Imports follow the dependency table there and never point the other way; `rng`, `grid`, `generator`, and `engine` perform no I/O.

### Rules for implementing agents

- The specification is the requirement. Do not invent behaviour it does not state, and do not deviate from behaviour it does state.
- When the specification is silent, contradictory, or impossible to implement as written, stop on that point. Record it in `SPEC_ISSUES.md` in the application repository with the document, the section, the problem, and a proposed resolution; implement the smallest behaviour that keeps tests passing and mark it with a comment naming the issue. The issue is resolved by a change to this repository, after which the marker is removed.
- Tests come from the specification first: test vectors, conformance lists, compilation checks, and documented examples become test cases before the code they test.
- Determinism is a requirement, not an optimization. Engine, generator, and rules-system code read no clock, randomness, or environment other than their arguments.
- Models appear only behind `parser` and `narrator`. No test outside the parser evaluation depends on a model.
- One task, one module, one change. A change that touches several modules states why.
- Never weaken a test to pass it. A test that encodes a specification requirement changes only when the specification changes.

### Phases

Each phase ends with its exit criterion met in CI. Phases 1 and 2 run as parallel workstreams; later phases depend on earlier ones. The numbers in brackets are the matching steps in the application build order ([app-flow.md](docs/app-flow.md#build-order)) and the engine milestones ([engine-implementation.md](docs/guides/engine-implementation.md#build-order)).

| Phase | Work | Exit criterion |
|---|---|---|
| 0. Foundations | Repository, submodule, CI gates, generated types, schema registry, fixtures from `spec/examples/` | Every example and every documentation YAML block validates in CI; types compile |
| 1. Core libraries | `rng`, `grid` [engine 1]; `bundle` [engine 2]; `systems/quest`, `systems/cadmium` [engine 3, app 2]; `materials`, the Content Compiler with its `materials check` and `materials build` command line [app 3] | All test vectors reproduce; both systems meet [conformance](docs/systems/README.md#conformance), with every Quest case run against Cadmium with no module; the compiler accepts every example and rejects a fixture for every listed check with the documented `FILE: PATH: MESSAGE` |
| 2. Engine | Exploration, rounds and ordering, lighting, containers, triggers [engine 4, 5, 7]; `generator` [engine 6]; command-line harness [engine 8] | The harness plays an adventure to every ending from scripted JSON-line inputs; recorded event logs are kept as golden files; 1,000 generator seeds verify |
| 3. Persistence and multiplayer | `store` and replay [engine 9]; Clerk, users, characters [app 1, 4]; campaigns, invitations, instances [engine 11, app 5–7]; `coordinator`, `api`, `broadcast` [engine 10] | Replaying every golden log reproduces stored state; two browsers join one instance by code and link and play over the binding |
| 4. Play without models | Play page, map canvas in `lib/map`, direct actions [app 8] | A full adventure is playable in the browser with direct actions, on wide and narrow screens |
| 5. Models | Parser evaluation set first, built from the example packs; then `parser` and `narrator` with retry and fallback [engine 13, 14, app 9] | The evaluation set meets its accuracy target; play continues with Groq disabled |
| 6. Authoring | Adventure editor, map editor, playtest simulator, seed preview, publish [app 10, 11] | A draft built in the editor publishes, compiles with the same diagnostics as the command line, and plays |
| 7. Schedules and user controls | `scheduler`, `notifier`, Web Push, calendar feed, Settings, export, deletion stages [engine 12, app 12] | Reminders arrive at each lead time; export contains every listed file; deletion follows the 30- and 90-day stages |
| 8. Operations | History, operator console, content reports, holds, shutdown [app 13] | A report leads to removal and a hold; a simulated shutdown blocks sign-in and purges after 90 days, keeping held records |
| 9. Modules and engine extensions | Cadmium `armor` and `stash`, currency flags, containers with `capacity` [app 14] | A Cadmium campaign with both modules plays; a character earns, spends, stores, and dons armor |
| 10. Art | Pack assets, compiler checks, rendering and fallbacks; then portrait uploads, sanitization, export, deletion [app 15, 16] | Example packs render with and without art; an uploaded portrait is exported, deleted, and removable after a report |
| 11. Exemplar | `lantern_coast` and `sunken_archive` from [briefs/example-adventure.md](briefs/example-adventure.md) compile and play; balance simulation under `tools/sim` in the application repository, seeded and replayable | Every ending is reached by a scripted run and by an agent-driven run; chosen balance values are proposed to this repository |

Phases 4 to 11 keep the harness and golden logs current: every new engine behaviour adds a scripted scenario.

### Test layers

| Layer | Source | Runs |
|---|---|---|
| Vectors | `engine.md` random-number and geometry vectors | Every change |
| Conformance | `docs/systems/README.md` conformance list, per system and per module combination | Every change |
| Compiler fixtures | One failing fixture per compilation check in `spec/README.md` and `adventure-packs.md` | Every change |
| Unit and property tests | Per module, as listed in the engine implementation guide's test strategy | Every change |
| Golden replays | Harness event logs of every example adventure | Every change |
| Browser journeys | Playwright: sign-up, campaign, invitation, play, editor, Settings | Every change to `app/` or `components/` |
| Parser evaluation | Labelled inputs from the example packs, scored per model | On demand and before changing the parser model or prompt |
| Agent play | Model-driven players completing example adventures through the harness or API | Before each release |

### Definition of done

A task is done when:

1. Its exit criterion and every test layer it touches pass in CI.
2. Every behaviour it implements traces to a section of the specification, named in the change description.
3. It adds no entry to `SPEC_ISSUES.md` without the matching marker in code, and removes the markers of issues the specification has since resolved.
4. It introduces no new external service. Adding one requires a decision record in this repository first.

### Before launch

- The placeholders `[EMAIL]`, `[DATE]`, and `[END DATE]` are filled by the project owner.
- Groq zero data retention is confirmed, and the reminder in the Privacy Policy is removed by the project owner.
- The values in each system's `confirm` list are checked against the rulebook or shown to players as unconfirmed.
- `shutdown_at` is set to the course end date.

