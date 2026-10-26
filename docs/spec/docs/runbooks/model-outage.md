# Runbook: Model Outage

## When to use

- The parser fallback rate rises: many inputs resolve as `improvise` with `category: "unclear"`.
- Narration arrives with `source: "template"` for most commits.
- Parser or narrator latency exceeds the adapter timeout.
- The model provider reports an incident.

## Prerequisites

- Access to the metrics in [tools.md](../tools.md#metrics).
- Access to adapter configuration: model id, endpoint, timeout, and enabled state for the parser and narrator.
- Access to the input log.

## Impact by role

| Failing role | Effect on play | State correctness |
|---|---|---|
| Narrator | Players receive template text. Play continues. | Unaffected. |
| Parser | Free-text inputs resolve as `improvise` (`unclear`). Players cannot act through text. `submit_action` and action menus still work. | Unaffected. |

Neither failure corrupts state. Recovery restores service; no data repair is needed.

## Procedure

1. Identify the failing role from metrics: parser fallback rate, narrator template rate, and latency per adapter.
2. Inspect recent input log entries with outcome `fallback`. Classify the failure:

| Pattern in logged model responses | Classification |
|---|---|
| Timeouts or connection errors | Provider unavailable or slow |
| Authentication or quota errors | Credential or billing issue |
| Responses with no tool call, several tool calls, or malformed arguments | Model behavior change |

3. Act on the classification:

   - **Provider unavailable or slow.** Switch the affected adapter to a configured secondary model, if one exists. Otherwise, for the parser, enable action-menu mode: the Coordinator sends `action_menu` on every round start so players can act through `submit_action`. Leave the narrator on template fallback.
   - **Credential or billing issue.** Rotate or restore the credential in adapter configuration.
   - **Model behavior change.** Pin the adapter to the last known-good model version. Run the parser evaluation set (see [guides/engine-implementation.md](../guides/engine-implementation.md#parser-evaluation-set)) against the current model before unpinning.

4. Optionally pause long-running instances if the parser will be unavailable for longer than a round timeout, so players do not time out repeatedly.
5. Confirm recovery: the fallback rate and template rate return to their baselines, and latency is under the timeout.
6. Disable action-menu mode if it was enabled, and resume any paused instances.

## Rollback

Every step is a configuration change. Revert adapter configuration to its previous values. No instance data changes.

## Escalation

Escalate to the model provider for provider-side incidents, with timestamps and request ids from the input log. Escalate to the engine maintainers when a model behavior change persists after pinning, with the failing parser evaluation cases attached.
