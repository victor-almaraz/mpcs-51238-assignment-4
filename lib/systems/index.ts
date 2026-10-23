// Rules-system registry (docs/systems/README.md, "Adding a system": one registry entry per system).
import type { RulesSystem } from "./contract";
import { CADMIUM } from "./cadmium";
import { QUEST } from "./quest";

export * from "./contract";

export const SYSTEMS: Readonly<Record<string, RulesSystem>> = { quest: QUEST, cadmium: CADMIUM };
