// UI components registered by system id (app-flow.md, Character creation and editor). Cadmium's
// components extend Quest's: the sheet view shows the armor pool when the armor module filled it;
// without a campaign, creation shows no module fields.
import { QuestCreationForm, QuestSheetView } from "./quest";

export const SYSTEM_UI = {
  quest: { CreationForm: QuestCreationForm, SheetView: QuestSheetView },
  cadmium: { CreationForm: QuestCreationForm, SheetView: QuestSheetView },
} as const;

export type SystemUiId = keyof typeof SYSTEM_UI;

export function systemUi(id: string) {
  return (SYSTEM_UI as Record<string, (typeof SYSTEM_UI)[SystemUiId] | undefined>)[id];
}
