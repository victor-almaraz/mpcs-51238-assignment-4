import { describe, expect, it } from "vitest";
import { start, trialBundles } from "../engine/testing/world";
import { rejectionText } from "./rejections";

const bundles = trialBundles();
const state = start();

describe("rejectionText", () => {
  it("gives fixed sentences for codes whose details name arguments", () => {
    expect(rejectionText(state, bundles, { code: "not_your_turn", detail: "c_2 acts now" })).toBe("It is not your turn.");
    expect(rejectionText(state, bundles, { code: "invalid_call", detail: "ability 'x:y' needs a target_id" })).toBe("That action is not possible as given.");
    expect(rejectionText(state, bundles, { code: "blocked_by_condition", detail: "'stunned' blocks attack" })).toBe("A condition stops you from doing that.");
  });

  it("names characters and rooms by their labels", () => {
    expect(rejectionText(state, bundles, { code: "not_reachable", detail: "'c_1' is out of reach" })).toBe("Vale is out of reach.");
    expect(rejectionText(state, bundles, { code: "not_reachable", detail: "'hold' has not been seen" })).toBe("Hold has not been seen.");
    expect(rejectionText(state, bundles, { code: "blocked_by_condition", detail: "the character is dying" })).toBe("You are dying.");
  });
});
