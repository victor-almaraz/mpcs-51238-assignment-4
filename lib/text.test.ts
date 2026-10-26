import { describe, expect, it } from "vitest";
import { capitalize, plural, sentence } from "./text";

describe("text", () => {
  it("capitalizes, makes sentences, and counts", () => {
    expect(capitalize("fighter")).toBe("Fighter");
    expect(sentence("the game is paused")).toBe("The game is paused.");
    expect(sentence("Already done!")).toBe("Already done!");
    expect(plural(1, "draft")).toBe("1 draft");
    expect(plural(3, "draft")).toBe("3 drafts");
    expect(plural(2, "ability", "abilities")).toBe("2 abilities");
  });
});
