# Running a Campaign

This guide walks a campaign author through the lifecycle of play: creating a campaign, inviting players, creating an instance, adding characters, scheduling sessions, and playing. Every step names the API operation a client calls; see [api.md](../api.md).

## Campaigns and instances

| | Campaign | Instance |
|---|---|---|
| What it is | The prepared game: system, materials, members | One playthrough of that game |
| Holds state | No | Yes: world state, events, characters |
| Has a schedule | No | Yes |
| Created by | Any user, who becomes its author | The campaign's author |
| How many | One per prepared game | Any number per campaign |

Typical uses of several instances: two groups playing the same campaign on different nights, or one group replaying with new characters.

## 1. Create the campaign

Choose a rules system, then materials written for it: one adventure and the settings it requires.

```
create_campaign(title="The Sunken Archive", system="quest", system_versions="^1.0",
                materials=[{kind: setting, id: derelict_station, version: 3.0.0},
                           {kind: adventure, id: sunken_archive, version: 2.0.0}])
```

`list_systems` and `list_materials(system="quest")` show what is available. A material for another system is rejected with `system_mismatch`.

## 2. Invite players

Create a single-use invitation and send its link to the player by any means, such as a chat message:

```
invite(campaign_id, message="Join us Tuesdays.", note="for Rook")   -> code, url
```

Or enable a reusable campaign link and share its code:

```
rotate_invite_link(campaign_id)   -> "SPARK-7Q2M"
```

| Method | Best for | Control |
|---|---|---|
| Invitation code | One specific player | Single-use; whoever accepts it while signed in becomes a member; expires after 14 days; revoke to cancel |
| Invite link | A group | Anyone with the code joins; rotate or disable to stop |

Cadmium has no user search and sends no email; give codes only to people you know. The invitee opens the link, signs in or signs up, and calls `accept_invitation(code)` or `decline_invitation(code)`. Accepting makes them a member with role `player`. `list_invitations(campaign_id)` shows each code's note and status, and `revoke_invitation` cancels an unused one. Cadmium shows the code once; create a new invitation if it is lost.

## 3. Create an instance

```
create_instance(campaign_id, name="Tuesday group")
```

The instance pins the current rules-system version and material versions. Later changes to the campaign's materials apply only to instances created afterwards.

## 4. Add characters

Each member creates a character for the campaign's system, then adds it:

```
create_character(system="quest", name="Rook", choices={role: "ranger", abilities: [...]})
add_character(instance_id, character_id)
```

A character can be in one instance at a time. Characters from another system are rejected with `system_mismatch`.

## 5. Schedule sessions

Scheduling is optional. It gives the group shared times, reminders, and RSVPs, and can resume and pause play automatically.

```
schedule_session(instance_id, title="Weekly game",
                 starts_at="2026-10-20T18:00:00Z", timezone="Europe/Berlin", duration_minutes=180,
                 recurrence={freq: weekly, interval: 1, count: 10},
                 auto_resume=true, auto_pause=true)
```

| Setting | Effect |
|---|---|
| `recurrence` | Weekly or every 2–4 weeks; up to 52 occurrences. Local time stays fixed across daylight-saving changes. |
| `auto_resume` | A paused instance resumes at each occurrence start. |
| `auto_pause` | The instance pauses at each occurrence end, after the current round closes. |

Members answer with `rsvp(session_id, occurrence_start, "yes" | "no" | "maybe")`. Each member who has not answered `no` gets reminders at their chosen lead times, 24 hours and 15 minutes before by default: in Cadmium's notifications, and as browser notifications on every browser where they enabled them in Settings. `export_calendar(instance_id)` returns an iCalendar file, and each member's calendar feed (`get_calendar_feed`) keeps a calendar application up to date with all their sessions.

To change plans: `move_occurrence` moves one date, `cancel_session` with `occurrence_start` cancels one date, and `cancel_session` without it cancels the rest of the series.

When an occurrence ends, the rules system applies its end-of-session rules to every character, for example Quest's Adventure Point award.

## 6. Play

```
start_instance(instance_id)
```

Players submit text with `submit_input` and follow the instance stream with `subscribe`. Between sessions, the author pauses the instance or lets `auto_pause` do it. With `auto_pause` off, play can continue asynchronously between scheduled sessions.

## 7. Finish

`end_instance` ends play and writes every character's sheet back to its Character record. The campaign remains, and the author can create a new instance from it.

`archive_campaign` closes the campaign to new instances, members, and invitations. Ended instances and their histories remain readable.
