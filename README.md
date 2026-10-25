# Cadmium

The web application for Cadmium, a multiplayer text dungeon crawler run by software. The specification lives in [`cadmium-spec/`](cadmium-spec/); start with [`cadmium-spec/AGENTS.md`](cadmium-spec/AGENTS.md) and [`cadmium-spec/docs/README.md`](cadmium-spec/docs/README.md). The specification is the requirement. Changes to `cadmium-spec/` are specification changes and follow its own rules; see [Specification version](#specification-version).

The work is planned in [SPRINTS.md](SPRINTS.md). Gaps in the specification found during implementation are recorded in [SPEC_ISSUES.md](SPEC_ISSUES.md).

## Stack

Next.js (App Router), TypeScript in strict mode, Tailwind CSS, Clerk, Supabase, Vercel, and Groq, as listed in [`app-flow.md`](cadmium-spec/docs/app-flow.md#stack). Schemas are validated with Ajv (`Ajv2020`), YAML is read with `yaml` as YAML 1.2, and tests run on Vitest.

## Setup

Requires [pnpm](https://pnpm.io) 12. pnpm downloads the Node.js version pinned in `package.json` (`devEngines.runtime`), so no separate Node.js install is needed; run tools through `pnpm`.

```bash
pnpm install
```

```bash
pnpm dev
```

## Configuration

The server reads these variables, from `.env.local` locally and from the Vercel project's settings when deployed:

| Variable | Secret | Use |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | no | Clerk in the browser |
| `CLERK_SECRET_KEY` | yes | Clerk on the server |
| `NEXT_PUBLIC_SUPABASE_URL` | no | The Supabase project |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | no | Browser access to Supabase; it cannot reach the store |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | The store, on the server only: the Supabase secret key (`sb_secret_…`) or legacy service-role key |
| `CLERK_WEBHOOK_SIGNING_SECRET` | yes | Verifies Clerk's webhook at `/api/webhooks/clerk` |
| `EXPLORATION_ROUND_TIMEOUT` | no | Seconds an exploration round waits before advancing; default 120, 0 disables |
| `COMBAT_TURN_TIMEOUT` | no | Seconds a combat round or turn waits; default 60, 0 disables |
| `GROQ_API_KEY` | yes | The parser and narrator; without it, text input is unavailable and narration is template text |
| `GROQ_PARSER_MODEL`, `GROQ_NARRATOR_MODEL` | no | Groq model ids; default `qwen/qwen3.8-27b`, asked for no reasoning |
| `GROQ_REASONING_EFFORT` | no | Reasoning effort for GPT-OSS models: `low` (default), `medium`, or `high`. Qwen models are asked for no reasoning |
| `PARSER_TIMEOUT`, `NARRATOR_TIMEOUT` | no | Seconds before a model call falls back; defaults 8 and 10 |
| `PARSER_ENABLED`, `NARRATOR_ENABLED` | no | `0` disables one adapter while keeping the other (runbooks/model-outage.md) |
| `ACTION_MENU_MODE` | no | `1` sends every character an action menu at each round and turn start |
| `CRON_SECRET` | yes | Authorizes calls to the scheduler at `/api/cron/scheduler` (Vercel Cron sends it as a bearer token) |
| `CALENDAR_FEED_KEY` | yes | Derives calendar feed secrets; the service key is used when unset |
| `SHUTDOWN_AT` | no | The end-of-course shutdown time (ISO 8601): a banner from 14 days before, the closed notice from then, the purge 90 days after |
| `CONTACT_EMAIL` | no | Overrides the contact address on the closed notice; the default is the address in the Terms and Privacy Policy |
| `VAPID_PUBLIC_KEY` | no | The Web Push public key: Settings offers browser notifications when it is set |
| `VAPID_PRIVATE_KEY` | yes | With the public key, the scheduler sends reminders by Web Push; generate the pair with `pnpm exec web-push generate-vapid-keys` |
| `VAPID_SUBJECT` | no | The contact push services see, a `mailto:` or `https:` URL; default `mailto:` the contact address |

`GET /api/health` reports `status` (`ok`, `incomplete`, or `unconfigured`) to anyone. With `Authorization: Bearer $CRON_SECRET` it also reports which settings are set, whether Web Push is configured (`settings.webPush`), and each migration's state, without revealing values.

### Database schema

The migrations in `supabase/migrations/` create the store's tables and functions, and restrict both to the service role. Apply them in file-name order by pasting each file into the Supabase SQL Editor. Each file applies once; `/api/health` then reports `"status": "ok"`.

### Realtime

Instance and user messages travel on Supabase Realtime private channels, `instance:{id}` and `user:{id}`, admitted by the policy in the fifth migration. Browsers authenticate with their Clerk session token, which Supabase accepts once Clerk is added under Authentication, Third-party auth in the Supabase dashboard (and Supabase is enabled under Integrations in the Clerk dashboard).

### Materials

A fresh database has no settings or adventures. As an operator (`update users set operator = true where email = '…'`), run `pnpm bundles` and upload the five files in `bundles/` at `/admin`, in their numbered order, settings before the adventure.

### Clerk webhook

Clerk keeps the `users` table current through a webhook endpoint at `https://<host>/api/webhooks/clerk`, subscribed to `user.created`, `user.updated`, and `user.deleted`. Its signing secret is `CLERK_WEBHOOK_SIGNING_SECRET`. A signed-in user without a row is created on first request, so a missed delivery is repaired on the next visit.

## Scripts

| Script | Job |
|---|---|
| `pnpm dev` | Development server |
| `pnpm build` | Production build |
| `pnpm gen` | Regenerate `lib/bundle/schemas.generated.ts` and `lib/bundle/types/` from the specification |
| `pnpm gen:check` | Regenerate and fail if the generated files differ from the committed ones |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest: unit tests, test vectors, and specification validation |
| `pnpm check` | Every gate: `gen:check`, `typecheck`, `lint --max-warnings 0`, `test`, and `build` |
| `pnpm materials check DIR` | The Content Compiler's `check` subcommand |
| `pnpm harness play ...` | The engine's command-line harness; see `lib/harness/cli.ts` |
| `pnpm golden` | Rewrite the golden scenario files after an intended behaviour change |
| `pnpm bundles` | Build the bundles to publish on a fresh deployment (example settings, Quest Quick Start, Lantern Coast, the exemplar Sunken Archive) into `bundles/` |
| `pnpm eval:parser` | Run the parser evaluation set against the Groq model; needs `GROQ_API_KEY` (read from `.env.local` when present); exits 1 below 90% exact match or on an overreach violation |
| `pnpm agent:run` | Play the exemplar to each ending with a Groq player model and the parser; logs go to `agent-runs/` |
| `pnpm sim` | The balance simulation of the exemplar's fights; writes `tools/sim/REPORT.md` |
| `pnpm demo` | `next dev` on port 3100 in demo mode: signed in as a fixture user against an in-memory database, without Clerk, Realtime, or Groq; `/` lists every screen |
| `pnpm screens` | Screenshot every demo screen, wide and narrow, into `screenshots/` with the installed Chrome (run `pnpm demo` first) |
| `pnpm audit:ui` | Design and accessibility audit of every demo screen, and of the editor's arc graph and YAML view, at 1280 and 390 px into `screenshots/audit.md` (run `pnpm demo` first); `--scheme dark` for the dark theme, `--screens REGEX` for the screens whose path matches |
| `pnpm db:fresh` | Write `supabase/fresh.sql`: delete every Cadmium table and function and apply every migration, in one transaction |

The Content Compiler's command line follows [`spec/README.md`](cadmium-spec/spec/README.md#compiler-interface). pnpm prints the script line on stdout, so run `build` directly when its output is piped:

```bash
pnpm exec tsx lib/materials/cli.ts build -o bundle.json cadmium-spec/spec/examples/derelict_station
```

Vercel deploys from GitHub and runs `pnpm build` only. Run `pnpm check` before every commit; it is the gate that the specification's CI requirement describes.

## Layout

| Path | Contents |
|---|---|
| `cadmium-spec/` | The specification: documents, JSON Schemas, example packs, rules data, design tokens |
| `app/` | Next.js routes and pages |
| `lib/rng/` | `splitmix64_v1` draws, dice, selection by RNG, `fnv1a64` |
| `lib/grid/` | Map parsing, distance, adjacency, line of sight, pathfinding, movement allowance |
| `lib/generator/` | Dungeon generator: BSP layout, doors and locks, roles, population, verification |
| `lib/engine/` | The engine: `submit`, `advance`, `startInstance`, and views |
| `lib/harness/` | Command-line harness, scripted scenarios, and golden logs |
| `lib/store/` | The store: bundles, instances, atomic commits, events, inputs, narration, as SQL functions called through an `Rpc` (supabase-js in production, PGlite in tests) |
| `lib/api/` | Operations of api.md: users and the terms gate, systems, materials, characters, campaigns, invitations, instances and play; `http.ts` is the `/v1` binding |
| `lib/server/` | Server-only configuration, the service-role Supabase client, the session user, and server actions |
| `docs/design/` | The application's pattern library, which replaces the specification's Margin design |
| `components/ui/` | The shared interface components of the pattern library |
| `components/editor/` | The adventure editor: sections, the map editor, YAML views |
| `components/` | Feature components; `systems/` holds creation forms, sheet views, and stats editors registered by rules-system id |
| `lib/coordinator/` | The Instance Coordinator: serialized commits, round deadlines, messages; the operator operations `replay_instance` and `restore_instance` |
| `lib/broadcast/` | Realtime broadcast from the server, and browser subscriptions delivered in version order |
| `lib/map/` | Play maps as drawing operations with click targets, and their canvas painter |
| `lib/models/` | The Groq client over its HTTP API |
| `lib/parser/` | Parser context, per-input tool definitions, the Parser Adapter, and the evaluation set |
| `lib/narrator/` | Narrator context, the Narrator Adapter, and template narration |
| `lib/scheduler/` | Time zones, occurrence expansion, iCalendar, and the scheduler run |
| `lib/notifier/` | Session reminders on the user channel |
| `lib/export/` | The ZIP writer for data exports |
| `lib/ops/` | The shutdown phases |
| `supabase/migrations/` | SQL migrations, applied by Supabase in production and by PGlite in tests |
| `lib/systems/` | Rules-system contract, registry, implementations, and the reusable conformance suite in `testing/` |
| `lib/bundle/` | Schema registry and generated types; generated files are never edited by hand |
| `lib/materials/` | Content Compiler: pack reading, schema explanations, rules-system, cross-reference, map, and art checks, bundles, and the `materials` command line |
| `scripts/` | Build-time scripts, such as type generation |
| `materials/` | Material packs shipped with the application: `quest_starter` (the Quest Quick Start abilities, CC BY 4.0). The exemplar `sunken_archive` and its setting `lantern_coast` are specification examples in `cadmium-spec/spec/examples/` |
| `docs/exemplar/` | The exemplar's report: coverage, validation passes, walkthroughs, and departures from the draft |
| `tools/sim/` | The balance simulation |
| `public/fonts/` | Libertinus Serif (SIL Open Font License, `OFL.txt`) for story text |
| `tests/` | Tests that span modules, such as specification validation |

Modules under `lib/` follow the boundaries in [`engine-implementation.md`](cadmium-spec/docs/guides/engine-implementation.md#module-boundaries). `rng`, `grid`, `generator`, and `engine` perform no I/O.

## Specification version

`cadmium-spec/` is a copy of the specification at commit `54f4adcdffe5bf3c8547a5c89a9f55fefbeb2fef` with one change applied: the exemplar of `briefs/example-adventure.md`, which adds `spec/examples/lantern_coast` and `spec/examples/sunken_archive` and updates `spec/README.md`, `AGENTS.md`, `docs/adventure-packs.md`, and `docs/guides/adventure-authoring.md`. That change belongs in the specification repository. The copy becomes a git submodule, pinned to a commit that contains the change, when the specification repository's URL is available. Updating the specification is its own change, with the specification diff summarized.

## License

Application code: MIT. The specification's licenses are in [`cadmium-spec/LICENSES.md`](cadmium-spec/LICENSES.md).
