import { describe, expect, it } from "vitest";
import { creationModuleFields } from "./cadmium/creation";
import { abilitiesFor, campaignChoices, chosenCampaign, quickStartFor } from "./creation";

const coast = [{ namespace: "coast", title: "The Lantern Coast" }];
const campaigns = [
  { id: "k1", title: "Lantern", system: "cadmium", modules: ["stash", "armor"], archived: false, settings: coast },
  { id: "k2", title: "Old", system: "cadmium", modules: ["armor"], archived: true, settings: coast },
  { id: "k3", title: "Plain", system: "quest", modules: [], archived: false, settings: [{ namespace: "starter", title: "Quest Quick Start" }] },
  { id: "k4", title: "Bare", system: "cadmium", modules: [], settings: [] },
];
const accepts = (system: string) => (system === "cadmium" ? ["cadmium", "quest"] : [system]);

describe("campaignChoices", () => {
  it("offers the unarchived campaigns whose games take the form's system, with their settings", () => {
    expect(campaignChoices(campaigns, "cadmium", accepts)).toEqual([
      { id: "k1", title: "Lantern", modules: ["stash", "armor"], settings: coast },
      { id: "k4", title: "Bare", modules: [], settings: [] },
    ]);
  });

  it("offers a Quest character Cadmium campaigns too, without Cadmium's modules", () => {
    expect(campaignChoices(campaigns, "quest", accepts).map((c) => [c.id, c.modules])).toEqual([
      ["k1", []],
      ["k3", []],
      ["k4", []],
    ]);
  });

  it("finds the chosen campaign, or none", () => {
    const choices = campaignChoices(campaigns, "cadmium", accepts);
    expect(chosenCampaign(choices, "k1")?.title).toBe("Lantern");
    expect(chosenCampaign(choices, "k3")).toBeUndefined();
    expect(chosenCampaign(choices, undefined)).toBeUndefined();
    expect(chosenCampaign(choices, "")).toBeUndefined();
  });
});

describe("abilitiesFor", () => {
  const abilities = [{ ref: "coast:lamp" }, { ref: "starter:track" }, { ref: "base:overload" }];
  it("keeps the abilities of the campaign's settings, or all without a campaign", () => {
    const [lantern] = campaignChoices(campaigns, "cadmium", accepts);
    expect(abilitiesFor(abilities, lantern).map((a) => a.ref)).toEqual(["coast:lamp"]);
    expect(abilitiesFor(abilities, undefined)).toHaveLength(3);
  });
});

describe("creationModuleFields", () => {
  it("shows no fields without enabled modules", () => {
    expect(creationModuleFields([])).toEqual([]);
  });

  it("shows the starting armor pool and the carrying limit from modules.json, in canonical order", () => {
    const fields = creationModuleFields(["stash", "armor", "unknown"]);
    expect(fields.map((f) => f.module)).toEqual(["armor", "stash"]);
    expect(fields[0]).toMatchObject({ label: "Armor", value: "0/6" });
    expect(fields[1]).toMatchObject({ label: "Carrying limit", value: "12 items" });
    expect(fields[1]!.note).toContain("2 containers");
  });

  it("shows only the enabled module", () => {
    expect(creationModuleFields(["armor"]).map((f) => f.module)).toEqual(["armor"]);
    expect(creationModuleFields(["stash"]).map((f) => f.module)).toEqual(["stash"]);
  });
});

describe("quickStartFor", () => {
  const six = (setting: string, role: string) => Array.from({ length: 6 }, (_, i) => ({ ref: `${setting}:${role}_${i}`, roles: [role], setting }));

  it("is one setting's six abilities for the role alone", () => {
    expect(quickStartFor("invoker", six("Quick Start", "invoker"), 6)).toEqual(six("Quick Start", "invoker").map((a) => a.ref));
  });

  it("ignores another setting's ability for the same role, such as the Fantasy example's invoker prayer", () => {
    const abilities = [{ ref: "crypt:smite", roles: ["invoker"], setting: "Sunless Crypt" }, ...six("Quick Start", "invoker")];
    expect(quickStartFor("invoker", abilities, 6)).toHaveLength(6);
    expect(quickStartFor("invoker", abilities, 6)).not.toContain("crypt:smite");
  });

  it("leaves out abilities shared with another role, and is empty when no setting has exactly six", () => {
    const shared = [...six("Quick Start", "wizard").slice(0, 5), { ref: "q:both", roles: ["wizard", "magician"], setting: "Quick Start" }];
    expect(quickStartFor("wizard", shared, 6)).toEqual([]);
    expect(quickStartFor("ranger", six("Quick Start", "wizard"), 6)).toEqual([]);
  });
});
