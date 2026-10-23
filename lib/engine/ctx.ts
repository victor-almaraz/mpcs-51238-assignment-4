// The context of one resolution: a private copy of state, the Rng, and the events produced. A
// rejection throws `Reject`; `submit` and `advance` turn it into an error result, discarding the copy.

import type { Rng } from "../rng";
import type { Combatant, Effect, GameEvent, HeldItem, Resolution, Sheet } from "../systems";
import { RulesError } from "../systems";
import type { Content } from "./content";
import type { EngineError, ErrorCode, EntityState, State } from "./types";
import { bodyOf } from "./world";

export class Reject extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly detail: string,
  ) {
    super(`${code}: ${detail}`);
  }

  get error(): EngineError {
    return { code: this.code, detail: this.detail };
  }
}

export function reject(code: ErrorCode, detail: string): never {
  throw new Reject(code, detail);
}

/** Calls the rules system, turning its `RulesError` into a rejection with the same code. */
export function rules<T>(call: () => T): T {
  try {
    return call();
  } catch (e) {
    if (e instanceof RulesError) reject(e.code, e.detail);
    throw e;
  }
}

/** Effects applied by `applyEffects`; set by the effects module to break the import cycle. */
export type EffectRunner = (ctx: Ctx, effects: readonly Effect[], scope: Scope) => void;

/** Who effects act for: the actor, the tool call's target, and the location unqualified rooms resolve in. */
export interface Scope {
  actor?: string;
  target?: string;
  /** Location for unqualified room references; the actor's location when absent. */
  location?: string;
}

export class Ctx {
  readonly events: GameEvent[] = [];
  /** Facts for the narrator from trigger `narrate`, topic briefs, and revealed secrets. */
  readonly facts: string[] = [];
  /** Choices produced while evaluating requirements, offered after the requirement is evaluated. */
  readonly deferredChoices: Resolution["choice"][] = [];

  constructor(
    readonly state: State,
    readonly c: Content,
    readonly rng: Rng,
    readonly runEffects: EffectRunner,
  ) {}

  emit(event: GameEvent): void {
    this.events.push(event);
  }

  get system() {
    return this.c.bundles.system;
  }

  newId(): string {
    this.state.next_entity += 1;
    return `_e${this.state.next_entity}`;
  }

  /** The rules-system view of a character, creature, or structure. */
  combatant(id: string): Combatant {
    const ch = this.state.characters[id];
    if (ch) return { id, side: "characters", kind: "character", sheet: ch.sheet, items: this.itemStats(ch.items) };
    const e = this.state.entities[id];
    if (!e || !e.sheet) reject("unknown_id", `'${id}' has no rules-system sheet`);
    const kind = e.kind === "creature" ? "creature" : "structure";
    return { id, side: "entities", kind, sheet: e.sheet, items: {} };
  }

  itemStats(ids: readonly string[]): Record<string, Record<string, unknown>> {
    const out: Record<string, Record<string, unknown>> = {};
    for (const id of ids) {
      const e = this.state.entities[id]!;
      out[e.ref] = (this.c.template(e.ref) as { system_stats?: Record<string, unknown> }).system_stats ?? {};
    }
    return out;
  }

  held(id: string): HeldItem {
    const e = this.state.entities[id]!;
    return { ref: e.ref, stats: (this.c.template(e.ref) as { system_stats?: Record<string, unknown> }).system_stats ?? {} };
  }

  /** Inventory as `can_carry` takes it. */
  inventory(ids: readonly string[]): HeldItem[] {
    return ids.map((id) => this.held(id));
  }

  sheet(id: string): Sheet | undefined {
    return this.state.characters[id]?.sheet ?? this.state.entities[id]?.sheet;
  }

  isActive(id: string): boolean {
    return this.sheet(id)?.status === "active";
  }

  /** Keeps a character sheet's `inventory` equal to its carried items. */
  syncInventory(id: string): void {
    const ch = this.state.characters[id];
    if (!ch) return;
    ch.sheet = { ...ch.sheet, inventory: ch.items.map((i) => ({ ref: this.state.entities[i]!.ref })) };
  }

  /** Applies a rules-system resolution: sheets, events, structure destruction, then effects and any choice. */
  apply(resolution: Resolution, actor: string | undefined, target?: string): void {
    for (const [id, sheet] of Object.entries(resolution.updates)) this.setSheet(id, sheet);
    for (const event of resolution.events) {
      this.emit(event);
      if (event.type === "damaged") this.onDamaged(event.target as string);
    }
    this.destroyBroken();
    if (resolution.effects.length > 0) this.runEffects(this, resolution.effects, { actor, target });
    if (resolution.choice) this.offerChoice(resolution.choice);
  }

  offerChoice(choice: NonNullable<Resolution["choice"]>): void {
    this.state.pending_choices[choice.actor] = choice;
    this.emit({ type: "choice_offered", actor: choice.actor, options: choice.options.map((o) => ({ id: o.id, label: o.label })) });
  }

  setSheet(id: string, sheet: Sheet): void {
    const ch = this.state.characters[id];
    if (ch) {
      ch.sheet = sheet;
      this.syncInventory(id);
      return;
    }
    const e = this.state.entities[id];
    if (e) e.sheet = sheet;
  }

  /** `flee_when_harmed` switches a creature to `fleeing` at its first `damaged` event. */
  onDamaged(id: string): void {
    const e = this.state.entities[id];
    if (!e || e.kind !== "creature") return;
    const t = this.c.template(e.ref) as { flee_when_harmed?: boolean };
    if (t.flee_when_harmed) e.behavior = "fleeing";
  }

  /** A structure whose status leaves `active` is destroyed: removed, with its remains at its anchor. */
  destroyBroken(): void {
    for (const id of Object.keys(this.state.entities).sort()) {
      const e = this.state.entities[id]!;
      if ((e.kind !== "obstacle" && e.kind !== "door") || !e.sheet || e.sheet.status === "active") continue;
      const remains = (this.c.template(e.ref) as { remains?: string }).remains;
      const { location, at } = e;
      delete this.state.entities[id];
      this.emit({ type: "destroyed", target: id, ref: e.ref });
      if (remains && location !== undefined && at !== undefined) {
        const rid = this.createEntity(remains, { location, at });
        this.emit({ type: "entity_spawned", entity: rid });
      }
    }
  }

  /** Creates an entity from a template, at a cell or carried; returns its id. */
  createEntity(ref: string, where: { location: string; at: readonly [number, number] } | { carrier: string }, id?: string, extra: Partial<EntityState> = {}): string {
    const t = this.c.template(ref);
    const eid = id ?? this.newId();
    const e: EntityState = { ref, kind: t.kind, conditions: [], ...("carrier" in where ? { carrier: where.carrier } : { location: where.location, at: [where.at[0], where.at[1]] }) };
    if (t.kind === "creature") {
      e.sheet = rules(() => this.system.instantiate(t.system_stats, this.rng));
      e.behavior = t.behavior;
    }
    if ((t.kind === "obstacle" || t.kind === "door") && t.system_stats !== undefined) e.sheet = rules(() => this.system.instantiate_structure(t.system_stats));
    if (t.kind === "door") {
      e.open = t.open;
      if (t.lock !== undefined) e.lock = t.lock;
    }
    if (t.kind === "container" && t.lock !== undefined) e.lock = t.lock;
    if (t.kind === "item") e.uses = t.uses;
    if ("light" in t && t.light) e.lit = t.light.lit ?? true;
    Object.assign(e, extra);
    if (e.lock !== undefined) e.locked = true;
    this.state.entities[eid] = e;
    if (t.kind === "container") this.fillContainer(eid);
    if ("carrier" in where) {
      const holder = this.state.characters[where.carrier];
      if (holder) {
        holder.items.push(eid);
        this.syncInventory(where.carrier);
      } else this.state.entities[where.carrier]?.contents?.push(eid);
    }
    return eid;
  }

  // SPEC_ISSUES.md#container-contents: container contents are drawn when the container is placed.
  fillContainer(id: string): void {
    const e = this.state.entities[id]!;
    const t = this.c.template(e.ref) as { contents: { table: string; picks: number | string } | string[] };
    e.contents = [];
    const refs = Array.isArray(t.contents) ? t.contents : this.drawTable(t.contents.table, t.contents.picks);
    for (const ref of refs) this.createEntity(ref, { carrier: id });
  }

  /** Refs drawn from a weighted table `picks` times. */
  drawTable(table: string, picks: number | string): string[] {
    const entries = this.c.table(table) ?? [];
    const count = typeof picks === "number" ? picks : this.rng.roll(picks).total;
    const refs: string[] = [];
    const total = entries.reduce((s, e) => s + e.weight, 0);
    for (let i = 0; i < count && total > 0; i++) {
      // SPEC_ISSUES.md#weighted-tables: a die with the total weight, walking entries in order.
      let roll = this.rng.die(total);
      const entry = entries.find((e) => (roll -= e.weight) <= 0)!;
      const n = entry.count === undefined ? 1 : typeof entry.count === "number" ? entry.count : this.rng.roll(entry.count).total;
      for (let k = 0; k < n; k++) refs.push(entry.ref);
    }
    return refs;
  }

  /** The location a character or entity is in, following carriers. */
  locationOf(id: string): string | undefined {
    const ch = this.state.characters[id];
    if (ch) return ch.location;
    const e = this.state.entities[id];
    if (!e) return undefined;
    if (e.location !== undefined) return e.location;
    return e.carrier !== undefined ? this.locationOf(e.carrier) : undefined;
  }

  body(id: string) {
    return bodyOf(this.state, this.c, id);
  }
}
