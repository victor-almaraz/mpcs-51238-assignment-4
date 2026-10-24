// The element-style symbols of names (components/ui/tile.tsx).
import { describe, expect, it } from "vitest";
import { elementSymbol } from "../components/ui/tile";

describe("elementSymbol", () => {
  it.each([
    ["Wren Halloway", "Wh"],
    ["The Sunken Archive", "Sa"],
    ["Rook", "Ro"],
    ["Sister Agathe", "Sa"],
    ["Errands on the Lantern Coast", "El"],
    ["sunken_archive", "Sa"],
    ["Bo the Cartographer", "Bc"],
    ["A", "A"],
    ["", "?"],
  ])("%s is %s", (name, symbol) => {
    expect(elementSymbol(name)).toBe(symbol);
  });
});
