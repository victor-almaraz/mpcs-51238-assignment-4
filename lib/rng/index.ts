// Random numbers (engine.md, "Random numbers"; generation.md, location seeds).
// No I/O and no clock: every value derives from a seed and a counter.

const MASK = (1n << 64n) - 1n;
const TWO_64 = 1n << 64n;

/** The algorithm identifier recorded with an instance. */
export const ALGORITHM = "splitmix64_v1";

/** A 64-bit seed or counter. */
export type U64 = bigint | number;

// SPEC_ISSUES.md#seed-range: data-model.md types the instance seed as `int` with no range.
// Numbers must be non-negative safe integers; bigints are reduced modulo 2^64.
function toU64(value: U64): bigint {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`${value} is not a non-negative safe integer`);
    }
    return BigInt(value);
  }
  return value & MASK;
}

/** `splitmix64_v1`: the draw for `seed` at `counter`. */
export function draw(seed: U64, counter: U64): bigint {
  let z = (toU64(seed) + (toU64(counter) + 1n) * 0x9e3779b97f4a7c15n) & MASK;
  z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK;
  z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK;
  return z ^ (z >> 31n);
}

/** 64-bit FNV-1a over the UTF-8 bytes of `text`. */
export function fnv1a64(text: string): bigint {
  let h = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(text)) {
    h ^= BigInt(byte);
    h = (h * 0x100000001b3n) & MASK;
  }
  return h;
}

/** The face a draw `v` gives on a die with `n` faces, or null when the draw is rejected. */
export function face(v: bigint, n: number): number | null {
  const faces = BigInt(n);
  return v < (TWO_64 / faces) * faces ? Number(v % faces) + 1 : null;
}

export interface DiceExpression {
  count: number;
  faces: number;
  modifier: number;
}

/** One roll of a dice expression: the faces in roll order, and their sum plus the modifier. */
export interface DiceRoll {
  dice: number[];
  total: number;
}

const DICE = /^([1-9][0-9]*)d([1-9][0-9]*)([+-][0-9]+)?$/;

/** Parses `NdM`, `NdM+K`, or `NdM-K`. */
export function parseDice(expr: string): DiceExpression {
  const m = DICE.exec(expr);
  if (!m) throw new SyntaxError(`'${expr}' is not a dice expression`);
  return { count: Number(m[1]), faces: Number(m[2]), modifier: m[3] ? Number(m[3]) : 0 };
}

/**
 * A stream of draws from one seed. Each draw uses the current counter and increments it by 1.
 * The engine passes one `Rng` through each resolution and stores `counter` afterwards.
 */
export class Rng {
  readonly seed: bigint;
  #counter: bigint;

  constructor(seed: U64, counter: U64 = 0) {
    this.seed = toU64(seed);
    this.#counter = toU64(counter);
  }

  /** The counter the next draw uses. */
  get counter(): number {
    return Number(this.#counter);
  }

  /** The next raw draw. */
  next(): bigint {
    const v = draw(this.seed, this.#counter);
    this.#counter += 1n;
    return v;
  }

  /** A die with `n` faces. Rejected draws consume counters. */
  die(n: number): number {
    if (!Number.isSafeInteger(n) || n < 1) throw new RangeError(`a die needs at least one face, got ${n}`);
    for (;;) {
      const result = face(this.next(), n);
      if (result !== null) return result;
    }
  }

  /** N dice in sequence, plus K. */
  roll(expr: string | DiceExpression): DiceRoll {
    const { count, faces, modifier } = typeof expr === "string" ? parseDice(expr) : expr;
    const dice: number[] = [];
    for (let i = 0; i < count; i++) dice.push(this.die(faces));
    return { dice, total: dice.reduce((a, b) => a + b, 0) + modifier };
  }

  /** Selection by RNG: a die with `list.length` faces, taking the item at index `result - 1`. */
  pick<T>(list: readonly T[]): T {
    if (list.length === 0) throw new RangeError("cannot pick from an empty list");
    return list[this.die(list.length) - 1]!;
  }
}
