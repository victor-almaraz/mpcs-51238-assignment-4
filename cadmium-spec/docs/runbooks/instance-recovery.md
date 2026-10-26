# Runbook: Instance Recovery

## When to use

- A instance does not progress: players submit inputs, but no round resolves.
- Players report state that contradicts the event history, such as a dead enemy reappearing.
- A deployment failure interrupted commits.
- Narration or messages stopped for one instance while other instances work.
- A scheduled session did not resume or pause the instance.

## Prerequisites

- An account with `operator: true`.
- Access to the administrative operations in [api.md](../api.md#administrative-operations).
- Access to Coordinator logs for the instance id.

## Diagnose

1. Get the instance and its round state:

   ```
   inspect_instance(instance_id)
   ```

   Record `status`, `version`, `state.round`, and `state.mode`.

2. Match the symptom:

| Observation | Procedure |
|---|---|
| `round.waiting_on` is non-empty and no `deadline` is set or the deadline has passed | [A. Stalled round](#a-stalled-round) |
| Round is resolved but clients show an older version | [B. Clients behind](#b-clients-behind) |
| Players report wrong state | [C. State inconsistency](#c-state-inconsistency) |
| Coordinator logs show commit errors for the instance | [D. Failed commits](#d-failed-commits) |
| An occurrence passed without the expected resume or pause | [E. Missed schedule action](#e-missed-schedule-action) |

## A. Stalled round

1. Confirm the round timer exists in the Coordinator logs for the instance. If absent, the timer was lost, typically by a restart.
2. Advance the round:

   ```
   advance_round(instance_id)
   ```

   Under `sequential` resolution, this skips the current participant. Under `simultaneous` resolution, this closes the round; characters without declarations wait.

3. Confirm a `round` message with a higher `number` reaches clients, and that a new `deadline` is set.
4. If the timer was lost, restart the instance's timers by restarting the Coordinator worker that owns the instance, then repeat step 3 on the next round.

## B. Clients behind

1. Confirm the stored `version` exceeds the client's last received version.
2. Instruct clients to reconnect. Clients resubscribe with `after_version` and receive missed commits.
3. If messages still do not arrive, check the Broadcaster for the instance's subscription and restart it. State is unaffected.

## C. State inconsistency

1. Pause the instance:

   ```
   pause_instance(instance_id)
   ```

2. Replay and compare:

   ```
   replay_instance(instance_id)
   ```

3. If `matches_stored` is `true`, the state follows from the events. The report reflects game rules or narration, not corruption. Review the event history with `get_history` and compare against the narration. If narration contradicted events, record the case for the narrator evaluation set. Resume the instance.
4. If `matches_stored` is `false`, `diverges_at` is the first version that does not reproduce. Record the version before it, `diverges_at − 1`, as `last_good`.
5. Restore:

   ```
   restore_instance(instance_id, to_version=last_good, reason="replay divergence at <version>")
   ```

   This appends a `state_restored` event. No events are deleted. Actions after `last_good` are lost; inform the players.

6. Resume the instance and confirm play continues.
7. Escalate the divergence (see [Escalation](#escalation)). Divergence indicates a determinism defect.

## D. Failed commits

1. Pause the instance.
2. Confirm the store is reachable and accepting writes for other instances. If not, the incident is store-wide; follow the store's own recovery procedure first.
3. Run `replay_instance(instance_id)`. Because commits are atomic, a failed commit leaves no partial state; `matches_stored` is expected to be `true`.
4. Resume the instance. Inputs rejected during the failure are not retried by the server. Players resubmit them.

## E. Missed schedule action

1. Check the Scheduler log for the `(session_id, occurrence_start)` pair. Scheduler operations are idempotent per occurrence and moment.
2. If the operation is absent, call `resume_instance` or `pause_instance` manually.
3. If an occurrence end was missed, the rules system's `session_end` did not run for it. Re-run it by asking the Scheduler to replay that occurrence's end moment; idempotency prevents a double award.

## Rollback

`restore_instance` is itself reversible: a later `restore_instance` to a higher version replays the events committed before the first restore. To undo a restore, call `restore_instance` with `to_version` equal to the version immediately before the `state_restored` commit.

## Escalation

Escalate to the engine maintainers when:

- `replay_instance` reports `matches_stored: false`.
- A stalled round recurs after `advance_round`.
- A failed commit left `matches_stored: false`.

Include: instance id, rules system version, material versions, seed, `rng_algorithm`, first diverging version, and the output of `replay_instance` at that version and the version before it.
