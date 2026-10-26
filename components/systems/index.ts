// UI components registered by system id (app-flow.md, Character creation and editor). Cadmium's
// components extend Quest's: the sheet view shows the armor pool when the armor module filled it;
// creation shows module fields for the chosen campaign's modules; the StatsEditor shows module fields only for the
// draft's enabled modules and names the ones it hides.
import { CadmiumCreationForm } from "./cadmium";
import { QuestCreationForm, QuestSheetView } from "./quest";
import { CadmiumStatsEditor, QuestStatsEditor } from "./stats-editor";

export type { StatsEditorProps } from "./stats-editor";

const SYSTEM_UI = {
  quest: { CreationForm: QuestCreationForm, SheetView: QuestSheetView, StatsEditor: QuestStatsEditor },
  cadmium: { CreationForm: CadmiumCreationForm, SheetView: QuestSheetView, StatsEditor: CadmiumStatsEditor },
} as const;

export type SystemUiId = keyof typeof SYSTEM_UI;

export function systemUi(id: string) {
  return (SYSTEM_UI as Record<string, (typeof SYSTEM_UI)[SystemUiId] | undefined>)[id];
}
