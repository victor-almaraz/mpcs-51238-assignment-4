// Walks the requirement and effect languages (engine.md, "Requirements" and "Effects") in
// schema-valid pack data, visiting every node with its path.

import type { Segment } from "./diagnostics";

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
export type JsonObject = { [k: string]: Json };

export interface Visitor {
  requirement?(form: string, args: Json, path: Segment[]): void;
  effect?(name: string, args: JsonObject, path: Segment[]): void;
}

export const isObject = (v: unknown): v is JsonObject => typeof v === "object" && v !== null && !Array.isArray(v);

/** One requirement: `{ all }`, `{ any }`, `{ not }`, or a single-key leaf such as `{ has_item }`. */
export function walkRequirement(req: Json | undefined, path: Segment[], visit: Visitor): void {
  if (!isObject(req)) return;
  if (Array.isArray(req.all)) return req.all.forEach((r, i) => walkRequirement(r, [...path, "all", i], visit));
  if (Array.isArray(req.any)) return req.any.forEach((r, i) => walkRequirement(r, [...path, "any", i], visit));
  if ("not" in req) return walkRequirement(req.not, [...path, "not"], visit);
  const form = ["flag", "stage", "has_item", "location", "room", "near", "illumination", "defeated", "check"].find((k) => k in req);
  if (form) visit.requirement?.(form, form === "flag" || form === "near" ? req : req[form]!, path);
}

/** A list of effects; `if` recurses into `when`, `then`, and `else`. */
export function walkEffects(effects: Json | undefined, path: Segment[], visit: Visitor): void {
  if (!Array.isArray(effects)) return;
  effects.forEach((effect, i) => {
    if (!isObject(effect)) return;
    const [name] = Object.keys(effect);
    if (name === undefined) return;
    const args = effect[name];
    const at = [...path, i, name];
    if (name === "if" && isObject(args)) {
      walkRequirement(args.when, [...at, "when"], visit);
      walkEffects(args.then, [...at, "then"], visit);
      walkEffects(args.else, [...at, "else"], visit);
    }
    visit.effect?.(name, isObject(args) ? args : {}, at);
  });
}

/** Verbs: each verb's `requirement` and `effects`. */
export function walkVerbs(verbs: Json | undefined, path: Segment[], visit: Visitor): void {
  if (!isObject(verbs)) return;
  for (const [verb, def] of Object.entries(verbs)) {
    if (!isObject(def)) continue;
    walkRequirement(def.requirement, [...path, verb, "requirement"], visit);
    walkEffects(def.effects, [...path, verb, "effects"], visit);
  }
}
