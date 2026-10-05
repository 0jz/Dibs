import { openTransaction } from "@/lib/escrow/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const listingId = String(body.listingId ?? "");
  if (!listingId) return Response.json({ error: "listingId is required" }, { status: 400 });
  const result = await openTransaction(listingId);
  if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
  return Response.json(result);
}
