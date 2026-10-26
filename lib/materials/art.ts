// Art checks (setting-packs.md, "Art"; spec/README.md, "Checks"): every art ref resolves, no `art`
// list repeats a kind, every asset file exists with an allowed type and within the limits, and
// every asset has `alt` and any required `credit`.

import { sha256 } from "../export/sha256";
import type { Segment } from "./diagnostics";
import type { Diagnostics } from "./pack";
import type { JsonObject } from "./walk";

type Kind = "icon" | "portrait" | "tile";
type FileType = "svg" | "png" | "webp";

const ALLOWED: Readonly<Record<FileType, readonly Kind[]>> = { svg: ["icon", "tile"], png: ["portrait", "tile"], webp: ["portrait", "tile"] };
const MAX_BYTES: Readonly<Record<FileType, number>> = { svg: 200 * 1024, png: 1024 * 1024, webp: 1024 * 1024 };
const MAX_PIXELS: Readonly<Partial<Record<Kind, number>>> = { portrait: 1024, tile: 256 };

// The Creative Commons attribution family requires `credit` (setting-packs.md, "Art").
function requiresCredit(license: string): boolean {
  return /^CC-BY(-|$)/.test(license);
}

const u32be = (b: Uint8Array, o: number) => ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;
const u16le = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);
const u24le = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16);
const ascii = (b: Uint8Array, o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n));

/** Pixel size of a PNG or WebP image, or null when the bytes are not that format. */
export function imageSize(type: "png" | "webp", b: Uint8Array): { width: number; height: number } | null {
  if (type === "png") {
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (b.length < 24 || !sig.every((v, i) => b[i] === v) || ascii(b, 12, 4) !== "IHDR") return null;
    return { width: u32be(b, 16), height: u32be(b, 20) };
  }
  if (b.length < 30 || ascii(b, 0, 4) !== "RIFF" || ascii(b, 8, 4) !== "WEBP") return null;
  const chunk = ascii(b, 12, 4);
  if (chunk === "VP8 ") return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
  if (chunk === "VP8L") {
    const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X") return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
  return null;
}

/** Checks the declarations in `assets.yaml` against the files under `assets/`. */
export function checkAssets(assets: Readonly<Record<string, JsonObject>>, file: string, files: ReadonlyMap<string, Uint8Array>, out: Diagnostics): void {
  for (const [key, asset] of Object.entries(assets)) {
    const kind = asset.kind as Kind;
    const license = (asset.license as string | undefined) ?? "CC0-1.0";
    if (requiresCredit(license) && typeof asset.credit !== "string") {
      out.add(file, [key], `license ${license} requires 'credit'`, "art");
    }
    const source = asset.source as JsonObject;
    if (typeof source.file !== "string") continue;
    const path = source.file;
    const type = path.slice(path.lastIndexOf(".") + 1) as FileType;
    const at: Segment[] = [key, "source", "file"];
    if (!ALLOWED[type].includes(kind)) {
      out.add(file, at, `a ${kind} cannot be ${type.toUpperCase()}; allowed: ${(Object.keys(ALLOWED) as FileType[]).filter((t) => ALLOWED[t].includes(kind)).join(", ")}`, "art");
      continue;
    }
    const content = files.get(path);
    if (!content) {
      out.add(file, at, `file '${path}' does not exist`, "art");
      continue;
    }
    if (content.length > MAX_BYTES[type]) {
      out.add(file, at, `'${path}' has ${content.length} bytes; the limit for ${type.toUpperCase()} is ${MAX_BYTES[type]}`, "art");
      continue;
    }
    if (type === "svg") continue;
    const size = imageSize(type, content);
    if (!size) {
      out.add(file, at, `'${path}' is not a ${type.toUpperCase()} image`, "art");
      continue;
    }
    const max = MAX_PIXELS[kind];
    if (max !== undefined && (size.width > max || size.height > max)) {
      out.add(file, at, `'${path}' is ${size.width} x ${size.height} px; a ${kind} is at most ${max} x ${max}`, "art");
    }
  }
}

/** Checks one `art` list: no two assets of one kind. Ref resolution is checked with the other refs. */
export function checkArtList(
  art: readonly string[],
  kindOf: (ref: string) => Kind | undefined,
  file: string,
  path: Segment[],
  out: Diagnostics,
): void {
  const seen = new Map<Kind, string>();
  for (const ref of art) {
    const kind = kindOf(ref);
    if (!kind) continue;
    const prior = seen.get(kind);
    if (prior) out.add(file, path, `'${ref}' and '${prior}' are both ${kind}s; an art list holds at most one of each kind`, "art");
    seen.set(kind, ref);
  }
}

/** An asset file as it travels with a built bundle, keyed by its SHA-256. */
export interface AssetFile {
  mime: "image/svg+xml" | "image/png" | "image/webp";
  data: Uint8Array;
  width?: number;
  height?: number;
}

const MIME: Readonly<Record<FileType, AssetFile["mime"]>> = { svg: "image/svg+xml", png: "image/png", webp: "image/webp" };

// A bundle names each file asset by content hash; the bytes travel beside it (spec/README.md, "Asset files").
/** Adds `hash` and `mime` to each file asset and returns the files by hash. Run after checkAssets. */
export function hashAssets(assets: Record<string, JsonObject>, files: ReadonlyMap<string, Uint8Array>): Record<string, AssetFile> {
  const out: Record<string, AssetFile> = {};
  for (const asset of Object.values(assets)) {
    const source = asset.source as JsonObject;
    if (typeof source.file !== "string") continue;
    const data = files.get(source.file);
    if (!data) continue;
    const type = source.file.slice(source.file.lastIndexOf(".") + 1) as FileType;
    const hash = sha256(data);
    const size = type === "svg" ? null : imageSize(type, data);
    asset.hash = hash;
    asset.mime = MIME[type];
    out[hash] = { mime: MIME[type], data, ...(size ? size : {}) };
  }
  return out;
}
