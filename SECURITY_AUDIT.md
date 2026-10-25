# Security audit and debugging pass

Audit of the Cadmium application at the merge of the UI rework (`master` at `30ddd52`), covering authentication and authorization, the database, input limits, output encoding, secrets, headers, dependencies, and runtime behaviour in demo mode.

Severity scale: **Critical** (remote compromise or data exposure across users, exploitable now), **High** (cross-user impact with a realistic path), **Medium** (denial of service, defence-in-depth gaps with a plausible path, broken core flows), **Low** (hardening, narrow edge cases), **Info** (observations, no action required).

## Scope and method

- Every operation in `lib/api/*`, every server action in `lib/server/*-actions.ts`, the routes under `app/api/**` and the `/v1` binding, and every page under `app/` that reads the store.
- Every migration in `supabase/migrations/`: row-level security, grants, function privileges, `SECURITY DEFINER` functions, dynamic SQL.
- Upload and import paths: `/v1/assets` and the portrait action, the adventure ZIP import, the operator bundle upload, YAML parsing.
- Output encoding: `components/markdown.tsx`, every `dangerouslySetInnerHTML`, iCalendar output, response headers.
- Secrets: every `process.env` read and every `NEXT_PUBLIC_*` value.
- `pnpm audit` (report only).
- `pnpm check`; `pnpm demo` with `pnpm audit:ui --scheme light` and `--scheme dark`; manual flows in demo mode with paused, ended, and archived games, retired characters, revoked invitations, disabled invite links, several characters per player, and portraits at the size limit.

## Summary

No critical or high finding in application code or the database. The authorization model is consistent: every operation starts with `caller()` (terms, suspension, closing account), membership checks return `not_found` to non-members, ownership checks cover characters, drafts, push subscriptions, and deleted records, and the database grants nothing to `anon` or `authenticated`. Fixed: one medium denial-of-service path (ZIP bomb), one medium runtime crash (several characters in a started game), one medium broken flow (portraits near 1 MB), and several low-severity hardening items. Open items needing a decision are listed under [Decisions](#decisions).

| Check | Result |
|---|---|
| `pnpm check` | Passes (typecheck, lint, 915 tests, build) |
| `pnpm audit:ui --scheme light` | 31 screens, 0 findings |
| `pnpm audit:ui --scheme dark` | 31 screens, 0 findings |
| `pnpm audit` | 5 advisories, all in `dompurify` 3.4.15 under `monaco-editor` (see S-11) |

## Fixed findings

| ID | Severity | Location | Scenario | Fix |
|---|---|---|---|---|
| S-1 | Medium | `lib/api/drafts.ts`, `importDraft` | A signed-in user uploads a ZIP of a few kilobytes whose deflated entry unpacks to gigabytes. `inflateRawSync` had no output limit, so the function exhausts memory and fails for every request it serves. The 2 MB draft limit of `save_draft` did not apply to imports. | Unpacked output capped at 8 MB in total through `maxOutputLength`, at most 500 files, and the imported draft held to the 2 MB limit of `save_draft`. Test: `lib/api/drafts.test.ts`. |
| D-1 | Medium | `lib/api/instances.ts`, `getInstance` | A player adds a second character to a paused game. The lobby, play, history, and schedule pages call `get_instance` without `character_id`, which threw `invalid_request` for a player with several characters, so every page of that game showed the server error page. | Without `character_id`, `get_instance` returns the instance without `view` when the caller has zero or several characters (`view` is optional in api.md, Instances). Test: `lib/api/play.test.ts`. |
| D-2 | Medium | `next.config.ts`; `lib/server/actions.ts`, `uploadPortraitAction` | A portrait may be up to 1 MB, but server actions accept 1 MB bodies including the multipart framing, so portraits close to the limit were refused by Next.js with a generic error before the action ran. | `experimental.serverActions.bodySizeLimit` set to `2mb`. Verified in demo mode: a 985 KB PNG uploads, and a 1.08 MB PNG gets the app's own "at most 1 MB" message. |
| S-2 | Low | `lib/api/http.ts`, `handle` | `/v1` accepts the Clerk session cookie, and a body is parsed as JSON under any content type, including `text/plain`. Clerk's `SameSite=Lax` cookie blocks cross-site writes today; nothing in the app did. | Writes (`POST`, `PUT`, `PATCH`, `DELETE`) without a bearer token are refused with `forbidden` when `Sec-Fetch-Site` is `cross-site` or `Origin` names another host than `x-forwarded-host`/`host` (the comparison Next.js makes for server actions). Requests without `Origin` and bearer-token callers are unaffected. Test: `lib/api/http.test.ts`. |
| S-3 | Low | `next.config.ts`, `headers` | Pages could be framed by any site (clickjacking on one-click controls such as Accept invitation, End, Delete), and responses carried no `nosniff`. | Added `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'` (except on asset paths, which keep their own sandboxing policy, now with `frame-ancestors 'none'` added), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` (invite and feed codes travel in paths), and a `Permissions-Policy` turning off camera, microphone, and geolocation. |
| S-4 | Low | `lib/api/drafts.ts`, `exportDraft` | An unpublished draft's `adventure.id` is free text until publication. Export used it as the ZIP folder and the `Content-Disposition` filename, so an id such as `../x"` produced path traversal entries in the user's own archive, and an id with CR/LF made the response fail. | The id is used only when it is a valid material id; otherwise the draft's `material_id`. Test: `lib/api/drafts.test.ts`. |
| S-5 | Low | `lib/scheduler/ics.ts`, `text` | `";"` was written as `"\;"`, a JavaScript string equal to `";"`, so semicolons in titles and notes were not escaped (RFC 5545, 3.3.11). A lone CR passed through unescaped, which some calendar readers take as a line end, letting a session's author add properties such as `ATTENDEE` to members' calendars. | Semicolons escaped; CRLF, CR, and LF all written as `\n`. Test: `lib/scheduler/ics.test.ts`. |
| S-6 | Low | `lib/server/schedule-actions.ts`, `createFeedAction` | With neither `CALENDAR_FEED_KEY` nor `SUPABASE_SERVICE_ROLE_KEY` set, the feed secret was an HMAC under the empty key, computable from the user id alone. | The action refuses with "Calendar feeds are not configured." when no key is set, as `/v1` already did. |
| S-7 | Low | `lib/server/campaign-actions.ts`, `instanceControlAction` | The control name indexed an object literal, so `control=constructor` or `toString` found `Object.prototype` members and called them. Harmless today, fragile. | Only own keys of the control table are accepted. |
| D-3 | Low | `app/(signed-in)/instances/[id]/history/page.tsx` | `?after=1.5` failed `get_history`'s integer validation and showed the server error page. | `after` is floored and clamped to a safe integer. |
| D-4 | Low | `lib/api/http.ts`, `match`; `app/invite/[code]`, `app/join/[code]`; `lib/server/pages.ts`, `decoded` | A malformed percent escape in a path segment threw `URIError`, a 500. Next.js answers 400 before the app runs in the cases tried, so this is defence in depth. | Malformed escapes match nothing. Test: `lib/api/http.test.ts`. |
| S-8 | Low | `lib/api/account.ts`, `addPushSubscription` | `keys.p256dh` and `keys.auth` had no length limit. | Limited to 200 and 100 characters (the real values are 87 and 22). |

## Decisions

Items that need the user's decision, a migration, or a dependency change. Nothing below was changed.

### S-9 (Low): Supabase default privileges and a latent unprotected table

Supabase grants `anon` and `authenticated` all privileges on new tables, sequences, and functions in `public`. Each migration revokes them explicitly, so today nothing is exposed (all 23 tables have RLS on, no policies, no grants; every `cadmium_*` function is executable only by `service_role`). A future migration that forgets the revoke block would expose its table through PostgREST to anyone holding the publishable key. `lib/store/migrate.ts` creates `cadmium_migrations` without RLS or revokes; it runs only against PGlite in tests today, and production is set up from `supabase/fresh.sql`, which does not create that table.

Proposed migration, for the user to apply in the SQL Editor if wanted:

```sql
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public;
revoke all on sequence operator_log_id_seq from anon, authenticated;
revoke execute on function bundles_immutable() from public, anon, authenticated;
```

### S-10 (Low): Realtime and the calendar feed ignore suspension

`realtime_may_receive` (`supabase/migrations/20261023000400_coordinator.sql:152`) admits any member of the instance's campaign, including suspended users and members of soft-deleted campaigns, for as long as their Clerk token is valid. `cadmium_user_by_feed` checks `status = 'active'` but not `suspended_at`, so a suspended user's calendar feed keeps working. Whether suspension should cut live delivery and feeds is a policy question (`SPEC_ISSUES.md#account-suspension` lets a suspended account read its own data). If it should, a new migration replaces both functions with `and u.suspended_at is null` and, for Realtime, `and c.deleted_at is null`. Also confirm in the Supabase dashboard that Realtime allows private channels only; that setting is not in the repository.

### S-11 (Info, dependency): `dompurify` advisories

`pnpm audit` reports one critical, one high, and three low advisories, all in `dompurify` 3.4.15, pulled in by `monaco-editor` (also via `monaco-yaml`). They concern `IN_PLACE` sanitization with hooks, `SAFE_FOR_TEMPLATES` with shadow roots, and the XHTML parser mode; Monaco does not use those modes for its hover and markdown rendering, and the editor renders only the author's own draft, so exploitability here is low. Proposed fix for the user to run: add a pnpm override in `pnpm-workspace.yaml` (`overrides: { dompurify: ">=3.4.17" }`) and `pnpm install`, or update `monaco-editor` once a release depends on a patched version.

### S-12 (Low): Push endpoint accepts any HTTPS URL

`add_push_subscription` stores any `https://` endpoint, and the Scheduler later POSTs encrypted payloads to it: a blind server-side request to a host of the user's choosing. Impact is small (fixed method, encrypted body, no response read). Restricting endpoints to the push services browsers use (`fcm.googleapis.com`, `updates.push.services.mozilla.com`, `web.push.apple.com`, `*.notify.windows.com`) closes it but may refuse a less common browser. There is also no limit on subscriptions per user.

### S-13 (Info): `/api/health` is public

It reports whether each Supabase setting is present and which migrations are applied; values and errors are never shown. Each call runs eleven RPCs. Options: keep as is, return only the overall status to anonymous callers, or require `CRON_SECRET`.

### S-14 (Info): Server actions are not rate limited

The `/v1` binding limits each user to 120 requests a minute; server actions, which call the same operations, have no limit. Paths of note: `enterCodeAction` previews invitation codes without sign-in (100-bit codes, so guessing is infeasible), and `inputAction` reaches the parser model (one input in processing per character at a time). Adding `store.rateHit` to `attempt()` in `lib/server/forms.ts` would apply the same limit everywhere.

### S-15 (Info): Calendar feed key falls back to the service role key

`CALENDAR_FEED_KEY` defaults to `SUPABASE_SERVICE_ROLE_KEY` as the HMAC key. This does not leak the key, but rotating the service role key then invalidates every feed URL, and one secret serves two purposes. Setting a dedicated `CALENDAR_FEED_KEY` in Vercel is recommended.

### D-5 (Low): Schedule of an ended game still takes answers

After a game ends, `/instances/[id]/schedule` still lists its future sessions with RSVP buttons and "Change this session", although the Scheduler, reminders, and calendar feeds ignore ended games. `schedule_session` refuses an ended game; `update_session`, `move_occurrence`, and `rsvp` do not. Options: cancel a game's sessions when it ends, or show them read-only with a notice. The specification does not say which.

### D-6 (Info): No character switch on the play page

A player with several characters in one game plays the first one; the play page accepts `?character=<id>` but offers no control to switch.

## Verified as sound

- **Authorization.** Campaign, instance, session, invitation, and history operations check membership; author-only operations check the role; characters, drafts, push subscriptions, and deleted records check ownership. Non-members get `not_found`. Operator operations return `not_found` to non-operators and are logged. Ids posted in forms are re-checked by the operation they reach.
- **Server actions** run through `attempt()`, which takes the user from the Clerk session, never from the form. Next.js rejects actions whose `Origin` differs from the host.
- **Cron routes** require `Authorization: Bearer $CRON_SECRET`; the Clerk webhook verifies its signature.
- **Database.** Every table has RLS on with all grants revoked from `anon` and `authenticated`; the server uses only the service role. No dynamic SQL is built from parameters. The one `SECURITY DEFINER` function pins `search_path` and reads only the caller's own `sub`. History returns only events marked shared, so players do not see hidden events.
- **Codes and secrets.** Invitation codes carry 100 bits and are stored as SHA-256 hashes; invite link codes carry 60 bits behind sign-in and the per-user rate limit; feed secrets carry 192 bits, are stored as hashes, and are rate limited per feed. Codes come from `crypto.getRandomValues`.
- **Client exposure.** Only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_CADMIUM_DEMO`, `NEXT_PUBLIC_CLERK_TELEMETRY_DISABLED`, and the VAPID public key reach the browser. Demo mode cannot turn on in a production build or on Vercel.
- **Output encoding.** `components/markdown.tsx` renders trusted legal and licence files through React, so text is escaped, and keeps only `http(s)` links. The two `dangerouslySetInnerHTML` scripts in `app/layout.tsx` are constants. Assets are served with a sandboxing CSP and `nosniff`; portraits are PNG or WebP only, checked by their bytes.
- **YAML.** The `yaml` package limits alias expansion by default.
- **Indexing.** `X-Robots-Tag: noindex, nofollow` remains on every response; legal pages stay offline.
