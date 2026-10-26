# Client API

The client API is defined as transport-independent operations and messages. A binding maps operations to a transport. This document defines the operations, then a reference binding to HTTP and WebSocket with complete examples.

## Authentication

Every operation carries a bearer token except `register`, `login`, `preview_invitation`, and the calendar feed. The calendar feed is authorized by the secret in its URL.

A deployment either delegates accounts to an identity provider or implements the account operations itself:

| Deployment | Accounts | Bearer token |
|---|---|---|
| With an identity provider | The provider registers users, signs them in and out, and holds their sign-in address and password. The deployment has no `register`, `login`, or `logout` operation, and `update_me` rejects `email`, `password`, and `current_password` with `invalid_request`. | The provider's session token, verified by the server on every request |
| Without an identity provider | `register`, `login`, and `logout`, as listed under [Users](#users) | The opaque token that `login` returns, with the properties below |

The reference deployment delegates accounts to Clerk ([app-flow.md](app-flow.md#stack)). The User record references the provider's user id.

Tokens issued by `login` have these properties:

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
- Every operation except `get_me`, `accept_terms`, `restore_account`, `export_my_data`, and `logout` fails with `forbidden` until the user has accepted the current Terms of Service version. A closing or suspended account therefore restores or exports without accepting a changed version first; a restored account accepts the current version before any other operation.
- A user whose `status` is `closing` may call only `get_me`, `restore_account` (within 30 days of the deletion request), `export_my_data`, and `logout`.
- A user whom an operator has suspended under the Terms of Service may call only `get_me`, `export_my_data`, and `logout`. Every other operation fails with `forbidden`. A suspended user receives no instance or user messages and no reminders, and their calendar feed returns `not_found`.
- Failed operations return an error object:

  ```json
  { "error": { "code": "conflict", "detail": "campaign is not in lobby" } }
  ```

### Error codes

| Code | Meaning |
|---|---|
| `unauthenticated` | Missing, expired, or revoked token; wrong credentials at `login`. |
| `forbidden` | The user is a campaign player but lacks the required role, or the account's state (terms not accepted, closing, suspended) does not allow the operation. |
| `not_found` | The record does not exist, or the user may not see it. |
| `conflict` | The record's state does not allow the operation. |
| `system_mismatch` | A character or material is written for a rules system the campaign does not accept, or fails the version check in [Compatibility](systems/README.md#compatibility). |
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
  "reminders": { "push": true, "lead_minutes": [1440, 15] }, "created_at": "2026-10-01T18:00:00Z", "terms_current": true }
```

`email`, `timezone`, `reminders`, and `terms_current` are included only for the user themself. `terms_current` is true when the user has accepted the current Terms of Service version. Other users see a user only as a campaign member: `id` and `display_name`.

### System

```json
{ "id": "cadmium", "version": "1.0.0", "title": "Cadmium", "derived_from": "quest", "accepts": ["cadmium", "quest"],
  "modules": [ { "id": "armor", "title": "Armor" }, { "id": "stash", "title": "Stash" } ],
  "credit": "Derived from Quest by The Adventure Guild, LLC, under CC BY 4.0. Not endorsed by The Adventure Guild.",
  "pending_confirmation": ["setbacks", "spatial"] }
```

`pending_confirmation` is the system's `confirm` list from its `data.json`: the rule values not yet verified against the source text. See [systems/README.md](systems/README.md#data-and-confirmation).

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
  "status": "in_instance", "instance_id": "i_7", "archived": false,
  "sheet": {
    "name": "Vale", "role": "spy",
    "hp": { "value": 10, "max": 10 }, "ap": 10,
    "abilities": ["base:a1", "base:a2", "base:a3", "base:a4", "base:a5", "base:a6"],
    "inventory": [ { "ref": "base:wrench" } ], "status": "active", "profile": {}
  },
  "summary": { "health": "10/10 HP", "status": "active", "resources": { "AP": "10" } }
}
```

`sheet` follows the system's `character` schema and is included only for the owner. `archived` is set by `archive_character` and cleared by `unarchive_character`; an archived character cannot join an instance. Other members of a shared campaign receive `id`, `name`, `system`, `status`, and `summary`.

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

`invite_link_code` is included only for the author. `archived` is set by `archive_campaign` and cleared by `unarchive_campaign`.

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

`note` is included only for the campaign's author. The invitation code is returned once, by `invite`; the server stores only its hash.

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

The state of an instance visible to one of the requesting user's characters. Visibility follows the rules for [parser context](tools.md#parser-context). The view adds the character's full sheet, its pending choice if any, each party member's name, room, cell, and summary, the map of the character's location as far as the party has seen it, and the labels that direct controls need to offer every tool without the parser.

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
                 "distance": 7, "direction": "east", "in_reach": false },
               { "id": "e_drone1", "label": "maintenance drone", "kind": "creature", "at": [8, 3], "footprint": [1, 1],
                 "distance": 1, "direction": "southeast", "in_reach": true, "hostile": true } ],
  "party": [ { "id": "c_22", "name": "Rook", "room": "airlock", "at": [2, 3], "summary": { } } ],
  "actions": {
    "inventory": [ { "id": "e_wrench", "label": "wrench" } ],
    "abilities": [ { "id": "base:a1", "label": "Patch Up", "target": "self" } ],
    "npcs": [ { "id": "archivist", "name": "Archivist", "topics": [ { "id": "power_core", "label": "the power core" } ] } ]
  }
}
```

Entries in `visible` that are in reach and are not creatures carry `verbs`, the verbs `interact` accepts for them, including `open` or `close` for a door and `light` or `extinguish` for a light source. Visible hostile creatures carry `hostile: true`. `actions` lists what direct controls offer: `inventory`, the items the character carries; `abilities`, the character's abilities with the `target` each one's definition declares (`self`, `entity`, `door`, or `none`); and `npcs`, the visible NPCs in the character's room, which `talk` accepts, each with the topics whose `when` holds, as in parser context. `actions` contains no locks, flags, stages, secrets, or topic briefs.

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
| `list_reminders` | `days?` (1–30, default 7) | `{ recent[], upcoming[] }` of reminders; see [Reminders](#reminders) |

`register`, `login`, and `logout` exist only in deployments without an identity provider; see [Authentication](#authentication).

`accept_terms` takes `version`, the terms version as [data-model.md](data-model.md#user) defines it, and records it as the user's `terms_version` with `terms_accepted_at`. It fails with `invalid_request` when `version` is not the current terms version.

`get_me` returns the ids of the user's characters that are not deleted; `active_campaign_ids`, the campaigns the user belongs to in any role that are neither archived nor deleted; and `authored_campaign_ids`, the campaigns the user authored that are not deleted, archived ones included.

In a deployment without an identity provider, `update_me` with `email` changes the sign-in address after verifying it, and `password` requires `current_password`. Every field a user entered can be changed with `update_me`, `update_character`, `save_draft`, `update_campaign`, `update_session`, `rsvp`, or `revoke_invitation`, and every record a user owns can be deleted with the matching `delete_` operation or `request_account_deletion`.

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
| `campaigns/*.json` | Campaigns authored, with members, materials, invitations, instances, events, input logs, narration, and schedules |
| `memberships.json` | Campaigns joined, with role and join time |
| `inputs.json` | The user's input log rows in every instance, with the events and narration of each commit they caused |
| `invitations.json` | Invitations created or accepted by the user |
| `schedule.json` | RSVPs and sessions created by the user |

The export is generated on request and is not stored.

#### Calendar feed secret

The calendar feed URL contains a secret that the server derives and does not store: the first 32 characters of the base64url encoding of HMAC-SHA256, keyed with a deployment key, over `<user id>:<generation>`. The User record stores the generation and a hash of the current secret. `rotate_calendar_feed` increments the generation and stores the new hash, so the previous URL stops working; `disable_calendar_feed` clears the hash. `get_calendar_feed` derives the URL again from the stored generation. The feed answers a URL only when the secret's hash matches the stored hash and the secret matches the derivation for the user's current generation. Without a configured deployment key, `get_calendar_feed`, `rotate_calendar_feed`, and the feed fail with `unavailable`.

#### Reminders

Reminders are not stored as records. `list_reminders` derives them from the schedules of the user's instances by the rules in [Scheduling](#scheduling): one reminder for each entry of the user's current `reminders.lead_minutes` before each occurrence that is not cancelled, except occurrences the user answered `no`.

```json
{ "instance_id": "i_7", "instance_name": "Tuesday group", "campaign_title": "The Sunken Archive",
  "session_id": "s_2", "title": "Weekly game", "occurrence_start": "2026-10-27T18:00:00Z",
  "starts_at": "2026-10-27T18:00:00Z", "lead_minutes": 15, "remind_at": "2026-10-27T17:45:00Z", "state": "sent" }
```

`remind_at` is `starts_at` less the lead time. `state` is `upcoming` before `remind_at`, `due` from `remind_at` until the Scheduler sends the reminder, and `sent` afterwards. `recent` lists the reminders whose `remind_at` falls in the last `days` days, newest first; `upcoming` lists those in the next `days` days, soonest first, and omits instances that have ended. Derived reminders follow the user's settings and memberships at the time of the request and have no read state.

### Systems and materials

| Operation | Input | Output |
|---|---|---|
| `list_systems` | none | `system[]` |
| `get_system_schema` | `system`, `kind` (`character`, `creature`, `item`, `ability`, `check`, `structure`), `modules?` | JSON Schema of the system configured with `modules` |
| `get_asset` | `hash` | The image bytes, with `Content-Type`, long-lived caching, and a content policy that forbids scripts; see [Assets](#assets). Alt text and credits travel in the records that refer to the asset. |
| `list_materials` | `system?`, `kind?`, `owner?` (`me`) | `material[]` |
| `delete_material` | `kind` (`adventure`), `id`, `version` | none |

Listings return the latest listed version of each `operator` material (settings and example adventures installed with Cadmium) and the user's own published adventures. Adventures published by other users are never listed; players reach them only by invitation to a campaign. Operators publish setting packs with [administrative operations](#administrative-operations).

`delete_material` deletes a version of an adventure the caller published. A published version is deleted only while nothing uses it: when any campaign's materials or any instance's pinned materials name the version, the operation fails with `conflict`, giving the number of campaigns and games, since games replay from the versions they pin. Deleting a version removes it from its assets' bundle references; an asset that no bundle or portrait refers to is erased by the daily purge. The draft the version was published from is unaffected, and the version number may be published again. Fails with `not_found` for a version the caller did not publish.

#### Assets

`get_asset` serves an image as an immutable response: `Cache-Control: private, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff`, and `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox; frame-ancestors 'none'`, so an SVG opened on its own runs no script and loads nothing. `get_asset` does not count against the per-user rate limit.

### Adventure drafts

| Operation | Input | Output | Permitted for |
|---|---|---|---|
| `create_draft` | `material_id`, `title`, `system`, `requires_settings[]` | `draft` | any user |
| `import_draft` | ZIP of an adventure directory | `draft`, `diagnostics[]` | any user |
| `list_drafts` | `archived?`, page parameters | page of `draft` summaries | owner |
| `get_draft` | `draft_id` | `draft` | owner |
| `save_draft` | `draft_id`, `document`, `revision` | `{ revision, saved_at }` | owner |
| `validate_draft` | `draft_id` | `diagnostics[]` | owner |
| `export_draft` | `draft_id` | ZIP of YAML files | owner |
| `publish_draft` | `draft_id`, `version` | `material` | owner |
| `archive_draft` | `draft_id` | `draft` summary | owner; not archived |
| `unarchive_draft` | `draft_id` | `draft` summary | owner; archived |
| `delete_draft` | `draft_id` | `{ restorable_until }` | owner; published versions remain; recoverable for 30 days; erased after 90 |
| `list_deleted_drafts` | none | `draft[]` of `{ id, title, system, deleted_at, restorable_until, erased_by }` | owner (own drafts deleted less than 30 days ago, newest first) |
| `restore_draft` | `draft_id` | `draft` | owner, within 30 days |

A draft summary carries `archived`, and counts of `problems` (diagnostics of severity `error`) and `warnings`. `list_drafts` with `archived` lists only archived or only unarchived drafts; without it, both. Archiving puts a draft aside without deleting it. `archive_draft` and `unarchive_draft` fail with `conflict` when the draft is already in the requested state.

`save_draft` fails with `conflict` when `revision` is stale. `publish_draft` fails with `invalid_request` while any diagnostic has severity `error`, and with `conflict` when the draft is archived, when `version` is not greater than every published version of the id, or when the id belongs to another publisher. `restore_draft` fails with `conflict` after 30 days, or when another draft of the same adventure id exists.

A diagnostic is `{ pointer, severity, code, message }`. `pointer` is a JSON Pointer into the draft document; `severity` is `error` or `warning`.

### Characters

| Operation | Input | Output | Permitted for |
|---|---|---|---|
| `create_character` | `system`, `name`, `choices` | `character` | any user |
| `list_characters` | `system?`, `status?`, `archived?`, page parameters | page of `character` | owner (own characters only) |
| `get_character` | `character_id` | `character` | owner; members of the character's campaign (summary only) |
| `update_character` | `character_id`, `name?`, `profile?`, `portrait?` (an asset hash, or null to remove) | `character` | owner |
| `rebuild_character` | `character_id`, `name?`, `choices` | `character` | owner; status `available` and never joined an instance |
| `upload_asset` | `kind` (`portrait`), file, `alt`, `license?`, `credit?`, `provenance?` | `asset` | any user |
| `retire_character` | `character_id` | `character` | owner; status `available` or `dead` |
| `archive_character` | `character_id` | `character` | owner; not archived; status not `in_instance` |
| `unarchive_character` | `character_id` | `character` | owner; archived |
| `delete_character` | `character_id` | none | owner; status not `in_instance`; recoverable for 30 days; erased after 90 |
| `list_deleted_characters` | none | `character[]` of `{ id, name, system, deleted_at, restorable_until, erased_by }` | owner (own characters deleted less than 30 days ago, newest first) |
| `restore_character` | `character_id` | `character` | owner, within 30 days |

`upload_asset` accepts SVG, PNG, or WebP within the limits in [setting-packs.md](setting-packs.md#art), sanitizes SVG, and stores the file by hash; an identical file is stored once. `update_character` with the returned hash sets the portrait, and with `portrait: null` removes it. `profile` replaces the free-text fields that the system's character schema allows; `update_character` validates the resulting sheet and never changes rules fields. An uploaded asset that no record refers to is erased by the purge job.

`create_character` calls the rules system's `create_character` with a server-generated seed; clients cannot set sheet values. Invalid choices return `rules_rejected`. The choices accepted by each system are documented in [systems/](systems/README.md#implemented-systems).

`rebuild_character` builds the sheet again from new `choices`, as `create_character` does, with a new server-generated seed, and keeps the character's id and portrait. It fails with `conflict` unless the character is `available` and has never joined an instance.

Archiving puts a character aside without deleting it. `list_characters` with `archived` lists only archived or only unarchived characters; without it, both. `archive_character` and `unarchive_character` fail with `conflict` when the character is already in the requested state, and `archive_character` also while the character is `in_instance`. `restore_character` fails with `conflict` after 30 days.

### Campaigns

| Operation | Input | Output | Permitted for |
|---|---|---|---|
| `create_campaign` | `title`, `description?`, `system`, `system_versions`, `modules?`, `materials[]` | `campaign` | any user |
| `list_campaigns` | `role?` (`author`, `player`), `archived?`, page parameters | page of `campaign` | any user (campaigns they belong to) |
| `get_campaign` | `campaign_id` | `campaign` | members |
| `update_campaign` | `campaign_id`, `title?`, `description?`, `modules?` | `campaign` | author |
| `set_materials` | `campaign_id`, `materials[]` | `campaign` | author |
| `archive_campaign` | `campaign_id` | `campaign` | author; not archived |
| `unarchive_campaign` | `campaign_id` | `campaign` | author; archived |
| `delete_campaign` | `campaign_id`, `confirm` (the title) | none | author; ends its instances; recoverable for 30 days; erased after 90 |
| `list_deleted_campaigns` | none | `campaign[]` of `{ id, title, system, deleted_at, restorable_until, erased_by }` | author (own campaigns deleted less than 30 days ago, newest first) |
| `restore_campaign` | `campaign_id` | `campaign` | author, within 30 days |
| `leave_campaign` | `campaign_id` | none | members other than the author |
| `remove_member` | `campaign_id`, `user_id` | none | author |
| `rotate_invite_link` | `campaign_id` | `invite_link_code`, a new code; the previous code stops working | author |
| `disable_invite_link` | `campaign_id` | none | author |
| `join_by_link` | `invite_link_code` | `campaign` | any user |

`materials[]` items are `{ kind, id, version }`. `create_campaign`, `update_campaign`, and `set_materials` fail with `system_mismatch` if any material's system or version range does not match under [Compatibility](systems/README.md#compatibility), or if any material requires a module the campaign does not enable, and with `invalid_request` unless the list has exactly one adventure and at least one setting satisfying the adventure's `requires_settings`. `set_materials` and `modules` affect instances created afterwards; existing instances keep their pinned versions and modules. Joining an instance fails with `system_mismatch` for a character whose system the campaign does not accept.

An archived campaign keeps its members and instances and accepts no new instances, members, or invitations. `archive_campaign` disables the invite link; after `unarchive_campaign`, the author enables a new one with `rotate_invite_link`. `archive_campaign` and `unarchive_campaign` fail with `conflict` when the campaign is already in the requested state. `list_campaigns` with `archived` lists only archived or only unarchived campaigns; without it, both.

Leaving or being removed from a campaign removes the user's characters from its instances and writes their sheets back, as [party changes](#party-changes) describe.

### Invitations

| Operation | Input | Output | Permitted for |
|---|---|---|---|
| `invite` | `campaign_id`, `instance_id?`, `message?`, `note?` | `invitation`, `code`, `url` | author |
| `preview_invitation` | `code` | campaign title, inviter display name, `message`, `status`, `expires_at` | anyone with the code |
| `list_invitations` | `campaign_id`, `status?` | `invitation[]` | author |
| `accept_invitation` | `code` | `campaign` | any signed-in user who is not a member |
| `decline_invitation` | `code` | none | any signed-in user who is not a member |
| `revoke_invitation` | `invitation_id` | none | author |

A user joins a campaign in exactly two ways: by accepting an invitation code, or through the campaign's invite link. Only the campaign's author creates either: `invite` issues a code, and `rotate_invite_link` issues the link. Players cannot invite. Cadmium has no operation that invites a specific account.

`invite` returns the invitation code once, together with the link `/invite/<code>`. The author passes either to the invitee by any means. A code is accepted at most once, by whichever signed-in user presents it, and expires after 14 days. `accept_invitation` and `decline_invitation` fail with `conflict` for a user who is already a member, and for an archived campaign. `invite` fails with `conflict` for an archived campaign. `preview_invitation` returns `not_found` for an unknown code and reveals nothing about members other than the inviter.

The campaign invite link (`rotate_invite_link`, `disable_invite_link`, `join_by_link`) admits any number of users until the author rotates or disables it. `rotate_invite_link` fails with `conflict` for an archived campaign.

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

`add_character` fails with `system_mismatch` if the campaign does not accept the character's system or the character fails the version check for characters in [Compatibility](systems/README.md#compatibility), and with `conflict` if the character is not `available` or is archived. `remove_character` in `paused` fails with `conflict` when the remaining characters would be fewer than the adventure's `players` minimum, so the instance can resume.

`start_instance` fails with `conflict` if the character count is outside the adventure's `players` range, or if dungeon generation fails.

A user with several characters in one instance passes `character_id` to `get_instance`, `submit_input`, and `submit_action`. With one character, it MAY be omitted.

#### Party changes

In a started instance, `add_character` and `remove_character` in `paused`, and a member leaving or being removed from the campaign, change the party. Each change is a commit whose input, `join` with the character's sheet or `leave` with the character's id, replays like any other input. Neither input emits an event.

- A joining character is placed in the room of the party's first character in id order, or in the adventure's start room when the party is empty or that character is outside every room. It stands on the room's first free cell, taking the room's area rectangle by rectangle, each in row-major order, and receives its carried items and the settings' starting items as at the start of play. In exploration it takes part in the current round.
- A leaving character is removed from state with the items it carries, which remain in the inventory of its written-back sheet, and from the round, the turn order, the combatants, and pending choices.
- When a member leaves or is removed and the instance is `active`, the Coordinator pauses it first if the remaining characters are fewer than the adventure's `players` minimum.

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

`cancel_session` without `occurrence_start` cancels the series: the session records when it was cancelled, occurrences whose `occurrence_start` is at or after that time are `cancelled`, and earlier occurrences keep their status. With `occurrence_start`, it cancels only that occurrence. `update_session` changes the whole series, including how its past occurrences are listed; the Scheduler does not repeat work it has already done for a past occurrence. `update_session` fails with `conflict` for a cancelled session, and `move_occurrence` for a cancelled occurrence.

Ending an instance closes its schedule. Its sessions are kept and listed as a record; `schedule_session`, `update_session`, `move_occurrence`, `cancel_session`, and `rsvp` fail with `conflict`; and the Scheduler sends no reminders and performs no automatic resume or pause for it.

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
| `publish_bundle` | `kind` (`setting`, `adventure`), `bundle` (compiled JSON, with `files?`) | `{ kind, id, version }` | Stores the bundle with `origin: operator` and `listed: true`. `bundle` MAY carry `files`, the asset files by hash ([spec/README.md](../spec/README.md#asset-files)): each file is checked against its asset's `hash` and `mime` and stored once by hash, and the bundle is stored without `files`. A file left out of `files` must already be stored; otherwise, and when a file does not match its asset, the operation fails with `invalid_request`. Fails with `conflict` if `(kind, id, version)` exists, and with `system_mismatch` if the bundle's system range matches no installed system version. For adventures, fails with `invalid_request` unless published settings satisfy `requires_settings`. |
| `set_listed` | `kind`, `id`, `version`, `listed` | none | Lists or unlists a version. Campaigns and instances that use it are unaffected. |
| `delete_bundle` | `kind`, `id`, `version` | none | Deletes a version of any bundle that nothing uses, as `delete_material` does for an author's own adventure: fails with `conflict`, giving the number of campaigns and games, while any campaign's materials or any instance's pinned materials name it. A version in use is unlisted instead. Logged in the operator log. |
| `inspect_instance` | `instance_id` | `instance` with full `state` | Returns unfiltered state, including hidden entities and secrets. |
| `replay_instance` | `instance_id`, `to_version?` | `{ state, matches_stored, diverges_at }` | Replays the committed inputs to `to_version` (default: latest), checking each commit's events against the stored events and stopping at the first commit that differs. Only the latest state is stored, so `matches_stored` is true when every commit through `to_version` reproduces its events and, when `to_version` is the latest version, the replayed state equals the stored state. `diverges_at` is the first version whose events do not reproduce, or the latest version when only the final state differs, and null when `matches_stored` is true; `state` is null when replay stops before `to_version`. An instance without commits replays to `{ state: null, matches_stored: true, diverges_at: null }`. |
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
| Open subscriptions per user | 4, in bindings whose server holds the connections |

Limits are deployment-configurable. Exceeding a limit returns `rate_limited` with `retry_after_ms`. `get_asset` does not count against the per-user limit, because assets are immutable and cached. A binding whose streams are pub/sub channels of a hosted service ([app-flow.md](app-flow.md#real-time-channels)) does not count subscriptions; the channel's authorization limits who may subscribe.

## Messages

Instance messages have `type`, `instance_id`, and `version`. Messages for one instance are ordered by `version`; messages sharing a version are ordered as listed in this table.

| Type | Payload | Recipients | Sent when |
|---|---|---|---|
| `commit` | `events[]`, `actor_id`, `input_id?` | all | A commit succeeds. `events` holds the commit's shared events; see [Event visibility](#event-visibility). |
| `round` | `number`, `mode`, `resolution`, `current?`, `declared[]`, `waiting_on[]`, `deadline?` | all | A round starts, a sequential turn starts, or a declaration is stored. `declared` lists character ids, not actions. |
| `declaration` | `character_id`, `tool`, `args`, `label` | declaring user | A declaration is stored or replaced. |
| `choice` | `character_id`, `prompt`, `options[]` of `{ id, label }` | the character's owner | The rules system returns a pending choice. |
| `narration` | `text`, `source` | all | Narration for a commit completes. |
| `action_menu` | `character_id`, `options[]` of `{ label, tool, args }` | the character's owner | The character's improvise streak reaches 4, or a round or turn starts while action-menu mode is enabled. |
| `input_rejected` | `input_id`, `reason` | submitting user | An input is not committed. |
| `instance_status` | `status`, `ending?` | all | Instance status changes. |
| `session_reminder` | `session_id`, `occurrence_start`, `starts_at` | members who have not answered `no` | At each of the member's reminder lead times. |

`deadline` is a timestamp at which the Coordinator invokes `advance`, or absent when timeouts are disabled.

### Event visibility

Event payloads can name hidden entities, secrets, flags, and stages, which no member sees. The Coordinator marks each event of a commit as *shared* or not when it commits, by these rules:

1. `flag_set`, `stage_set`, and `trigger_fired` are never shared, nor is `revealed` with a `secret`.
2. `room_light_changed` is shared once the room has been visited.
3. Any other event is shared when every entity, character, or item its payload names in `actor`, `target`, `entity`, `item`, `door`, `npc`, `to` (except in `moved`, where `to` names a room), or `participant` is visible to the party in the state before or after the commit.
4. Characters are always visible to the party. An item carried by a character is visible with its carrier; an item in a container is visible when a character perceives the container. Any other entity is visible when a character perceives it and it is not hidden from that character, as for [parser context](tools.md#parser-context).

The `commit` message and `get_history` carry only shared events, so history and live messages show members the same events. `inspect_instance` and `replay_instance` use every event.

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
| `register` | `POST /v1/users` (deployments without an identity provider) |
| `login` | `POST /v1/auth/token` (deployments without an identity provider) |
| `logout` | `DELETE /v1/auth/token` (deployments without an identity provider) |
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
| `list_reminders` | `GET /v1/me/reminders?days=` |
| calendar feed | `GET /v1/calendar/{secret}.ics` |
| `list_systems` | `GET /v1/systems` |
| `get_system_schema` | `GET /v1/systems/{system}/schemas/{kind}` |
| `list_materials` | `GET /v1/materials?system=&kind=&owner=` |
| `delete_material` | `DELETE /v1/materials/{kind}/{id}/{version}` |
| `create_draft` | `POST /v1/drafts` |
| `import_draft` | `POST /v1/drafts/import` (`application/zip`) |
| `list_drafts` | `GET /v1/drafts?archived=&limit=&cursor=` |
| `list_deleted_drafts` | `GET /v1/drafts/deleted` |
| `get_draft` | `GET /v1/drafts/{draft_id}` |
| `save_draft` | `PUT /v1/drafts/{draft_id}` |
| `validate_draft` | `POST /v1/drafts/{draft_id}/validate` |
| `export_draft` | `GET /v1/drafts/{draft_id}/export.zip` |
| `publish_draft` | `POST /v1/drafts/{draft_id}/publish` |
| `archive_draft` | `POST /v1/drafts/{draft_id}/archive` |
| `unarchive_draft` | `POST /v1/drafts/{draft_id}/unarchive` |
| `delete_draft` | `DELETE /v1/drafts/{draft_id}` |
| `restore_draft` | `POST /v1/drafts/{draft_id}/restore` |
| `create_character` | `POST /v1/characters` |
| `list_characters` | `GET /v1/characters?system=&status=&archived=&limit=&cursor=` |
| `list_deleted_characters` | `GET /v1/characters/deleted` |
| `get_character` | `GET /v1/characters/{character_id}` |
| `update_character` | `PATCH /v1/characters/{character_id}` |
| `rebuild_character` | `POST /v1/characters/{character_id}/rebuild` |
| `upload_asset` | `POST /v1/assets` (multipart) |
| `get_asset` | `GET /v1/assets/{hash}` |
| `retire_character` | `POST /v1/characters/{character_id}/retire` |
| `archive_character` | `POST /v1/characters/{character_id}/archive` |
| `unarchive_character` | `POST /v1/characters/{character_id}/unarchive` |
| `delete_character` | `DELETE /v1/characters/{character_id}` |
| `restore_character` | `POST /v1/characters/{character_id}/restore` |
| `create_campaign` | `POST /v1/campaigns` |
| `list_campaigns` | `GET /v1/campaigns?role=&archived=&limit=&cursor=` |
| `list_deleted_campaigns` | `GET /v1/campaigns/deleted` |
| `get_campaign` | `GET /v1/campaigns/{campaign_id}` |
| `update_campaign` | `PATCH /v1/campaigns/{campaign_id}` |
| `set_materials` | `PUT /v1/campaigns/{campaign_id}/materials` |
| `archive_campaign` | `POST /v1/campaigns/{campaign_id}/archive` |
| `unarchive_campaign` | `POST /v1/campaigns/{campaign_id}/unarchive` |
| `delete_campaign` | `DELETE /v1/campaigns/{campaign_id}` with `{ confirm }` |
| `restore_campaign` | `POST /v1/campaigns/{campaign_id}/restore` |
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

Log in, in a deployment without an identity provider:

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

The author sends the link to Rook. Rook signs in and accepts:

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
