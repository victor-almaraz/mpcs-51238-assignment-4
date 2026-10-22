# Automated Dungeon Crawler

A multiplayer, text-first dungeon crawler run entirely by software, built around swappable tabletop rulesets, starting with Quest. Players type what their characters do. A language model translates each input into one structured tool call. A deterministic engine validates the call, resolves it against authoritative game state, and records the result as events. A second model call narrates the outcome.

The design is platform agnostic. These documents define components, data contracts, file formats, and required behavior. They do not prescribe a programming language, database, transport, hosting provider, or model vendor.

## Properties

- The engine is the only component that changes game state. Models translate and narrate; they never decide outcomes.
- Rulesets are swappable modules behind one contract. Quest is implemented; further systems plug in without engine, API, or data-model changes.
- Settings and stories are data that users author. A new setting or adventure requires no engine code, and the example packs illustrate the formats without limiting them.
- Every location is a square-grid map. The engine decides movement, reach, and line of sight from it; models name places and entities, never coordinates.
- A campaign is prepared once and played as one or more instances, each with its own state and schedule.
- Every state change is an event. Any instance can be replayed and audited.
- The engine, not network timing, defines the order in which actions resolve.

## Repository contents

This repository holds the specification: documents, JSON Schemas, example setting packs, rules data for each system, and design tokens. The web application implements it; [app-flow.md](app-flow.md) maps the specification onto that application.

## Documentation map

### By audience

| Reader | Start with | Then |
|---|---|---|
| Engine or server implementer | [architecture.md](architecture.md) | [guides/engine-implementation.md](guides/engine-implementation.md), [engine.md](engine.md), [systems/README.md](systems/README.md), [data-model.md](data-model.md), [tools.md](tools.md) |
| Rules-system implementer | [systems/README.md](systems/README.md#adding-a-system) | [systems/quest.md](systems/quest.md), [systems/cadmium.md](systems/cadmium.md), [decisions/0001-pluggable-rules-systems.md](decisions/0001-pluggable-rules-systems.md) |
| Client implementer | [app-flow.md](app-flow.md), [design/README.md](design/README.md), [api.md](api.md) | [tools.md](tools.md#improvise), [guides/running-a-campaign.md](guides/running-a-campaign.md) |
| Setting author | [guides/setting-pack-authoring.md](guides/setting-pack-authoring.md) | [setting-packs.md](setting-packs.md), [engine.md](engine.md#effects), [spec/README.md](../spec/README.md) |
| Adventure author | [app-flow.md](app-flow.md#adventure-editor), [guides/adventure-authoring.md](guides/adventure-authoring.md) | [adventure-packs.md](adventure-packs.md), [generation.md](generation.md) |
| Campaign author | [guides/running-a-campaign.md](guides/running-a-campaign.md) | [api.md](api.md#campaigns) |
| Operator | [runbooks/](runbooks/) | [architecture.md](architecture.md#determinism-and-replay) |

### Design

| Document | Contents |
|---|---|
| [design/README.md](design/README.md) | Principles and sources of truth for the Margin design system |
| [design/foundations.md](design/foundations.md) | Layout, Graphite colour tokens, Libertinus typography, space, motion, Lucide icons |
| [design/components.md](design/components.md) | Icon buttons and tooltips, fields, menus, status, margin notes, rule inserts, graphs |
| [design/screens.md](design/screens.md) | Visual treatment of the main screens |
| [design/writing.md](design/writing.md) | Interface copy and the product's voices |

### Architecture and decisions

| Document | Contents |
|---|---|
| [architecture.md](architecture.md) | Context, components, trust boundaries, action pipeline, concurrency, scheduling, key decisions |
| [app-flow.md](app-flow.md) | Web application pages, navigation, adventure editor, play interface, and server boundaries on Next.js, Clerk, Supabase, Vercel, and Groq |
| [decisions/0001-pluggable-rules-systems.md](decisions/0001-pluggable-rules-systems.md) | ADR: rules systems behind a contract |
| [decisions/0002-grid-maps.md](decisions/0002-grid-maps.md) | ADR: square-grid maps instead of zones |
| [decisions/0003-lighting.md](decisions/0003-lighting.md) | ADR: illumination in the engine, perception in the rules system |
| [decisions/0004-cadmium.md](decisions/0004-cadmium.md) | ADR: Cadmium as a Quest derivative with modules |
| [decisions/0005-art.md](decisions/0005-art.md) | ADR: art as one asset kind |

### Reference

| Document | Contents |
|---|---|
| [engine.md](engine.md) | Engine and rules-system responsibilities, space (maps, movement, line of sight), rounds, choices, requirements, effects, events, errors |
| [systems/README.md](systems/README.md) | Rules-system contract and implemented systems |
| [systems/quest.md](systems/quest.md) | Quest rules, sheet, statistics, adaptations, values to confirm |
| [systems/cadmium.md](systems/cadmium.md) | Cadmium, the default system: relation to Quest, modules `armor` and `stash` |
| [data-model.md](data-model.md) | Users, push subscriptions, characters, campaigns, invitations, instances, schedules, events, state, deletion |
| [tools.md](tools.md) | Parser tools, `improvise`, parser and narrator contracts |
| [api.md](api.md) | Client operations, messages, errors, limits, HTTP and WebSocket binding |
| [setting-packs.md](setting-packs.md) | Setting pack file formats and the map format |
| [adventure-packs.md](adventure-packs.md) | Adventure pack file formats and trigger evaluation |
| [generation.md](generation.md) | Dungeon generator interface and grid pipeline |
| [spec/README.md](../spec/README.md) | JSON Schemas and the Content Compiler's interface and checks |
| [glossary.md](glossary.md) | Defined terms |

### Legal

| Document | Contents |
|---|---|
| [legal/terms.md](legal/terms.md) | Terms of Service, served at `/terms` |
| [legal/privacy.md](legal/privacy.md) | Privacy Policy, served at `/privacy` |

### Guides

| Document | Contents |
|---|---|
| [guides/engine-implementation.md](guides/engine-implementation.md) | Build order, module boundaries, conformance checklist, test strategy |
| [guides/setting-pack-authoring.md](guides/setting-pack-authoring.md) | Building a Quest setting pack from an empty directory |
| [guides/adventure-authoring.md](guides/adventure-authoring.md) | Building an adventure with one arc, two locations, and an NPC |
| [guides/running-a-campaign.md](guides/running-a-campaign.md) | Creating a campaign, inviting players, starting an instance, scheduling sessions |

### Runbooks

| Document | Use when |
|---|---|
| [runbooks/instance-recovery.md](runbooks/instance-recovery.md) | An instance is stuck, inconsistent, or corrupted |
| [runbooks/model-outage.md](runbooks/model-outage.md) | The parser or narrator model is failing or slow |
| [runbooks/content-publishing.md](runbooks/content-publishing.md) | Publishing or withdrawing a setting or adventure version |
| [runbooks/data-requests.md](runbooks/data-requests.md) | A user writes about their data instead of using Settings |
| [runbooks/content-reports.md](runbooks/content-reports.md) | Someone reports content that breaks the Terms of Service or appears to be illegal |

## Conventions

The key words MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY are used as defined in RFC 2119.

Schemas are JSON Schema draft 2020-12. Authoring files are YAML restricted to JSON-compatible values; JSON files are accepted wherever YAML is. Identifiers match `^[a-z][a-z0-9_]{0,63}$` unless stated otherwise. Dice expressions use `NdM`, `NdM+K`, or `NdM-K`.

## Repository layout

```
docs/                  this documentation
  decisions/           architecture decision records
  guides/              task-oriented walkthroughs
  runbooks/            operational procedures
  systems/             rules-system documents
  legal/               Terms of Service and Privacy Policy
systems/
  quest/               Quest rules data and JSON Schemas
  cadmium/             Cadmium rules data, module data, and JSON Schemas
spec/
  schema/              JSON Schemas for setting packs and maps
  examples/            example setting packs
design/                theme.css design tokens and explorations
briefs/                task briefs for agent sessions
AGENTS.md              instructions for agents working in this repository
LICENSE                MIT license for application code
LICENSES.md            licenses for documentation, schemas, and rules data
```

## Licenses

Documentation, schemas, examples, and design tokens are CC0 1.0. Rules data carries CC BY 4.0 with the attributions in each system's `NOTICE`. Application code is MIT. Fonts are SIL OFL, interface icons ISC, and content icons CC BY 3.0. See [LICENSES.md](../LICENSES.md).
