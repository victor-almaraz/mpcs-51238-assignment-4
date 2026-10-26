# Runbook: Data Requests

## When to use

A user writes to [EMAIL] about their data. Seeing, exporting, correcting, and deleting data are self-service in Settings, as the [Privacy Policy](../legal/privacy.md#6-your-rights-and-controls) states; this runbook covers requests a user cannot complete there, and users who ask for help with those features.

## Prerequisites

- An account with `operator: true`.
- Access to the Clerk dashboard and the Supabase project.

## Procedure

1. Confirm identity: reply to the email address on the account and ask the requester to confirm the request from it. Do not act on requests from other addresses.
2. Record the request date. The answer is due within 30 days. There is no charge.
3. Act on the request:

| Request | Action |
|---|---|
| See, export, correct, or delete, with a working account | Reply with the Settings path from the Privacy Policy. If the user cannot use it, run the operation for them: `export_my_data` and send the ZIP to the account email; correct the field; `request_account_deletion` |
| Any of these, without access to the account | Run the operation for the user after step 1 |
| A copy of the user's data after shutdown | Run `export_my_data` for the user as an operator and send the ZIP to the account email, until 90 days after shutdown |
| Object to or restrict processing | Set the account's `status` to `closing` with `deletion_requested_at` left null, which stops all activity without scheduling a purge; reply to discuss; escalate if unclear |
| Delete sooner than 90 days | Refuse; deleted data is kept for 90 days for reports, disputes, and requests from authorities, as the Privacy Policy states |
| Another user's data | Refuse; a user receives only their own data |
| Information not in the export, such as provider logs | Reply with what Cadmium holds and which provider holds the rest, under the providers listed in the Privacy Policy |

4. Reply with what was done and, for deletion, when it completes, including that provider backups and logs follow their own retention.

## Refusals and review

When a request cannot be met, reply with the reason. If the user asks for a review, the operator reconsiders the request and replies with the outcome within 30 days.

## Legal requests

A request from a court, police, or other authority is a serious matter; see [Escalation](#escalation). Do not disclose or preserve data on the strength of an email alone.

## Breaches

When a breach may affect personal data, escalate at once. Affected users are told without undue delay what happened, what data was involved, and what they can do.

## Escalation

The operator handles every request in this runbook except serious matters: requests from a court, police, or other authority; suspected breaches; and anything involving a minor. For a serious matter, place a hold on the records involved, take no other action, reply to the sender that the matter is under review, and contact the University of Chicago's legal counsel.
