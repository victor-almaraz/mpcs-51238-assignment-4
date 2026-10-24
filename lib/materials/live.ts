// The editor's validation of a draft (app-flow.md, Adventure editor: Validation): the schema layer
// (draft.schema.json and the system's schemas for system_stats and checks), the reference layer, and
// the semantic checks of the Content Compiler, then the plot's reachability warnings. The same
// composition the server stores on save (lib/api/drafts.ts, diagnose); pure, so it runs in the
// editor's Web Worker against the required settings' bundles the page supplies.

import type { SettingBundle } from "../bundle/setting";
import { toDraftDiagnostics, type DraftDiagnostic } from "./draft-io";
import { compileDraft } from "./index";
import { plotWarnings } from "./plot";

export function draftDiagnostics(document: Record<string, unknown>, settings: readonly SettingBundle[]): DraftDiagnostic[] {
  const r = compileDraft(document, settings);
  return [...toDraftDiagnostics(r.diagnostics), ...plotWarnings(document)];
}
