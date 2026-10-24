// Goals and route guides for the agent-driven runs of the exemplar, one per ending. Each names a
// golden scenario, whose seed, bundles, and characters the run reuses.

export interface Goal {
  scenario: string;
  ending: string;
  goal: string;
  guide: string;
  maxTurns: number;
}

export const GOALS: Goal[] = [
  {
    scenario: "exemplar_escaped",
    ending: "escaped",
    goal: "escape from the wreck of Perpetua carrying one of its artifacts.",
    guide: [
      "1. In Orvelle's plaza, take the hand lamp by the fountain. In the guildhall, ask Clerk Hallek for a salvage contract.",
      "2. Take the road to Vessaro. In the harbor office, ask Captain Ostrakis where the wreck was charted. Search the net loft and take the chart fragment.",
      "3. Ask Ostrakis about passage south. Open the quay gate and board his boat.",
      "4. On the boat, open the fog bank on the course for the Drowned Stair (your lamp must be lit) and go through. Fight the great octopus until it dies.",
      "5. Go through the mooring gate to Perpetua. Go to the chart room and operate the winch. Go to the long gallery, fight the drowned, then go down the hatch to the holds.",
      "6. Explore the holds, opening doors, until you find a sealed iron box. Open it (you carry the prybar and cold chisel).",
      "7. Climb the ladder back to the deck and walk to the mooring.",
    ].join("\n"),
    maxTurns: 250,
  },
  {
    scenario: "exemplar_archive_sealed",
    ending: "archive_sealed",
    goal: "seal the archive with its keeper, Oriel Vantane.",
    guide: [
      "1. In Orvelle's plaza, take the hand lamp by the fountain. In the tavern, listen at the back booth, then read the drowned sailor's ledger. In the lane, ask Marthe Osk about the tides.",
      "2. Take the road to Salinara. In the reed house, ask Melina Dassos for a safe way through the marsh, then about the reeves' tide books.",
      "3. Go to the fever marsh, fight the adder, search, and take the chart fragment. On the quay, fight the privateers, then ask Old Theo Sarantis about passage south. Open the quay gate and board.",
      "4. On the boat, take the prybar and the cold chisel from the tool chest. Open the fog bank on the course for the Drowned Stair and go through. Fight the great octopus until it dies.",
      "5. Go through the mooring gate to Perpetua. Operate the winch in the chart room. Fight the drowned in the long gallery, then go down the hatch.",
      "6. In the holds, find the iron door to the ward chamber and go through. Do not attack the drowned there. Read the open iron box, take the ring from it, and seal the box.",
      "7. Back in the holds, find and take the iron vault key, open the vault door, and talk to Oriel Vantane: about how Perpetua sank, the ring, and finally sealing the archive.",
    ].join("\n"),
    maxTurns: 350,
  },
  {
    scenario: "exemplar_lost",
    ending: "lost",
    goal: "play recklessly: rush ahead of the rivals and stand your ground against them.",
    guide: [
      "1. In Orvelle, go into the tavern and listen at the back booth.",
      "2. Take the road to Vessaro at once.",
      "3. On the Vessaro quay, the privateers attack. Stand your ground and wait.",
    ].join("\n"),
    maxTurns: 60,
  },
];
