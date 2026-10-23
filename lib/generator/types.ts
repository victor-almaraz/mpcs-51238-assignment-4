// Generator output (generation.md, "Output"): a location in the compiled authored format of
// adventure-packs.md, "Authored", with each room's role and depth.

import type { LinkDef } from "../bundle/adventure";
import type { LightLevel, Requirement, Tags } from "../bundle/types/defs";

/** Roles the generator assigns (generation.md, "3. Roles and depth"). */
export type RoomRole = "entry" | "dead_end" | "boss";

export interface GeneratedRoom {
  label: string;
  tags: Tags;
  /**
   * The room's role, or null for a room with none. A room that holds several roles shows the first
   * of `entry`, `boss`, `dead_end`.
   */
  role: RoomRole | null;
  /** BFS depth over doorways from the entry. */
  depth: number;
  light: LightLevel;
  /** `[x, y, width, height]` rectangles: the interior, then each doorway the room owns. */
  area: [number, number, number, number][];
}

/** One placed entity: a template by `ref`, or an NPC by `npc` (whose entity id is the NPC id). */
export interface GeneratedContent {
  ref?: string;
  npc?: string;
  at: [number, number];
  /** `<location>/eN` or `<location>/dN`, or the anchor's `place.id`. Absent for NPCs. */
  id?: string;
  /** Overrides the door template's lock. */
  lock?: Requirement;
  hidden?: boolean;
}

export interface GeneratedMap {
  rows: string[];
  /** Characters for terrain other than `void`, `floor`, and `wall`. */
  legend: Record<string, string>;
  rooms: Record<string, GeneratedRoom>;
  links: Record<string, LinkDef>;
  /** Entities in placement order, then doors in doorway order. */
  contents: GeneratedContent[];
}

export type GenerateResult =
  | {
      ok: true;
      location: GeneratedMap;
      // SPEC_ISSUES.md#generated-room-aliases: the output format cannot say which room holds an anchor.
      /** Room aliases (adventure-packs.md, "Room references"): `r1`, `entry`, `boss`, anchor ids, link ids. */
      aliases: Record<string, string>;
      /** The attempt that passed verification, from 0. */
      attempt: number;
    }
  | { ok: false; error: string };
