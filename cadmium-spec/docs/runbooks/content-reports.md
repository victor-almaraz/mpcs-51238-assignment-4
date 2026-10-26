# Runbook: Content Reports

## When to use

Someone writes to [EMAIL] reporting content that breaks the [Terms of Service](../legal/terms.md#4-what-you-may-upload) or infringes their rights.

## Prerequisites

- An account with `operator: true`.
- Access to the operator console and the Supabase project.

## Procedure

1. Inspect the reported content and the game history around it with `inspect_instance` or the record directly. View nothing unrelated to the report.
2. If the content appears to be illegal, set `held_at` and `hold_reason` on the records involved and on the account, so neither deletion nor shutdown erases them. Remove the content from other users' view and suspend the account. A suspended user may only read their own account, export their data, and sign out; they receive no messages or reminders ([api.md](../api.md#conventions)).
3. Contact the University of Chicago's legal counsel, who decides whether to report the content to the police or other authorities. Do not contact authorities or the user before that decision.
4. When the matter is closed, clear the hold. Purging proceeds as for any deletion.

If the content breaks the Terms of Service but does not appear to be illegal, remove it, end games, or suspend the account as the Terms allow, without a hold.

## Images

A reported image is an Asset. Set its `removed_at`, which stops it being served and makes clients fall back to icons and initials; the content that refers to it is unchanged. An apparently illegal image follows steps 2 and 3: hold the Asset and the account that uploaded it. A pack asset that breaks the Terms of Service is also removed from the pack in its next version.

## Records

Record the report date, the records inspected, the action taken, and any hold set or cleared. Keep the record with the hold for as long as the hold lasts.

## Escalation

The operator handles content that breaks the Terms of Service without appearing to be illegal. Only content that appears to be illegal, content involving a minor, and reports from an authority go to the University of Chicago's legal counsel, after the hold in step 2.
