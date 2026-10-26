/** Randomness the server supplies: seeds, record ids, and codes. Injected so tests are deterministic. */
export interface Entropy {
  seed(): number;
  id(prefix: string): string;
  /** A code of `length` characters from Crockford's base32 alphabet. */
  code(length: number): string;
}

const BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export const cryptoEntropy: Entropy = {
  seed() {
    const [hi, lo] = crypto.getRandomValues(new Uint32Array(2));
    // engine.md, "Random numbers": uniform in [0, 2^53 − 1], so the seed survives JSON.
    return (hi! & 0x1fffff) * 2 ** 32 + lo!;
  },
  id(prefix) {
    const bytes = crypto.getRandomValues(new Uint8Array(10));
    return `${prefix}_${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  },
  code(length) {
    // 256 is a multiple of 32, so taking each byte modulo 32 is uniform.
    return [...crypto.getRandomValues(new Uint8Array(length))].map((b) => BASE32[b % 32]).join("");
  },
};
