// The exemplar's fights, as the simulation stages them: the creatures of each encounter in
// sunken_archive, by lantern_coast template.

export interface Encounter {
  id: string;
  /** Where it happens in the adventure. */
  where: string;
  creatures: string[];
  /** Templates without the `hostile` tag that the adventure turns hostile with `set_hostile`. */
  turned?: boolean;
  /** Whether the route to an ending must pass it. */
  required: boolean;
  /** Statistics that replace the templates' own, for trying balance changes. */
  override?: { hp?: number; damage?: number };
}

export const ENCOUNTERS: Encounter[] = [
  { id: "octopus", where: "drowned_stair: the great octopus guards the mooring gate", creatures: ["great_octopus"], required: true },
  { id: "gallery", where: "perpetua_deck: the gallery ambush", creatures: ["drowned", "drowned"], required: true },
  { id: "gull_crew", where: "a quay, when rival_lead is 2 or more", creatures: ["pirate", "pirate"], required: false },
  { id: "rivals_waiting", where: "perpetua_deck mooring, rival_lead 5", creatures: ["pirate", "pirate", "pirate", "pirate"], required: false },
  { id: "ward", where: "ward_chamber, if the party attacks the watch", creatures: ["drowned", "drowned", "drowned"], required: false },
  { id: "claim_camp", where: "kestrin: taking the net float", creatures: ["company_thug", "company_bailiff"], turned: true, required: false },
  { id: "rent", where: "lamp_shoal: Phaidon's rent", creatures: ["company_thug", "company_thug"], turned: true, required: false },
  { id: "holds", where: "perpetua_holds: a hold encounter", creatures: ["drowned", "drowned"], required: false },
  { id: "page_swarm", where: "perpetua_holds: a deep hold encounter", creatures: ["page_swarm"], required: false },
  { id: "marsh", where: "salinara marsh", creatures: ["marsh_adder"], required: false },
  { id: "labyrinth", where: "labyrinth maze", creatures: ["wild_boar", "wild_boar"], required: false },
  { id: "gulls", where: "boat_deck, second island return", creatures: ["carrion_gull", "carrion_gull"], required: false },
];
