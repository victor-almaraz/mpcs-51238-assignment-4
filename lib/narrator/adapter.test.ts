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
  scene: null,
  talk: null,
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

  it("tells the narrator that an improvise changed nothing, and lets flavor be a harmless gesture", () => {
    const improvise = (category: string) => narratorPrompt(context({ improvise: { category, intent: "climb the mast", suggestions: [], streak: 1 } }));
    expect(improvise("impossible")).toContain("never narrate its success or its result");
    expect(improvise("flavor")).toContain("nothing is gained, found, moved, opened, or harmed");
  });

  it("asks for the NPC's answer in direct speech: the topic's brief when one was raised, nothing new otherwise", () => {
    const talk = (topic: string | null) => narratorPrompt(context({ talk: { npc: "Liesl Brandt", disposition: "friendly", utterance: "Hello there", topic, topics: ["her map of the coast"] } }));
    expect(talk("her map of the coast")).toContain("Liesl Brandt's answer in one to three lines of direct speech");
    expect(talk("her map of the coast")).toContain("conveys every point of that topic's brief");
    expect(talk(null)).toContain("reveals nothing new");
    expect(talk(null)).toContain("hint at what they would talk about: her map of the coast");
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
