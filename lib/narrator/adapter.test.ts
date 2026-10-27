import { describe, expect, it } from "vitest";
import { narratorPrompt } from "./adapter";
import type { NarratorContext } from "./context";

const context = (over: Partial<NarratorContext> = {}): NarratorContext => ({
  style: { style: "spare", person: "second", max_sentences: 4 },
  actor: { id: "c_2", name: "Rook" },
  events: [],
  labels: {},
  dispositions: {},
  facts: [],
  improvise: null,
  room: null,
  positions: {},
  opening: null,
  ...over,
});

describe("narratorPrompt", () => {
  it("names the actor, since every player reads the narration", () => {
    const p = narratorPrompt(context());
    expect(p).toContain('Rook took this action: say "Rook", not "you"');
    expect(p).toContain('"you" means the whole party and never one character');
    expect(p).not.toContain("second person,");
  });

  it("writes in the third person when the setting asks for it", () => {
    const p = narratorPrompt(context({ style: { style: "plain", person: "third", max_sentences: 3 } }));
    expect(p).toContain("Write in the third person.");
    expect(p).not.toContain('"you" means');
  });

  it("names no actor for the opening, which has none", () => {
    const p = narratorPrompt(context({ actor: null, opening: { title: "T", premise: null, text: null, party: ["Vale", "Rook"] } }));
    expect(p).not.toContain("took this action");
    expect(p).toContain("Name the party.");
  });
});
