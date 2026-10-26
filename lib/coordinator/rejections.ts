// Rejected tool calls as sentences for the player (api.md, Messages: input_rejected). Engine details
// name ids and argument names; the player sees labels, or a fixed sentence for the error code.

import { labelsFor, type Bundles, type EngineError, type State } from "../engine";
import { sentence } from "../text";

const FIXED: Partial<Record<EngineError["code"], string>> = {
  not_your_turn: "It is not your turn.",
  choice_pending: "Choose an option first.",
  instance_not_active: "The game is not running.",
  invalid_in_mode: "That is not possible during combat.",
  invalid_call: "That action is not possible as given.",
  unknown_id: "There is nothing like that here.",
};

/** A sentence for a rejected call: quoted ids become labels; codes whose details carry argument names get a fixed sentence. */
export function rejectionText(state: State, bundles: Bundles, error: EngineError): string {
  const fixed = FIXED[error.code];
  if (fixed) return fixed;
  if (error.code === "blocked_by_condition" && !error.detail.startsWith("the character is")) return "A condition stops you from doing that.";
  const labels = labelsFor([state], bundles);
  const label = (id: string) => {
    try {
      return [labels.entity(id), labels.room(id), labels.ability(id)].find((l) => l !== id) ?? id;
    } catch {
      return id;
    }
  };
  return sentence(error.detail.replace(/'([^']+)'/g, (_, id: string) => label(id)).replace(/^the character is/, "You are"));
}
