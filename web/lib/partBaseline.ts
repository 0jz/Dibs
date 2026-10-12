import "server-only";
import type { DB, Listing, Session } from "@/lib/types";
import { scoreJunkshop } from "@/lib/performance";
import {
  buildPartRows,
  scoreInputFromListing,
  scoreInputFromSession,
  type PerformanceLookup,
  type ScoreInput,
} from "@/lib/partScore";

function performanceFor(input: ScoreInput): PerformanceLookup {
  const blender = input.results.checks?.blender;
  const cpu = scoreJunkshop(input.identity.cpu.name, blender?.cpu ?? null);
  const gpu = input.identity.gpus.map((card) => scoreJunkshop(card.name, blender?.gpu ?? null));
  return { cpu, gpu };
}

export function sessionPartRows(session: Session, _db?: DB) {
  const input = scoreInputFromSession(session);
  if (!input) return [];
  return buildPartRows(input, performanceFor(input));
}

export function listingPartRows(listing: Listing, _db?: DB) {
  const input = scoreInputFromListing(listing);
  return buildPartRows(input, performanceFor(input));
}

export function listingPerformanceRows(listing: Listing, db?: DB) {
  return listingPartRows(listing, db);
}
