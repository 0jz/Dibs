import { requireStaff } from "@/lib/auth";
import { newCode, newId, readDb, updateDb } from "@/lib/db";
import type { Session } from "@/lib/types";

export async function GET() {
  const denied = await requireStaff();
  if (denied) return denied;
  const sessions = readDb().sessions.map(({ samples, ...rest }) => ({ ...rest, sampleCount: samples.length }));
  return Response.json(sessions.reverse());
}

export async function POST() {
  const denied = await requireStaff();
  if (denied) return denied;
  const session: Session = {
    id: newId(),
    code: newCode(),
    createdAt: new Date().toISOString(),
    status: "waiting",
    phase: "waiting",
    identity: null,
    deviceHash: null,
    partHashes: [],
    samples: [],
    results: null,
    gpuScore: null,
    memoryScore: null,
    abort: false,
    listingId: null,
  };
  updateDb((db) => db.sessions.push(session));
  return Response.json(session);
}
