// Dungeon generator (generation.md): builds a location map from a generated location spec and a
// seed. Depends only on bundle, rng, and grid; performs no I/O and reads no clock.
export { MAX_ATTEMPTS, attemptSeed, generate, locationSeed, pickWeighted } from "./generate";
export type { GenerateResult, GeneratedContent, GeneratedMap, GeneratedRoom, RoomRole } from "./types";
