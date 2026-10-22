# Client API

The client API is defined as transport-independent operations and messages. A binding maps operations to a transport. This document defines the operations, then a reference binding to HTTP and WebSocket with complete examples.

## Authentication

`register`, `login`, `preview_invitation`, and the calendar feed are the only operations that do not require authentication. `login` returns an opaque bearer token. Every other operation carries the token. The calendar feed is authorized by the secret in its URL.

| Property | Value |
|---|---|
| Token format | Opaque string. Clients MUST NOT parse it. |
| Lifetime | 30 days from issue, deployment-configurable. |
| Revocation | `logout` revokes the presented token. Changing credentials revokes every token for the user. |
| Storage | The server stores a hash of the token, not the token. |

Passwords are 10–128 characters. The server stores them only as a hash from a memory-hard function.

## Conventions

- Requests and responses are JSON objects.
- Ids are opaque strings. Timestamps are UTC ISO 8601.
- Fields marked `?` are optional in requests and MAY be absent in responses.
- Unknown request fields are rejected with `invalid_request`.
- Every operation except `get_me`, `accept_terms`, and `logout` fails with `forbidden` until the user has accepted the current Terms of Service version.
- A user whose `status` is `closing` may call only `get_me`, `restore_account` (within 30 days of the deletion request), `export_my_data`, and `logout`.
- Failed operations return an error object:

  ```json
  { "error": { "code": "conflict", "detail": "campaign is not in lobby" } }
  ```

### Error codes

| Code | Meaning |
|---|---|
| `unauthenticated` | Missing, expired, or revoked token; wrong credentials at `login`. |
| `forbidden` | The user is a campaign player but lacks the required role. |
| `not_found` | The record does not exist, or the user may not see it. |
| `conflict` | The record's state does not allow the operation. |
| `system_mismatch` | A character or material is written for a different rules system or an incompatible system version. |
| `invalid_request` | The request fails its schema or a field constraint. |
| `rules_rejected` | The rules system rejected character choices. The error includes the system's code and detail. |
| `rate_limited` | The request exceeds a limit. The error includes `retry_after_ms`. |
| `unavailable` | A dependency is unavailable. The request MAY be retried. |

`not_found` is returned instead of `forbidden` when the user is not a player of the campaign that owns the record.

### Idempotency

`submit_input` and `submit_action` require an `idempotency_key`: a client-generated string of 8–64 characters, unique per user per campaign. A repeated key returns the original result without reprocessing.

## Objects

### User

```json
{ "id": "u_3", "email": "vale@example.org", "display_name": "Vale", "timezone": "Europe/Berlin",
  "reminders": { "push": true, "lead_minutes": [1440, 15] }, "created_at": "2026-10-01T18:00:00Z" }
```

`email`, `timezone`, and `reminders` are included only for the user themself. Other users see a user only as a campaign member: `id` and `display_name`.

### System

```json
{ "id": "cadmium", "version": "1.0.0", "title": "Cadmium", "derived_from": "quest", "accepts": ["cadmium", "quest"],
  "modules": [ { "id": "armor", "title": "Armor" }, { "id": "stash", "title": "Stash" } ],
  "credit": "Derived from Quest by The Adventure Guild, LLC, under CC BY 4.0. Not endorsed by The Adventure Guild.",
  "pending_confirmation": ["ap_award_per_session", "npc_templates", "setbacks", "spatial"] }
```

`pending_confirmation` lists rule values not yet verified against the source text. See [systems/README.md](systems/README.md#data-and-confirmation).

### Material

```json
{ "kind": "setting", "id": "derelict_station", "version": "3.0.0", "title": "Derelict Station",
  "system": "quest", "system_versions": "^1.0" }
```

Adventures add `requires_settings` and `players`.

### Character

```json
{
  "id": "c_17", "owner_id": "u_3", "name": "Vale",
  "system": "quest", "system_version": "1.1.0",
  "status": "in_instance", "instance_id": "i_7",
  "sheet": {
    "name": "Vale", "role": "spy",
    "hp": { "value": 10, "max": 10 }, "ap": 10,
    "abilities": ["base:a1", "base:a2", "base:a3", "base:a4", "base:a5", "base:a6"],
    "inventory": [ { "ref": "base:wrench" } ], "status": "active", "profile": {}
  },
  "summary": { "health": "10/10 HP", "status": "active", "resources": { "AP": "10" } }
}
```

`sheet` follows the system's `character` schema and is included only for the owner. Other members of a shared campaign receive `id`, `name`, `system`, `status`, and `summary`.

### Campaign

```json
{
  "id": "k_41", "title": "The Sunken Archive", "description": "A salvage crew goes below.",
  "author_id": "u_3", "system": "quest", "system_versions": "^1.0", "archived": false,
  "materials": [
    { "kind": "setting", "id": "derelict_station", "version": "3.0.0" },
    { "kind": "adventure", "id": "sunken_archive", "version": "2.0.0" }
  ],
  "members": [ { "user_id": "u_3", "display_name": "Vale", "role": "author" },
               { "user_id": "u_8", "display_name": "Rook", "role": "player" } ],
  "instance_ids": ["i_7"],
  "created_at": "2026-10-02T19:00:00Z"
}
```

`invite_link_code` is included only for the author.

### Instance

```json
{
  "id": "i_7", "campaign_id": "k_41", "name": "Tuesday group",
  "system": "quest", "system_version": "1.1.0",
  "materials": [ { "kind": "setting", "id": "derelict_station", "version": "3.0.0" },
                 { "kind": "adventure", "id": "sunken_archive", "version": "2.0.0" } ],
  "status": "active", "version": 128,
  "characters": [ { "id": "c_17", "user_id": "u_3", "name": "Vale" },
                  { "id": "c_22", "user_id": "u_8", "name": "Rook" } ],
  "next_session": { "session_id": "s_2", "starts_at": "2026-10-27T18:00:00Z" },
  "created_at": "2026-10-02T19:05:00Z", "started_at": "2026-10-02T19:10:00Z", "ended_at": null, "ending": null
}
```

### Invitation

```json
{ "id": "inv_5", "campaign_id": "k_41", "campaign_title": "The Sunken Archive",
  "inviter": { "user_id": "u_3", "display_name": "Vale" },
  "note": "for Rook", "instance_id": "i_7",
  "message": "Join us Tuesdays.", "status": "pending",
  "created_at": "2026-10-03T10:00:00Z", "expires_at": "2026-10-17T10:00:00Z" }
```

`note` is included only for campaign members. The invitation code is returned once, by `invite`; the server stores only its hash.

### Scheduled session

```json
{ "id": "s_2", "instance_id": "i_7", "title": "Weekly game",
  "starts_at": "2026-10-20T18:00:00Z", "timezone": "Europe/Berlin", "duration_minutes": 180,
  "recurrence": { "freq": "weekly", "interval": 1, "count": 10 },
  "auto_resume": true, "auto_pause": true, "notes": "", "status": "scheduled" }
```

### Occurrence

```json
{ "session_id": "s_2", "occurrence_start": "2026-10-27T18:00:00Z", "starts_at": "2026-10-27T18:00:00Z",
  "ends_at": "2026-10-27T21:00:00Z", "status": "scheduled",
  "rsvps": { "yes": ["u_3"], "no": [], "maybe": ["u_8"] } }
```

`occurrence_start` identifies the occurrence and does not change when the occurrence is moved; `starts_at` is the effective start. `status` is `scheduled`, `moved`, or `cancelled`.

### View

The state of an instance visible to one of the requesting user's characters. Visibility follows the rules for [parser context](tools.md#parser-context). The view adds the character's full sheet, its pending choice if any, each party member's name, room, cell, and summary, and the map of the character's location as far as the party has seen it.

```json
{
  "character_id": "c_17",
  "mode": "exploration",
  "round": { "number": 4, "resolution": "simultaneous", "declared": ["c_22"], "waiting_on": ["c_17"] },
  "character": { "id": "c_17", "location": "dock", "room": "hangar", "at": [7, 2], "sheet": { }, "summary": { },
                 "currencies": [ { "flag": "purse", "label": "credits", "amount": 12,
                                   "coins": [ { "id": "scrip", "label": "scrip", "count": 1 }, { "id": "credit", "label": "credit", "count": 2 } ] } ] },
  "pending_choice": null,
  "room": { "id": "hangar", "label": "hangar", "tags": ["large", "flooded"] },
  "map": {
    "location": "dock",
    "rows": ["################", "#....#.........#", "#..............#", "#....#.........#", "#....#.........#", "################"],
    "terrain": { "floor": { "label": "floor" }, "wall": { "label": "wall" } },
    "legend": { ".": "floor", "#": "wall", " ": "void" },
    "rooms": [ { "id": "airlock", "label": "airlock", "area": [[1, 1, 4, 4]] },
               { "id": "hangar", "label": "hangar", "area": [[5, 2, 1, 1], [6, 1, 9, 4]] } ],
    "links": [ { "id": "x_lift", "label": "lift", "at": [14, 2] } ],
    "light": ["0000000000000000", "0111100000000000", "0111122222220000", "0111100000000000", "0111100000000000", "0000000000000000"]
  },
  "destinations": [ { "id": "x_lift", "label": "lift", "kind": "link", "distance": 7, "direction": "east" } ],
  "visible": [ { "id": "e_panel", "label": "control panel", "kind": "fixture", "at": [13, 1], "footprint": [1, 1],
                 "distance": 6, "direction": "east", "in_reach": false },
               { "id": "lift_door", "label": "bulkhead", "kind": "door", "at": [14, 2], "open": false,
                 "distance": 7, "direction": "east", "in_reach": false } ],
  "party": [ { "id": "c_22", "name": "Rook", "room": "airlock", "at": [2, 3], "summary": { } } ]
}
```

`character.currencies` lists the character's currency flags, the only flags a view contains, with the amount broken into coins from the largest denomination down. `map.rows` replaces every cell the party has not seen with a space. `map.light` gives the illumination of each cell the party perceives at this version: `2` bright, `1` dim, `0` dark or not perceived. Entities appear only in `visible` and `party`, at their current cells. `map` contains no locks, hidden entities, or unseen rooms.

## Operations

### Users

| Operation | Input | Output |
|---|---|---|
| `register` | `email`, `password`, `display_name` | `user` |
| `login` | `email`, `password` | `token`, `user` |
| `logout` | none | none |
| `get_me` | none | `user`, `character_ids[]`, `active_campaign_ids[]`, `authored_campaign_ids[]` |
| `update_me` | `display_name?`, `email?`, `timezone?`, `reminders?`, `password?`, `current_password` | `user` |
| `accept_terms` | `version` | `user` |
| `export_my_data` | none | ZIP; see [Data export](#data-export) |
| `request_account_deletion` | `confirm` (the user's display name) | `{ restorable_until, purge_after }`: 30 and 90 days after the request |
| `restore_account` | none | `user`; allowed within 30 days of the deletion request |
| `get_push_key` | none | `{ public_key }`: the deployment's VAPID public key |
| `add_push_subscription` | `endpoint`, `keys` (`p256dh`, `auth`), `label` | `push_subscription` |
| `list_push_subscriptions` | none | `push_subscription[]` |
| `remove_push_subscription` | `subscription_id` | none |
| `get_calendar_feed` | none | `{ url }` or `{ url: null }` when disabled |
| `rotate_calendar_feed` | none | `{ url }` with a new secret; the previous URL stops working |
| `disable_calendar_feed` | none | none; the URL stops working |

`update_me` with `email` changes the sign-in address after the identity provider verifies it. Every field a user entered can be changed with `update_me`, `update_character`, `save_draft`, `update_campaign`, `update_session`, `rsvp`, or `revoke_invitation`, and every record a user owns can be deleted with the matching `delete_` operation or `request_account_deletion`.

#### Data export

`export_my_data` returns a ZIP containing every record that refers to the user, in JSON, with drafts also as adventure directories of YAML files:

| File | Contents |
|---|---|
| `README.txt` | What each file contains |
| `profile.json` | User record, terms acceptance, reminder settings, push subscriptions (labels and creation times), calendar feed state |
| `characters/*.json` | Every character, with sheet and status |
| `assets/*` | Every image the user uploaded, with its record |
| `drafts/<id>/` | Every draft, as YAML files and as the draft document |
| `adventures/*.json` | Every published bundle |
| `campaigns/*.json` | Campaigns authored, with members, invitations, instances, events, input logs, narration, and schedules |
| `memberships.json` | Campaigns joined, with role and join time |
| `inputs.json` | The user's input log rows in every instance, with the events and narration of each commit they caused |
| `invitations.json` | Invitations created or accepted by the user |
| `schedule.json` | RSVPs and sessions created by the user |

The export is generated on request and is not stored.

### Systems and materials

| Operation | Input | Output |
|---|---|---|
| `list_systems` | none | `system[]` |
| `get_system_schema` | `system`, `kind` (`character`, `creature`, `item`, `ability`, `check`, `structure`), `modules?` | JSON Schema of the system configured with `modules` |
| `get_asset` | `hash` | The image bytes, with `Content-Type` and long-lived caching. Alt text and credits travel in the records that refer to the asset. |
| `list_materials` | `system?`, `kind?`, `owner?` (`me`) | `material[]` |

Listings return the latest listed version of each `operator` material (settings and example adventures installed with Cadmium) and the user's own published adventures. Adventures published by other users are never listed; players reach them only by invitation to a campaign. Operators publish setting packs with [administrative operations](#administrative-operations).

### Adventure drafts

| Operation | Input | Output | Permitted for |
|---|---|---|---|
| `create_draft` | `material_id`, `title`, `system`, `requires_settings[]` | `draft` | any user |
| `import_draft` | ZIP of an adventure directory | `draft`, `diagnostics[]` | any user |
| `list_drafts` | page parameters | page of `draft` summaries | owner |
| `get_draft` | `draft_id` | `draft` | owner |
| `save_draft` | `draft_id`, `document`, `revision` | `{ revision, saved_at }` | owner |
| `validate_draft` | `draft_id` | `diagnostics[]` | owner |
| `export_draft` | `draft_id` | ZIP of YAML files | owner |
| `publish_draft` | `draft_id`, `version` | `material` | owner |
| `delete_draft` | `draft_id` | none | owner; published versions remain; recoverable for 30 days; erased after 90 |
| `restore_draft` | `draft_id` | `draft` | owner, within 30 days |

`save_draft` fails with `conflict` when `revision` is stale. `publish_draft` fails with `invalid_request` while any diagnostic has severity `error`, and with `conflict` when `version` is not greater than every published version of the id or the id belongs to another publisher.

A diagnostic is `{ pointer, severity, code, message }`. `pointer` is a JSON Pointer into the draft document; `severity` is `error` or `warning`.

### Characters

| Operation | Input | Output | Permitted for |
|---|---|---|---|
| `create_character` | `system`, `name`, `choices` | `character` | any user |
| `list_characters` | `system?`, `status?`, page parameters | page of `character` | owner (own characters only) |
| `get_character` | `character_id` | `character` | owner; members of the character's campaign (summary only) |
| `update_character` | `character_id`, `name?`, `profile?`, `portrait?` (an asset hash, or null to remove) | `character` | owner |
| `upload_asset` | `kind` (`portrait`), file, `alt`, `license?`, `credit?`, `provenance?` | `asset` | any user |
| `retire_character` | `character_id` | `character` | owner; status `available` or `dead` |
| `delete_character` | `character_id` | none | owner; status not `in_instance`; recoverable for 30 days; erased after 90 |
| `restore_character` | `character_id` | `character` | owner, within 30 days |

`upload_asset` accepts SVG, PNG, or WebP within the limits in [setting-packs.md](setting-packs.md#art), sanitizes SVG, and stores the file by hash; an identical file is stored once. `update_character` with the returned hash sets the portrait, and with `portrait: null` removes it. `profile` replaces the free-text fields that the system's character schema allows; `update_character` validates the resulting sheet and never changes rules fields. An uploaded asset that no record refers to is erased by the purge job.

`create_character` calls the rules system's `create_character` with a server-generated seed; clients cannot set sheet values. Invalid choices return `rules_rejected`. The choices accepted by each system are documented in [systems/](systems/README.md#implemented-systems).

### Campaigns

| Operation | Input | Output | Permitted for |
|---|---|---|---|
| `create_campaign` | `title`, `description?`, `system`, `system_versions`, `modules?`, `materials[]` | `campaign` | any user |
| `list_campaigns` | `role?` (`author`, `player`), `archived?`, page parameters | page of `campaign` | any user (campaigns they belong to) |
| `get_campaign` | `campaign_id` | `campaign` | members |
| `update_campaign` | `campaign_id`, `title?`, `description?`, `modules?` | `campaign` | author |
| `set_materials` | `campaign_id`, `materials[]` | `campaign` | author |
| `archive_campaign` | `campaign_id` | `campaign` | author |
| `delete_campaign` | `campaign_id`, `confirm` (the title) | none | author; ends its instances; recoverable for 30 days; erased after 90 |
| `restore_campaign` | `campaign_id` | `campaign` | author, within 30 days |
| `leave_campaign` | `campaign_id` | none | members other than the author |
| `remove_member` | `campaign_id`, `user_id` | none | author |
| `rotate_invite_link` | `campaign_id` | `invite_link_code`, a new code; the previous code stops working | author |
| `disable_invite_link` | `campaign_id` | none | author |
| `join_by_link` | `invite_link_code` | `campaign` | any user |

`materials[]` items are `{ kind, id, version }`. `create_campaign`, `update_campaign`, and `set_materials` fail with `system_mismatch` if any material's system or version range does not match under [Compatibility](systems/README.md#compatibility), or if any material requires a module the campaign does not enable, and with `invalid_request` unless the list has exactly one adventure and at least one setting satisfying the adventure's `requires_settings`. `set_materials` and `modules` affect instances created afterwards; existing instances keep their pinned versions and modules. Joining an instance fails with `system_mismatch` for a character whose system the campaign does not accept.

Leaving or being removed from a campaign removes the user's characters from its instances and writes their sheets back.

### Invitations

| Operation | Input | Output | Permitted for |
|---|---|---|---|
| `invite` | `campaign_id`, `instance_id?`, `message?`, `note?` | `invitation`, `code`, `url` | members |
| `preview_invitation` | `code` | campaign title, inviter display name, `message`, `status`, `expires_at` | anyone with the code |
| `list_invitations` | `campaign_id`, `status?` | `invitation[]` | members |
| `accept_invitation` | `code` | `campaign` | any signed-in user |
| `decline_invitation` | `code` | none | any signed-in user |
| `revoke_invitation` | `invitation_id` | none | the inviter; the author |

`invite` returns the invitation code once, together with the link `/invite/<code>`. The inviter passes either to the invitee by any means. A code is accepted at most once, by whichever signed-in user presents it, and expires after 14 days. `preview_invitation` returns `not_found` for an unknown code and reveals nothing about members other than the inviter.

Campaign invite links (`rotate_invite_link`, `disable_invite_link`, `join_by_link`) admit any number of users until rotated or disabled.

Cadmium has no user search, profiles, friends, or following. A user's display name is visible only to members of campaigns they belong to.

### Instances

| Operation | Input | Output | Permitted for | Allowed status |
|---|---|---|---|---|
| `create_instance` | `campaign_id`, `name` | `instance` | author | creates in `lobby` |
| `list_instances` | `campaign_id` | `instance[]` | members | any |
| `get_instance` | `instance_id`, `character_id?` | `instance`, `view?` | members | any |
| `add_character` | `instance_id`, `character_id` | `instance` | the character's owner, a member | `lobby`, `paused` |
| `remove_character` | `instance_id`, `character_id` | `instance` | the character's owner; the author | `lobby`, `paused` |
| `start_instance` | `instance_id` | `instance` | author | `lobby` → `active` |
| `pause_instance` | `instance_id` | `instance` | author | `active` → `paused` |
| `resume_instance` | `instance_id` | `instance` | author | `paused` → `active` |
| `end_instance` | `instance_id` | `instance` | author | `active`, `paused` → `ended` |
| `advance_round` | `instance_id` | none | author | `active` |
| `get_history` | `instance_id`, page parameters | page of commits | members | any |

`create_instance` pins the newest installed system version within the campaign's `system_versions` and the campaign's current material versions. It fails with `system_mismatch` if no installed version satisfies the range, and with `conflict` if the campaign is archived.

`add_character` fails with `system_mismatch` if the character's system differs from the campaign's or its major version differs from the instance's, and with `conflict` if the character is not `available`.

`start_instance` fails with `conflict` if the character count is outside the adventure's `players` range, or if dungeon generation fails.

A user with several characters in one instance passes `character_id` to `get_instance`, `submit_input`, and `submit_action`. With one character, it MAY be omitted.

### Scheduling

| Operation | Input | Output | Permitted for |
|---|---|---|---|
| `schedule_session` | `instance_id`, `starts_at`, `timezone`, `duration_minutes`, `title?`, `recurrence?`, `auto_resume?`, `auto_pause?`, `notes?` | `scheduled_session` | author |
| `update_session` | `session_id`, any field of `schedule_session` | `scheduled_session` | author |
| `cancel_session` | `session_id`, `occurrence_start?` | none | author |
| `move_occurrence` | `session_id`, `occurrence_start`, `starts_at` | `occurrence` | author |
| `list_occurrences` | `instance_id` or `campaign_id`, `from`, `to` (at most 92 days apart) | `occurrence[]` | members |
| `rsvp` | `session_id`, `occurrence_start`, `response` (`yes`, `no`, `maybe`) | `occurrence` | members |
| `export_calendar` | `instance_id` | `text/calendar` (RFC 5545) | members |
| calendar feed | the secret in the feed URL | `text/calendar` (RFC 5545) | the feed's owner, by URL |

`cancel_session` without `occurrence_start` cancels the session and every future occurrence; with it, only that occurrence. `update_session` applies to occurrences that have not started.

At each occurrence:

- At each of a member's `reminders.lead_minutes` before `starts_at`, the server sends `session_reminder` to that member unless they answered `no`: on the user stream, and by Web Push to each of their push subscriptions when `reminders.push` is true.
- At `starts_at`, if `auto_resume` is true and the instance is `paused`, the Coordinator resumes it.
- At `ends_at`, if `auto_pause` is true and the instance is `active`, the Coordinator pauses it after the current round closes.

Times are stored and returned in UTC. `timezone` controls recurrence and calendar export; clients display times in the user's `timezone`.

The calendar feed lists every occurrence in the next 92 days of every instance the user belongs to, with one `VALARM` per entry in the user's `reminders.lead_minutes`. Calendar applications subscribe to its URL. Some applications ignore alarms in subscribed calendars or refresh them infrequently; the user stream and Web Push are the reminders Cadmium delivers itself.

### Play

#### submit_input

| Input | Type | Constraints |
|---|---|---|
| `instance_id` | id | instance `active` |
| `character_id?` | id | one of the user's characters in the instance |
| `text` | string | 1–500 characters |
| `idempotency_key` | string | see [Idempotency](#idempotency) |

Output: `{ "accepted": true, "input_id": id }`. Acceptance means the input entered processing. Outcomes arrive as messages.

A character has at most one input in processing. A second submission during processing returns `rate_limited`. A stored declaration is not in processing; a later input replaces it.

#### submit_action

| Input | Type | Constraints |
|---|---|---|
| `instance_id` | id | instance `active` |
| `character_id?` | id | as for `submit_input` |
| `tool` | string | a tool name from [tools.md](tools.md#tool-set) |
| `args` | object | the tool's arguments |
| `idempotency_key` | string | see [Idempotency](#idempotency) |

Submits a tool call without the parser. Used for `action_menu` selections, pending-choice buttons (`choose`), and clients that offer direct controls. The call follows the same validation, ordering, and commit path as parsed input.

#### subscribe

`subscribe(instance_id, after_version?)` opens an ordered message stream for one instance. If `after_version` is given, the server first sends every commit and narration after that version, then live messages. Messages are delivered in `version` order. A client that detects a gap reconnects with `after_version` set to the last version received.

## Administrative operations

Administrative operations require a user with `operator: true`. They are not part of the player client and SHOULD be exposed on a separate endpoint or interface.

| Operation | Input | Output | Effect |
|---|---|---|---|
| `publish_bundle` | `kind` (`setting`, `adventure`), `bundle` (compiled JSON) | `{ kind, id, version }` | Stores the bundle with `origin: operator` and `listed: true`. Fails with `conflict` if `(kind, id, version)` exists, and with `system_mismatch` if the bundle's system range matches no installed system version. For adventures, fails with `invalid_request` unless published settings satisfy `requires_settings`. |
| `set_listed` | `kind`, `id`, `version`, `listed` | none | Lists or unlists a version. Campaigns and instances that use it are unaffected. |
| `inspect_instance` | `instance_id` | `instance` with full `state` | Returns unfiltered state, including hidden entities and secrets. |
| `replay_instance` | `instance_id`, `to_version?` | `{ state, matches_stored }` | Replays events to `to_version` (default: latest) and compares the result with the stored state. |
| `restore_instance` | `instance_id`, `to_version`, `reason` | `instance` | Commits a `state_restored` event and sets state to the replayed state at `to_version`. Requires status `paused`. |

## Pagination

List operations marked "page" take `limit` (1–100, default 20) and `cursor` (opaque, from a previous response). They return:

```json
{ "items": [ ], "next_cursor": "b2Zmc2V0OjIw" }
```

`next_cursor` is null on the last page.

`get_history` pages by version instead of cursor. It takes `after_version` (default 0) and `limit` (1–200, default 50) and returns commits in ascending version order:

```json
{
  "items": [
    { "version": 127, "actor_id": "c_22", "events": [ ], "narration": { "text": "…", "source": "model" } }
  ],
  "next_after_version": 127
}
```

`next_after_version` is null when no later commits exist.

## Rate limits

| Scope | Limit |
|---|---|
| `login` per email | 10 per 15 minutes |
| `register` per client address | 5 per hour |
| `create_character` per user | 20 per hour |
| `invite` per user | 30 per day |
| `preview_invitation`, `accept_invitation`, `decline_invitation`, `join_by_link` per client address | 30 per 15 minutes |
| Calendar feed per URL | 60 per hour |
| `save_draft` per draft | 60 per minute |
| `submit_input` and `submit_action` per character | 1 in processing; 30 per minute |
| All other operations per user | 120 per minute |
| Open subscriptions per user | 4 |

Limits are deployment-configurable. Exceeding a limit returns `rate_limited` with `retry_after_ms`.

## Messages

Instance messages have `type`, `instance_id`, and `version`. Messages for one instance are ordered by `version`; messages sharing a version are ordered as listed in this table.

| Type | Payload | Recipients | Sent when |
|---|---|---|---|
| `commit` | `events[]`, `actor_id`, `input_id?` | all | A commit succeeds. Events are filtered to those visible to the recipient. |
| `round` | `number`, `mode`, `resolution`, `current?`, `declared[]`, `waiting_on[]`, `deadline?` | all | A round starts, a sequential turn starts, or a declaration is stored. `declared` lists character ids, not actions. |
| `declaration` | `character_id`, `tool`, `args`, `label` | declaring user | A declaration is stored or replaced. |
| `choice` | `character_id`, `prompt`, `options[]` of `{ id, label }` | the character's owner | The rules system returns a pending choice. |
| `narration` | `text`, `source` | all | Narration for a commit completes. |
| `action_menu` | `character_id`, `options[]` of `{ label, tool, args }` | the character's owner | The character's improvise streak reaches 4, or a round or turn starts while action-menu mode is enabled. |
| `input_rejected` | `input_id`, `reason` | submitting user | An input is not committed. |
| `instance_status` | `status`, `ending?` | all | Instance status changes. |
| `session_reminder` | `session_id`, `occurrence_start`, `starts_at` | members who have not answered `no` | At each of the member's reminder lead times. |

`deadline` is a timestamp at which the Coordinator invokes `advance`, or absent when timeouts are disabled.

User messages are delivered on `subscribe_me()`, a per-user stream: `session_reminder` for every instance the user belongs to, and the recipient-specific instance messages. Web Push carries `session_reminder` only, as a notification with the session title and start time that opens the instance lobby.

## HTTP and WebSocket binding

### Transport

- Base path: `/v1`.
- Request and response bodies: `application/json; charset=utf-8`.
- Token: `Authorization: Bearer <token>`.
- Idempotency key: the `Idempotency-Key` header on `POST /instances/{instance_id}/inputs` and `/actions`.
- WebSocket frames: one JSON message per text frame.

| Error code | HTTP status |
|---|---|
| `unauthenticated` | 401 |
| `forbidden` | 403 |
| `not_found` | 404 |
| `conflict` | 409 |
| `system_mismatch` | 409 |
| `invalid_request` | 422 |
| `rules_rejected` | 422 |
| `rate_limited` | 429, with `Retry-After` in seconds |
| `unavailable` | 503 |

### Routes

| Operation | Method and path |
|---|---|
| `register` | `POST /v1/users` |
| `login` | `POST /v1/auth/token` |
| `logout` | `DELETE /v1/auth/token` |
| `get_me` | `GET /v1/me` |
| `accept_terms` | `POST /v1/me/terms` |
| `export_my_data` | `GET /v1/me/export.zip` |
| `request_account_deletion` | `POST /v1/me/deletion` |
| `restore_account` | `DELETE /v1/me/deletion` |
| `update_me` | `PATCH /v1/me` |
| `get_push_key` | `GET /v1/push/key` |
| `add_push_subscription` | `POST /v1/me/push-subscriptions` |
| `list_push_subscriptions` | `GET /v1/me/push-subscriptions` |
| `remove_push_subscription` | `DELETE /v1/me/push-subscriptions/{subscription_id}` |
| `get_calendar_feed` | `GET /v1/me/calendar-feed` |
| `rotate_calendar_feed` | `POST /v1/me/calendar-feed` |
| `disable_calendar_feed` | `DELETE /v1/me/calendar-feed` |
| calendar feed | `GET /v1/calendar/{secret}.ics` |
| `list_systems` | `GET /v1/systems` |
| `get_system_schema` | `GET /v1/systems/{system}/schemas/{kind}` |
| `list_materials` | `GET /v1/materials?system=&kind=&owner=` |
| `create_draft` | `POST /v1/drafts` |
| `import_draft` | `POST /v1/drafts/import` (`application/zip`) |
| `list_drafts` | `GET /v1/drafts?limit=&cursor=` |
| `get_draft` | `GET /v1/drafts/{draft_id}` |
| `save_draft` | `PUT /v1/drafts/{draft_id}` |
| `validate_draft` | `POST /v1/drafts/{draft_id}/validate` |
| `export_draft` | `GET /v1/drafts/{draft_id}/export.zip` |
| `publish_draft` | `POST /v1/drafts/{draft_id}/publish` |
| `delete_draft` | `DELETE /v1/drafts/{draft_id}` |
| `create_character` | `POST /v1/characters` |
| `list_characters` | `GET /v1/characters?system=&status=&limit=&cursor=` |
| `get_character` | `GET /v1/characters/{character_id}` |
| `update_character` | `PATCH /v1/characters/{character_id}` |
| `upload_asset` | `POST /v1/assets` (multipart) |
| `get_asset` | `GET /v1/assets/{hash}` |
| `retire_character` | `POST /v1/characters/{character_id}/retire` |
| `create_campaign` | `POST /v1/campaigns` |
| `list_campaigns` | `GET /v1/campaigns?role=&archived=&limit=&cursor=` |
| `get_campaign` | `GET /v1/campaigns/{campaign_id}` |
| `update_campaign` | `PATCH /v1/campaigns/{campaign_id}` |
| `set_materials` | `PUT /v1/campaigns/{campaign_id}/materials` |
| `archive_campaign` | `POST /v1/campaigns/{campaign_id}/archive` |
| `leave_campaign` | `DELETE /v1/campaigns/{campaign_id}/members/me` |
| `remove_member` | `DELETE /v1/campaigns/{campaign_id}/members/{user_id}` |
| `rotate_invite_link` | `POST /v1/campaigns/{campaign_id}/invite-link` |
| `disable_invite_link` | `DELETE /v1/campaigns/{campaign_id}/invite-link` |
| `join_by_link` | `POST /v1/campaigns/join` |
| `invite` | `POST /v1/campaigns/{campaign_id}/invitations` |
| `preview_invitation` | `GET /v1/invitations/code/{code}` |
| `list_invitations` | `GET /v1/campaigns/{campaign_id}/invitations?status=` |
| `accept_invitation` | `POST /v1/invitations/accept` with `{ code }` |
| `decline_invitation` | `POST /v1/invitations/decline` with `{ code }` |
| `revoke_invitation` | `DELETE /v1/invitations/{invitation_id}` |
| `create_instance` | `POST /v1/campaigns/{campaign_id}/instances` |
| `list_instances` | `GET /v1/campaigns/{campaign_id}/instances` |
| `get_instance` | `GET /v1/instances/{instance_id}?character_id=` |
| `add_character` | `POST /v1/instances/{instance_id}/characters` |
| `remove_character` | `DELETE /v1/instances/{instance_id}/characters/{character_id}` |
| `start_instance` | `POST /v1/instances/{instance_id}/start` |
| `pause_instance` | `POST /v1/instances/{instance_id}/pause` |
| `resume_instance` | `POST /v1/instances/{instance_id}/resume` |
| `end_instance` | `POST /v1/instances/{instance_id}/end` |
| `advance_round` | `POST /v1/instances/{instance_id}/advance` |
| `get_history` | `GET /v1/instances/{instance_id}/history?after_version=&limit=` |
| `schedule_session` | `POST /v1/instances/{instance_id}/sessions` |
| `update_session` | `PATCH /v1/sessions/{session_id}` |
| `cancel_session` | `DELETE /v1/sessions/{session_id}?occurrence_start=` |
| `move_occurrence` | `POST /v1/sessions/{session_id}/occurrences/{occurrence_start}/move` |
| `list_occurrences` | `GET /v1/occurrences?instance_id=&campaign_id=&from=&to=` |
| `rsvp` | `PUT /v1/sessions/{session_id}/occurrences/{occurrence_start}/rsvp` |
| `export_calendar` | `GET /v1/instances/{instance_id}/calendar.ics` |
| `submit_input` | `POST /v1/instances/{instance_id}/inputs` |
| `submit_action` | `POST /v1/instances/{instance_id}/actions` |
| `subscribe` | `GET /v1/instances/{instance_id}/stream?after_version=` (WebSocket upgrade) |
| `subscribe_me` | `GET /v1/me/stream` (WebSocket upgrade) |

Deployments on hosts without long-lived connections replace the two streams with pub/sub channels; see [app-flow.md](app-flow.md#real-time-channels).

WebSocket connections authenticate with the `Authorization` header or, where the client cannot set headers, a first frame `{ "type": "auth", "token": "<token>" }` sent within 5 seconds of connection.

### Examples

Log in:

```
POST /v1/auth/token
Content-Type: application/json

{ "email": "vale@example.org", "password": "correct horse battery" }
```

```
200 OK

{ "token": "tok_9f2c…", "user": { "id": "u_3", "email": "vale@example.org", "display_name": "Vale", "timezone": "Europe/Berlin",
                                  "reminders": { "push": true, "lead_minutes": [1440, 15] }, "created_at": "2026-10-01T18:00:00Z" } }
```

Create a Quest character:

```
POST /v1/characters
Authorization: Bearer tok_9f2c…

{ "system": "quest", "name": "Vale",
  "choices": { "role": "spy",
               "abilities": ["base:a1", "base:a2", "base:a3", "base:a4", "base:a5", "base:a6"] } }
```

```
201 Created

{ "character": { "id": "c_17", "owner_id": "u_3", "name": "Vale", "system": "quest", "system_version": "1.1.0",
                 "status": "available", "instance_id": null, "sheet": { }, "summary": { } } }
```

Create a campaign:

```
POST /v1/campaigns
Authorization: Bearer tok_9f2c…

{ "title": "The Sunken Archive", "system": "quest", "system_versions": "^1.0",
  "materials": [ { "kind": "setting", "id": "derelict_station", "version": "3.0.0" },
                 { "kind": "adventure", "id": "sunken_archive", "version": "2.0.0" } ] }
```

```
201 Created

{ "campaign": { "id": "k_41", "title": "The Sunken Archive", "system": "quest", "system_versions": "^1.0", … } }
```

Invite a player:

```
POST /v1/campaigns/k_41/invitations
Authorization: Bearer tok_9f2c…

{ "message": "Join us Tuesdays.", "note": "for Rook" }
```

```
201 Created

{ "invitation": { "id": "inv_5", "status": "pending", "expires_at": "2026-10-17T10:00:00Z", … },
  "code": "RQ7X-M2KD-9TFA", "url": "https://cadmium.example/invite/RQ7X-M2KD-9TFA" }
```

The inviter sends the link to Rook. Rook signs in and accepts:

```
POST /v1/invitations/accept
Authorization: Bearer tok_r00k…

{ "code": "RQ7X-M2KD-9TFA" }
```

Create an instance and add a character:

```
POST /v1/campaigns/k_41/instances
Authorization: Bearer tok_9f2c…

{ "name": "Tuesday group" }
```

```
201 Created

{ "instance": { "id": "i_7", "campaign_id": "k_41", "status": "lobby", "system_version": "1.1.0", "version": 0, … } }
```

```
POST /v1/instances/i_7/characters
Authorization: Bearer tok_9f2c…

{ "character_id": "c_17" }
```

A character from an incompatible system version:

```
409 Conflict

{ "error": { "code": "system_mismatch", "detail": "character c_30 was created with quest 2.0.0; instance i_7 pins quest 1.1.0" } }
```

Schedule a weekly session:

```
POST /v1/instances/i_7/sessions
Authorization: Bearer tok_9f2c…

{ "title": "Weekly game", "starts_at": "2026-10-20T18:00:00Z", "timezone": "Europe/Berlin",
  "duration_minutes": 180, "recurrence": { "freq": "weekly", "interval": 1, "count": 10 },
  "auto_resume": true, "auto_pause": true }
```

RSVP to an occurrence:

```
PUT /v1/sessions/s_2/occurrences/2026-10-27T18:00:00Z/rsvp
Authorization: Bearer tok_r00k…

{ "response": "maybe" }
```

Submit an input:

```
POST /v1/instances/i_7/inputs
Authorization: Bearer tok_9f2c…
Idempotency-Key: 6c1e0b7a-input-0042

{ "text": "smash the drone with my wrench" }
```

```
202 Accepted

{ "accepted": true, "input_id": "in_771" }
```

Messages received for that input. Quest rolls 8, a tough choice: the hit lands for standard damage, and the player picks one of two setbacks:

```json
{ "type": "commit", "instance_id": "i_7", "version": 129, "actor_id": "c_17", "input_id": "in_771",
  "events": [
    { "type": "attacked", "actor": "c_17", "target": "e_drone1", "roll": 8, "outcome": "partial", "damage": 2 },
    { "type": "damaged", "target": "e_drone1", "amount": 2, "remaining": 2 },
    { "type": "choice_offered", "actor": "c_17",
      "options": [ { "id": "strain", "label": "Strain yourself: lose 1 HP" },
                   { "id": "lose_grip", "label": "Lose your grip: drop what you are using" } ] }
  ] }
{ "type": "choice", "instance_id": "i_7", "version": 129, "character_id": "c_17",
  "prompt": "Success, at a cost. Choose a setback.",
  "options": [ { "id": "strain", "label": "Strain yourself: lose 1 HP" },
               { "id": "lose_grip", "label": "Lose your grip: drop what you are using" } ] }
{ "type": "narration", "instance_id": "i_7", "version": 129, "source": "model",
  "text": "The wrench dents the drone's housing, but the swing pulls at your grip." }
```

Resolve the choice:

```
POST /v1/instances/i_7/actions
Authorization: Bearer tok_9f2c…
Idempotency-Key: 6c1e0b7a-action-0043

{ "tool": "choose", "args": { "option_id": "strain" } }
```

An out-of-turn `submit_action`. Parsed input does not produce this message: when it is not the actor's turn, the parser receives only free tools.

```json
{ "type": "input_rejected", "instance_id": "i_7", "version": 131, "input_id": "in_772", "reason": "not_your_turn" }
```

Rate limited:

```
429 Too Many Requests
Retry-After: 2

{ "error": { "code": "rate_limited", "detail": "an input is already in processing", "retry_after_ms": 1500 } }
```
