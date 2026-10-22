import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  MapError,
  TerrainGrid,
  adjacent,
  direction,
  distance,
  findPath,
  footprintDistance,
  footprintSees,
  footprintsAdjacent,
  footprintsOverlap,
  line,
  parseMap,
  reachable,
  sees,
  sightLine,
  walk,
  type Cell,
  type Footprint,
  type Metric,
  type MoveRules,
} from "./index";

const grid = (rows: string[]): TerrainGrid => new TerrainGrid(parseMap(rows));

function rules(g: TerrainGrid, metric: Metric, footprint?: Footprint): MoveRules {
  return {
    metric,
    footprint,
    open: (c) => !g.blocksMovement(c),
    blocksMovement: (c) => g.blocksMovement(c),
    cost: (c) => g.cost(c),
  };
}

const crypt = grid(["#########", "#...#...#", "#.#.#.#.#", "#.......#", "#########"]);
const hall = grid(["#######", "#.....#", "#.....#", "#.....#", "#######"]);
const sight = (g: TerrainGrid) => (c: Cell) => g.blocksSight(c);

// engine.md, "Test vectors" under "Space".
describe("engine.md geometry vectors", () => {
  it("line([0, 0], [5, 2])", () => {
    expect(line([0, 0], [5, 2])).toEqual([
      [0, 0],
      [1, 0],
      [2, 1],
      [3, 1],
      [4, 2],
      [5, 2],
    ]);
  });

  it("crypt: [1, 1] sees [3, 1]", () => expect(sees([1, 1], [3, 1], sight(crypt))).toBe(true));
  it("crypt: [1, 1] does not see [5, 1]", () => expect(sees([1, 1], [5, 1], sight(crypt))).toBe(false));
  it("crypt: [1, 3] does not see [7, 1]", () => expect(sees([1, 3], [7, 1], sight(crypt))).toBe(false));

  it("crypt, chebyshev, cost 1: path [1, 1] → [7, 1]", () => {
    expect(findPath([1, 1], [[7, 1]], rules(crypt, "chebyshev"))).toEqual([
      [1, 1],
      [2, 1],
      [3, 1],
      [3, 2],
      [3, 3],
      [4, 3],
      [5, 3],
      [5, 2],
      [5, 1],
      [6, 1],
      [7, 1],
    ]);
  });

  it("hall, chebyshev, cost 1: path [1, 1] → [4, 3]", () => {
    expect(findPath([1, 1], [[4, 3]], rules(hall, "chebyshev"))).toEqual([
      [1, 1],
      [2, 1],
      [3, 2],
      [4, 3],
    ]);
  });

  it("hall, manhattan, cost 1: path [1, 1] → [4, 3] has 6 cells", () => {
    expect(findPath([1, 1], [[4, 3]], rules(hall, "manhattan"))).toHaveLength(6);
  });

  it("hall, chebyshev: the nearest of several goals ends at [1, 1]", () => {
    const path = findPath(
      [3, 2],
      [
        [5, 1],
        [1, 3],
        [1, 1],
        [5, 3],
      ],
      rules(hall, "chebyshev"),
    );
    expect(path?.at(-1)).toEqual([1, 1]);
  });

  it("hall, chebyshev, footprint [2, 2]: path [1, 1] → [4, 2]", () => {
    expect(findPath([1, 1], [[4, 2]], rules(hall, "chebyshev", [2, 2]))).toEqual([
      [1, 1],
      [2, 1],
      [3, 1],
      [4, 2],
    ]);
  });

  it("a diagonal between two walls is not adjacent, so there is no path", () => {
    const g = grid(["####", "#.##", "##.#", "####"]);
    expect(adjacent([1, 1], [2, 2], "chebyshev", (c) => g.blocksMovement(c))).toBe(false);
    expect(findPath([1, 1], [[2, 2]], rules(g, "chebyshev"))).toBeNull();
  });

  it.each([
    [0, 0, "here"],
    [3, -1, "east"],
    [2, 2, "south-east"],
    [1, 3, "south"],
    [-4, 1, "west"],
    [0, -2, "north"],
    [-1, -1, "north-west"],
    [2, -3, "north-east"],
    [-3, 2, "south-west"],
  ] as const)("direction(%i, %i) is %s", (dx, dy, label) => {
    expect(direction(dx, dy)).toBe(label);
  });
});

describe("maps", () => {
  it("parses built-in characters and legend entries", () => {
    const map = parseMap(["..o..", ".~~. "], { "~": "coolant", o: { terrain: "floor", place: "support_pillar" } });
    expect(map.width).toBe(5);
    expect(map.height).toBe(2);
    expect(map.terrain).toEqual(["floor", "floor", "floor", "floor", "floor", "floor", "coolant", "coolant", "floor", "void"]);
    expect(map.placements).toEqual([{ at: [2, 0], ref: "support_pillar" }]);
  });

  it.each([
    [["..", "..."], {}, /row 1 has 3/],
    [[], {}, /1 to 64 rows/],
    [[""], {}, /1 to 64 characters/],
    [[".".repeat(65)], {}, /1 to 64 characters/],
    [Array<string>(65).fill("."), {}, /1 to 64 rows/],
    [[".x."], {}, /'x' at \[1, 0\] is not in the legend/],
    [["..."], { ".": "coolant" }, /cannot redefine '.'/],
    [["..."], { "#": "coolant" }, /cannot redefine '#'/],
  ])("rejects %j", (rows, legend, message) => {
    expect(() => parseMap(rows, legend)).toThrow(message);
    expect(() => parseMap(rows, legend)).toThrow(MapError);
  });

  it("applies declared terrain and treats cells outside the map as void", () => {
    const g = new TerrainGrid(parseMap([".~r"], { "~": "water", r: "rubble" }), {
      water: { obstructs: [], cost: 2 },
      rubble: { obstructs: ["movement"], cost: 1 },
    });
    expect(g.cost([1, 0])).toBe(2);
    expect(g.blocksMovement([2, 0])).toBe(true);
    expect(g.blocksSight([2, 0])).toBe(false);
    expect(g.terrain([3, 0])).toBe("void");
    expect(g.blocksMovement([-1, 0])).toBe(true);
    expect(g.blocksSight([0, 1])).toBe(true);
  });

  it("rejects undeclared terrain and costs outside 1-4", () => {
    expect(() => new TerrainGrid(parseMap(["~"], { "~": "lava" }))).toThrow(/'lava' is not declared/);
    expect(() => new TerrainGrid(parseMap(["~"], { "~": "mud" }), { mud: { obstructs: [], cost: 5 } })).toThrow(/cost 5/);
  });
});

describe("distance and footprints", () => {
  it("uses the metric", () => {
    expect(distance([1, 1], [4, 3], "chebyshev")).toBe(3);
    expect(distance([1, 1], [4, 3], "manhattan")).toBe(5);
  });

  it("measures between the nearest cells of two footprints", () => {
    expect(footprintDistance([0, 0], [2, 2], [3, 3], [1, 1], "chebyshev")).toBe(2);
    expect(footprintDistance([0, 0], [2, 2], [3, 3], [1, 1], "manhattan")).toBe(4);
    expect(footprintDistance([0, 0], [3, 1], [1, 0], [1, 1], "chebyshev")).toBe(0);
  });

  it("detects overlap and adjacency of footprints", () => {
    const none = () => false;
    expect(footprintsOverlap([0, 0], [2, 2], [1, 1], [1, 1])).toBe(true);
    expect(footprintsOverlap([0, 0], [2, 2], [2, 0], [1, 1])).toBe(false);
    expect(footprintsAdjacent([0, 0], [2, 2], [2, 2], [1, 1], "chebyshev", none)).toBe(true);
    expect(footprintsAdjacent([0, 0], [2, 2], [2, 2], [1, 1], "manhattan", none)).toBe(false);
  });

  it("sees between footprints when any pair of cells sees", () => {
    // The 2-wide entity's right cell sees past the pillar that blocks its left cell.
    const g = grid([".....", ".#...", "....."]);
    expect(sees([0, 0], [1, 2], sight(g))).toBe(true);
    expect(sees([1, 0], [1, 2], sight(g))).toBe(false);
    expect(footprintSees([1, 0], [2, 1], [1, 2], [1, 1], sight(g))).toBe(true);
  });

  it("returns the clear sight line, trying line(a, b) before line(b, a)", () => {
    expect(sightLine([1, 1], [3, 1], sight(crypt))).toEqual([
      [1, 1],
      [2, 1],
      [3, 1],
    ]);
    expect(sightLine([1, 1], [5, 1], sight(crypt))).toBeNull();
  });
});

describe("pathfinding", () => {
  it("returns the start alone when it is a goal, and null for no goals", () => {
    expect(findPath([1, 1], [[1, 1]], rules(hall, "chebyshev"))).toEqual([[1, 1]]);
    expect(findPath([1, 1], [], rules(hall, "chebyshev"))).toBeNull();
  });

  // SPEC_ISSUES.md#footprint-movement: every footprint cell obeys the corner rule.
  it("does not let any cell of a footprint cut a blocked corner", () => {
    const g = grid(["######", "#..#.#", "#....#", "#....#", "######"]);
    expect(findPath([1, 1], [[2, 2]], rules(g, "chebyshev", [2, 2]))).toEqual([
      [1, 1],
      [1, 2],
      [2, 2],
    ]);
  });

  it("prefers cheaper terrain over fewer cells", () => {
    const g = new TerrainGrid(parseMap(["#####", "#.~.#", "#...#", "#####"], { "~": "water" }), {
      water: { obstructs: [], cost: 4 },
    });
    const path = findPath([1, 1], [[3, 1]], rules(g, "manhattan"))!;
    expect(path).not.toContainEqual([2, 1]);
    expect(path).toHaveLength(5);
  });

  it("lists reachable cells in (cost, y, x) order within a limit", () => {
    const cells = reachable([1, 1], rules(hall, "chebyshev"), 1).map((r) => r.cell);
    expect(cells).toEqual([
      [1, 1],
      [2, 1],
      [1, 2],
      [2, 2],
    ]);
  });
});

describe("walking", () => {
  const path: Cell[] = [
    [1, 1],
    [2, 1],
    [3, 1],
    [4, 1],
  ];
  const cost = () => 1;

  it("walks the whole path without an allowance", () => {
    expect(walk(path, { allowance: null, cost, free: () => true })).toEqual({ index: 3, spent: 3, stopped: "arrived" });
  });

  it("stops within the allowance", () => {
    expect(walk(path, { allowance: 2, cost, free: () => true })).toEqual({ index: 2, spent: 2, stopped: "allowance" });
  });

  it("passes through cells that are not free and stops on the last free one", () => {
    const ally: Cell = [3, 1];
    const free = (c: Cell) => !(c[0] === ally[0] && c[1] === ally[1]);
    expect(walk(path, { allowance: 3, cost, free })).toEqual({ index: 3, spent: 3, stopped: "arrived" });
    expect(walk(path.slice(0, 3), { allowance: null, cost, free })).toEqual({ index: 1, spent: 1, stopped: "short" });
    expect(walk(path, { allowance: 2, cost, free })).toEqual({ index: 1, spent: 1, stopped: "allowance" });
  });

  it("stops early where stopAt holds", () => {
    const stopAt = (_: Cell, i: number) => i === 2;
    expect(walk(path, { allowance: null, cost, free: () => true, stopAt })).toEqual({ index: 2, spent: 2, stopped: "early" });
  });
});

// engine-implementation.md, "Test strategy": sight is symmetric for every cell pair of a map;
// paths never cut a blocked corner.
describe("grid properties", () => {
  const arbitraryMap = fc
    .tuple(fc.integer({ min: 2, max: 10 }), fc.integer({ min: 2, max: 10 }))
    .chain(([w, h]) => fc.array(fc.array(fc.constantFrom(".", ".", ".", "#"), { minLength: w, maxLength: w }), { minLength: h, maxLength: h }))
    .map((rows) => grid(rows.map((r) => r.join(""))));

  it("sight is symmetric for every cell pair", () => {
    fc.assert(
      fc.property(arbitraryMap, (g) => {
        const cells = [...g.cells()];
        for (const a of cells) for (const b of cells) if (sees(a, b, sight(g)) !== sees(b, a, sight(g))) return false;
        return true;
      }),
      { numRuns: 100 },
    );
  });

  it("paths are connected, open, and never cut a blocked corner", () => {
    fc.assert(
      fc.property(arbitraryMap, fc.constantFrom<Metric>("chebyshev", "manhattan"), (g, metric) => {
        const open = [...g.cells()].filter((c) => !g.blocksMovement(c));
        if (open.length < 2) return true;
        const r = rules(g, metric);
        for (const goal of open.slice(1)) {
          const path = findPath(open[0]!, [goal], r);
          if (path === null) continue;
          for (let i = 1; i < path.length; i++) {
            if (!adjacent(path[i - 1]!, path[i]!, metric, r.blocksMovement) || g.blocksMovement(path[i]!)) return false;
          }
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });

  it("finds the cheapest path: its cost equals the reachable cost", () => {
    fc.assert(
      fc.property(arbitraryMap, (g) => {
        const open = [...g.cells()].filter((c) => !g.blocksMovement(c));
        if (open.length === 0) return true;
        const r = rules(g, "chebyshev");
        for (const { cell, cost, path } of reachable(open[0]!, r)) {
          const found = findPath(open[0]!, [cell], r)!;
          const spent = found.slice(1).reduce((s, c) => s + g.cost(c), 0);
          if (spent !== cost || found.length !== path.length) return false;
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });
});
