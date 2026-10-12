import { newId, readDb, updateDb } from "@/lib/db";
import { solanaCheck } from "@/lib/escrow/lookup";
import type { Verification } from "@/lib/types";

// Called by the buyer's agent (`dibs_agent.py verify`) when the device arrives.
// A part listing matches if any GPU in the buyer's PC has the tested card's fingerprint.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body?.listingId || !body?.deviceHash) {
    return Response.json({ error: "listingId and deviceHash are required" }, { status: 400 });
  }

  const result = await updateDb((db) => {
    const listing = db.listings.find((l) => l.id === body.listingId);
    if (!listing) return null;
    const partHashes: string[] = Array.isArray(body.partHashes) ? body.partHashes.map(String) : [];
    const fp = body.fingerprints && typeof body.fingerprints === "object" ? body.fingerprints : null;
    const scope = listing.saleScope ?? (listing.kind === "part" ? "gpu" : "device");
    const listed = listing.deviceHash;
    const gpuHashes: string[] = Array.isArray(fp?.gpus) ? fp.gpus.map(String) : partHashes;
    const diskHashes: string[] = Array.isArray(fp?.disks) ? fp.disks.filter((item: unknown) => typeof item === "string") : [];
    const match =
      scope === "device"
        ? String(body.deviceHash) === listed
        : scope === "gpu"
          ? gpuHashes.includes(listed)
          : scope === "cpu"
            ? fp?.cpu === listed
            : scope === "ram"
              ? fp?.ram === listed
              : scope === "storage"
                ? diskHashes.includes(listed)
                : scope === "battery"
                  ? fp?.battery === listed
                  : false;
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
  const listing = (await readDb()).listings.find((item) => item.id === result.listingId);
  const solana = listing ? await solanaCheck(listing) : null;
  return Response.json({ ...result, solana });
}
