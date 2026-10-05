import { requireStaff } from "@/lib/auth";
import { newId, sha256, STORE_NAME, updateDb } from "@/lib/db";
import type { Grade, Listing, ListingKind } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

const GRADES: Grade[] = ["A", "B", "C"];
const CURRENCIES: Listing["currency"][] = ["EUR", "USDC", "MON"];

export async function POST(request: Request, { params }: Ctx) {
  const denied = await requireStaff();
  if (denied) return denied;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const title = String(body.title ?? "").trim();
  const seller = String(body.seller ?? "").trim();
  const price = Number(body.price);
  if (!title || !seller || !(price > 0)) {
    return Response.json({ error: "Title, seller and a positive price are required" }, { status: 400 });
  }

  const result = updateDb((db) => {
    const session = db.sessions.find((s) => s.id === id);
    if (!session) return { error: "Session not found", status: 404 };
    if (session.status === "published") return { error: "Already published", status: 400 };
    if (!session.identity || !session.results || !session.deviceHash) {
      return { error: "The test has not finished yet", status: 400 };
    }

    const kind: ListingKind = body.kind === "part" ? "part" : "device";
    let fingerprint = session.deviceHash;
    let identity = session.identity;
    if (kind === "part") {
      const gpuIndex = Number(body.gpuIndex ?? 0);
      const partHash = session.partHashes?.[gpuIndex];
      if (!partHash || !identity.gpus[gpuIndex]) {
        return { error: "No GPU fingerprint for this card. Re-run the test with the latest agent.", status: 400 };
      }
      fingerprint = partHash;
      // Keep only the card being sold; the rest of the identity describes the shop's test bench.
      identity = { ...identity, gpus: [identity.gpus[gpuIndex]] };
    }

    const report = {
      kind,
      store: STORE_NAME,
      testedAt: session.createdAt,
      deviceHash: fingerprint,
      identity,
      results: session.results,
      gpuScore: session.gpuScore,
      memoryScore: session.memoryScore ?? null,
      grade: GRADES.includes(body.grade) ? body.grade : "B",
      sealId: String(body.sealId ?? "").trim(),
      notes: String(body.notes ?? "").trim(),
    };

    const listing: Listing = {
      id: newId(),
      sessionId: session.id,
      title,
      price,
      currency: CURRENCIES.includes(body.currency) ? body.currency : "EUR",
      seller,
      store: report.store,
      grade: report.grade,
      notes: report.notes,
      sealId: report.sealId,
      kind,
      deviceHash: fingerprint,
      reportHash: sha256(report),
      identity,
      results: session.results,
      gpuScore: session.gpuScore,
      memoryScore: session.memoryScore ?? null,
      samples: session.samples,
      testedAt: session.createdAt,
      publishedAt: new Date().toISOString(),
      status: "for_sale",
    };
    db.listings.push(listing);
    session.status = "published";
    session.listingId = listing.id;
    return { listing };
  });

  if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
  return Response.json(result.listing);
}
