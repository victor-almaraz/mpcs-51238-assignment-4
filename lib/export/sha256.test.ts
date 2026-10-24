import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sha256 } from "./sha256";

describe("sha256", () => {
  it("matches the FIPS test vectors and node:crypto", () => {
    const enc = new TextEncoder();
    expect(sha256(enc.encode(""))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256(enc.encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    for (const n of [55, 56, 63, 64, 65, 1000, 70_000]) {
      const data = Uint8Array.from({ length: n }, (_, i) => (i * 31 + 7) & 0xff);
      expect(sha256(data)).toBe(createHash("sha256").update(data).digest("hex"));
    }
  });
});
