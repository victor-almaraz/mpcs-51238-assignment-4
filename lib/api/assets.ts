// Portrait uploads (api.md, Characters: upload_asset; setting-packs.md, Art: file types and limits;
// data-model.md, Asset). A file is stored once by content hash.

import { sha256 } from "../export/sha256";
import { imageSize } from "../materials/art";
import type { Store } from "../store";
import { ApiError, onlyFields } from "./errors";
import { caller } from "./users";

const MAX_BYTES = 1024 * 1024;
const MAX_PIXELS = 1024;

/** The asset object: the record without its bytes. */
export function assetView(a: { hash: string; kind: string; mime: string; alt: string; license: string; credit: string | null; provenance: string | null; width: number | null; height: number | null }) {
  return { hash: a.hash, kind: a.kind, mime: a.mime, alt: a.alt, license: a.license, credit: a.credit, provenance: a.provenance, width: a.width, height: a.height };
}

const optional = (v: unknown, field: string, max: number) => {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string" || v.length > max) throw new ApiError("invalid_request", `${field} must have at most ${max} characters`);
  return v;
};

/**
 * upload_asset: a portrait as PNG or WebP, at most 1 MB and 1024 × 1024 px. SVG is for icons and
 * tiles only, so portraits never carry markup to sanitize.
 */
export async function uploadAsset(store: Store, userId: string | null, input: unknown, file: Uint8Array) {
  const user = await caller(store, userId, "upload_asset");
  const req = onlyFields(input, ["kind", "alt", "license", "credit", "provenance"]);
  if (req.kind !== "portrait") throw new ApiError("invalid_request", "kind must be portrait");
  if (typeof req.alt !== "string" || req.alt.trim() === "" || req.alt.length > 200) throw new ApiError("invalid_request", "alt must have 1 to 200 characters");
  if (file.length === 0 || file.length > MAX_BYTES) throw new ApiError("invalid_request", "the file must be at most 1 MB");
  const type = imageSize("png", file) ? "png" : imageSize("webp", file) ? "webp" : null;
  if (!type) throw new ApiError("invalid_request", "a portrait must be a PNG or WebP image");
  const size = imageSize(type, file)!;
  if (size.width > MAX_PIXELS || size.height > MAX_PIXELS) throw new ApiError("invalid_request", `a portrait is at most ${MAX_PIXELS} × ${MAX_PIXELS} px; this one is ${size.width} × ${size.height}`);
  const hash = sha256(file);
  // An identical file is stored once; its first record stays.
  if (!(await store.assetMeta(hash))) {
    await store.putAsset(
      {
        hash,
        kind: "portrait",
        mime: `image/${type}`,
        width: size.width,
        height: size.height,
        alt: req.alt,
        // An uploader who names no licence keeps their rights; SPDX has no identifier for that.
        license: optional(req.license, "license", 80) ?? "NOASSERTION",
        credit: optional(req.credit, "credit", 200),
        provenance: optional(req.provenance, "provenance", 500),
        uploader_id: user.id,
      },
      file,
      null,
    );
  }
  await store.recordUpload(hash, user.id);
  return assetView((await store.assetMeta(hash))!);
}
