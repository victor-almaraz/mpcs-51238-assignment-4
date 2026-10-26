# AGENTS.md

Context for agents working in this repository: the Cadmium web application, a multiplayer text dungeon crawler. It implements the specification in [`cadmium-spec/`](cadmium-spec/); read [`cadmium-spec/AGENTS.md`](cadmium-spec/AGENTS.md) for the rules that govern implementing it. The work plan and handoff notes are in [SPRINTS.md](SPRINTS.md); gaps in the specification are in [SPEC_ISSUES.md](SPEC_ISSUES.md).

## Working rules

- Read the data model below before changing a table, an API operation, or an access check.
- Work on a branch. Run `pnpm check` (generated files, types, lint, tests, build) before every commit; there is no CI service, and Vercel runs only the build.
- Node.js runs through pnpm (`devEngines.runtime` in `package.json`): use `pnpm <script>` or `pnpm exec`, never a global `node`.
- Keys live in `.env.local`, which agents must not read or write. `.claude/settings.local.json` denies `Read` and `Edit` of `./.env` and `./.env.*`. Variable names are in [README.md](README.md#configuration).
- `cadmium-spec/` is the specification. A change there is a specification change and follows its own rules; see [README.md](README.md#specification-version).
- New migrations go in `supabase/migrations/`; the project owner applies them, and `/api/health` reports each one.

## Data model

Identity comes from Clerk. A Clerk user id is the primary key of `users`, and every row that belongs to a person carries that id in an owner column. Shared game data belongs to a campaign, and a person reaches it through membership.

| Table | Holds | Belongs to |
|---|---|---|
| `users` | Display name, time zone, reminder settings, terms acceptance, operator flag, account status | Itself: `id` is the Clerk user id |
| `characters` | A character's system, name, sheet, portrait, status, and whether it is archived | `owner_id` |
| `material_drafts` | Adventure drafts in the editor: the document, revision, diagnostics, and whether it is archived | `owner_id` |
| `push_subscriptions` | Browsers that receive reminders | `user_id` |
| `asset_uploads` | Portrait uploads, per uploader | `user_id` |
| `rsvps` | A member's answer to one session occurrence | `user_id` |
| `campaigns` | A campaign's title, system, modules, and invite link | `author_id`; members read it |
| `campaign_members` | Who belongs to a campaign, and their role | `user_id`, within `campaign_id` |
| `campaign_materials` | The settings and adventure a campaign plays | The campaign |
| `invitations` | Invitations by code or to a user | `inviter_id`, `invitee_user_id` |
| `instances` | One game: status, pinned materials, seed, and engine state | The campaign |
| `instance_characters` | Which characters play in a game | `user_id`, within `instance_id` |
| `events`, `commits`, `narrations` | A game's event log, committed inputs, and narration | The game |
| `input_logs` | Each player's typed inputs and the parser's result | `user_id`, within `instance_id` |
| `scheduled_sessions`, `session_exceptions` | A game's schedule and its moved or cancelled occurrences | The game; `created_by` |
| `bundles` | Published settings and adventures | `publisher_id`; listed bundles are public |
| `assets` | Art and portraits by content hash | `uploader_id` |
| `operator_log`, `rate_windows`, `scheduler_marks`, `cadmium_migrations` | Operator actions, rate limits, scheduler bookkeeping, applied migrations | The service |

The full schema is in `supabase/migrations/`; [`cadmium-spec/docs/data-model.md`](cadmium-spec/docs/data-model.md) specifies every record.

### Access

1. Clerk authenticates every request (`proxy.ts`). Pages under `app/(signed-in)/` call `auth.protect()`, so a signed-out visitor is sent to `/sign-in`.
2. The server knows who someone is from `signedInId()` in `lib/server/auth.ts`.
3. The server decides what they may see. Every operation in `lib/api/` starts with `caller()`, which rejects a signed-out or closed account, then checks ownership or membership. For example, `owned()` in `lib/api/drafts.ts` opens a draft only for its owner, and `cadmium_list_drafts` lists only the caller's drafts.
4. Supabase holds the data. Row-level security is on for every table, with no policies, and `anon` and `authenticated` have no grants, so browsers cannot read or write any table. The server is the only database client, with the service-role key, which stays on the server.
5. Realtime messages are the one exception: the policy on `realtime.messages` admits a signed-in member to their game's and their own channel only.

`e2e/isolation.e2e.ts` checks this end to end: two users sign in with Clerk, each saves a draft, and neither can list or open the other's.

## External API

The parser and narrator call Groq (`lib/models/groq.ts`) from the server only. The key is secret, the server applies its retry, timeout, and rate-limit handling, and a fallback keeps play going when Groq is down: direct actions still work and narration falls back to template text.

## Tests

| Command | Runs |
|---|---|
| `pnpm test` | Vitest: unit tests, test vectors, compiler fixtures, golden replays, specification validation, the API against an in-memory Postgres |
| `pnpm e2e` | Playwright against `next dev` with real Clerk sign-in, using `.env.local`. It needs the bundles published at `/admin` (a draft requires a setting), writes to the Supabase project those keys name, and deletes its drafts afterwards |
| `pnpm audit:ui` | The design and accessibility audit of the demo screens |
