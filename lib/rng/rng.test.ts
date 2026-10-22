import { describe, expect, it } from "vitest";
import { Rng, draw, face, fnv1a64, parseDice } from "./index";

const MAX = (1n << 64n) - 1n;

// engine.md, "Random numbers", test vectors.
describe("splitmix64_v1 vectors", () => {
  it.each([
    [0, 0, 0xe220a8397b1dcdafn],
    [0, 1, 0x6e789e6aa1b965f4n],
    [42, 0, 0xbdd732262feb6e95n],
  ])("draw(%i, %i)", (seed, counter, expected) => {
    expect(draw(seed, counter)).toBe(expected);
  });

  it("five d20 rolls, seed 42, counter from 0", () => {
    const rng = new Rng(42);
    expect([1, 2, 3, 4, 5].map(() => rng.die(20))).toEqual([14, 12, 19, 5, 11]);
    expect(rng.counter).toBe(5);
  });
});

describe("draw", () => {
  it("wraps seeds and counters modulo 2^64", () => {
    expect(draw(MAX + 1n, 0)).toBe(draw(0, 0));
    expect(draw(MAX, MAX)).toBe(draw(MAX, -1n));
  });

  it("rejects numbers that are not non-negative safe integers", () => {
    expect(() => draw(-1, 0)).toThrow(RangeError);
    expect(() => draw(2 ** 53, 0)).toThrow(RangeError);
    expect(() => draw(0.5, 0)).toThrow(RangeError);
  });
});

describe("dice", () => {
  it("rejects the draw at or above floor(2^64 / n) * n for a 3-sided die", () => {
    // 2^64 mod 3 = 1, so exactly one draw, 2^64 - 1, is rejected.
    expect(face(MAX, 3)).toBeNull();
    expect(face(MAX - 1n, 3)).toBe(Number((MAX - 1n) % 3n) + 1);
    expect(face(0n, 3)).toBe(1);
  });

  it("consumes a counter for every rejected draw", () => {
    const draws = [MAX, MAX, 4n];
    class Scripted extends Rng {
      calls = 0;
      override next(): bigint {
        return draws[this.calls++]!;
      }
    }
    const rng = new Scripted(0);
    expect(rng.die(3)).toBe(2);
    expect(rng.calls).toBe(3);
  });

  it("returns faces in [1, n]", () => {
    const rng = new Rng(7);
    for (const n of [1, 2, 3, 6, 20, 100]) {
      for (let i = 0; i < 200; i++) {
        const v = rng.die(n);
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(n);
      }
    }
  });

  it("increments the counter once per accepted draw on a d1", () => {
    const rng = new Rng(1, 10);
    expect(rng.die(1)).toBe(1);
    expect(rng.counter).toBe(11);
  });

  it("parses NdM, NdM+K, and NdM-K", () => {
    expect(parseDice("2d6")).toEqual({ count: 2, faces: 6, modifier: 0 });
    expect(parseDice("1d20+3")).toEqual({ count: 1, faces: 20, modifier: 3 });
    expect(parseDice("3d4-1")).toEqual({ count: 3, faces: 4, modifier: -1 });
    for (const bad of ["d6", "0d6", "2d0", "2d6+", "2 d6", "2d6*2"]) expect(() => parseDice(bad)).toThrow(SyntaxError);
  });

  it("rolls N dice in sequence and adds K", () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const roll = a.roll("3d20-2");
    expect(roll.dice).toEqual([b.die(20), b.die(20), b.die(20)]);
    expect(roll.total).toBe(roll.dice[0]! + roll.dice[1]! + roll.dice[2]! - 2);
    expect(a.counter).toBe(b.counter);
  });

  it("selects by RNG with a die of the list's length", () => {
    const list = ["a", "b", "c", "d", "e"];
    const a = new Rng(42);
    const b = new Rng(42);
    expect(a.pick(list)).toBe(list[b.die(5) - 1]);
    expect(() => a.pick([])).toThrow(RangeError);
  });
});

describe("fnv1a64", () => {
  // Published FNV-1a 64-bit vectors.
  it.each([
    ["", 0xcbf29ce484222325n],
    ["a", 0xaf63dc4c8601ec8cn],
    ["foobar", 0x85944171f73967e8n],
  ])("fnv1a64(%j)", (text, expected) => {
    expect(fnv1a64(text)).toBe(expected);
  });
});
