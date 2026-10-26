import { describe, expect, it } from "vitest";
import { creationModuleFields } from "./cadmium/creation";
import { campaignChoices, chosenCampaign, quickStartFor } from "./creation";

const campaigns = [
  { id: "k1", title: "Lantern", system: "cadmium", modules: ["stash", "armor"], archived: false },
  { id: "k2", title: "Old", system: "cadmium", modules: ["armor"], archived: true },
  { id: "k3", title: "Plain", system: "quest", modules: [], archived: false },
  { id: "k4", title: "Bare", system: "cadmium", modules: [] },
];

describe("campaignChoices", () => {
  it("offers the unarchived campaigns of the form's system", () => {
    expect(campaignChoices(campaigns, "cadmium")).toEqual([
      { id: "k1", title: "Lantern", modules: ["stash", "armor"] },
      { id: "k4", title: "Bare", modules: [] },
    ]);
    expect(campaignChoices(campaigns, "quest").map((c) => c.id)).toEqual(["k3"]);
  });

  it("finds the chosen campaign, or none", () => {
    const choices = campaignChoices(campaigns, "cadmium");
    expect(chosenCampaign(choices, "k1")?.title).toBe("Lantern");
    expect(chosenCampaign(choices, "k3")).toBeUndefined();
    expect(chosenCampaign(choices, undefined)).toBeUndefined();
    expect(chosenCampaign(choices, "")).toBeUndefined();
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
