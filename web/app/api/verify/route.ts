import { newId, updateDb } from "@/lib/db";
import type { Verification } from "@/lib/types";

// Called by the buyer's agent (`dibs_agent.py verify`) when the device arrives.
// A part listing matches if any GPU in the buyer's PC has the tested card's fingerprint.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body?.listingId || !body?.deviceHash) {
    return Response.json({ error: "listingId and deviceHash are required" }, { status: 400 });
  }

  const result = updateDb((db) => {
    const listing = db.listings.find((l) => l.id === body.listingId);
    if (!listing) return null;
    const partHashes: string[] = Array.isArray(body.partHashes) ? body.partHashes.map(String) : [];
    const match =
      listing.kind === "part" ? partHashes.includes(listing.deviceHash) : String(body.deviceHash) === listing.deviceHash;
    const v: Verification = {
      id: newId(),
      listingId: listing.id,
      deviceHash: String(body.deviceHash),
      match,
      summary: body.summary ?? { model: "", cpu: "", gpus: [] },
      at: new Date().toISOString(),
    };
    db.verifications.push(v);
    return v;
  });

  if (!result) return Response.json({ error: "Listing not found" }, { status: 404 });
  return Response.json(result);
}
