import { requireStaff } from "@/lib/auth";
import { newId, sha256, STORE_NAME, updateDb } from "@/lib/db";
import { priceToBase } from "@/lib/escrow/math";
import type { Grade, Listing, ListingKind, SaleScope } from "@/lib/types";

const SCOPES: SaleScope[] = ["device", "gpu", "cpu", "ram", "storage", "battery"];
import { PublicKey } from "@solana/web3.js";

type Ctx = { params: Promise<{ id: string }> };

const GRADES: Grade[] = ["A", "B", "C"];
const CURRENCIES: Listing["currency"][] = ["EUR", "USDC", "MON", "SOL"];

export async function POST(request: Request, { params }: Ctx) {
  const denied = await requireStaff();
  if (denied) return denied;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const title = String(body.title ?? "").trim();
  const seller = String(body.seller ?? "").trim();
  const price = Number(body.price);
  const currency = CURRENCIES.includes(body.currency) ? body.currency : "EUR";
  const onChain = currency === "SOL" || currency === "USDC";
  let sellerWallet = "";
  let base: string | undefined;
  if (onChain) {
    sellerWallet = String(body.sellerWallet ?? "").trim();
    try {
      if (sellerWallet !== new PublicKey(sellerWallet).toBase58()) throw new Error("bad wallet");
      base = priceToBase(price, currency).toString();
    } catch {
      return Response.json({ error: "SOL and USDC listings need a Solana seller wallet and a price large enough to hold 10% back" }, { status: 400 });
    }
  }
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

    const scope: SaleScope =
      session.saleScope && SCOPES.includes(session.saleScope)
        ? session.saleScope
        : body.kind === "part"
          ? "gpu"
          : "device";
    const partIndex = Number(body.partIndex ?? body.gpuIndex ?? 0);
    const fp = session.fingerprints;
    let fingerprint: string | null = session.deviceHash;
    if (scope === "gpu") fingerprint = fp?.gpus?.[partIndex] ?? session.partHashes?.[partIndex] ?? null;
    if (scope === "cpu") fingerprint = fp?.cpu ?? null;
    if (scope === "ram") fingerprint = fp?.ram ?? null;
    if (scope === "storage") fingerprint = fp?.disks?.[partIndex] ?? null;
    if (scope === "battery") fingerprint = fp?.battery ?? null;
    if (!fingerprint) {
      return { error: "This part has no stable id in the test. Re-run it with the latest agent.", status: 400 };
    }

    const kind: ListingKind = scope === "device" ? "device" : "part";
    let identity = session.identity;
    if (scope === "gpu" && identity.gpus[partIndex]) {
      identity = { ...identity, gpus: [identity.gpus[partIndex]] };
    }
    if (scope === "storage" && identity.disks[partIndex]) {
      identity = { ...identity, disks: [identity.disks[partIndex]] };
    }

    const report = {
      kind,
      saleScope: scope,
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
      stressTier: session.stressTier ?? session.results.checks?.stressTier ?? null,
      sellerWallet,
      priceBase: base ?? null,
      currency,
    };

    const listing: Listing = {
      id: newId(),
      sessionId: session.id,
      title,
      price,
      currency,
      seller,
      sellerWallet: sellerWallet || undefined,
      priceBase: base,
      store: report.store,
      grade: report.grade,
      notes: report.notes,
      sealId: report.sealId,
      kind,
      saleScope: scope,
      deviceHash: fingerprint,
      reportHash: sha256(report),
      identity,
      results: session.results,
      gpuScore: session.gpuScore,
      memoryScore: session.memoryScore ?? null,
      samples: session.samples,
      stressTier: session.stressTier ?? session.results.checks?.stressTier ?? null,
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
