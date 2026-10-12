import { requireStaff } from "@/lib/auth";
import { readDb, updateDb } from "@/lib/db";
import { isStressTier } from "@/lib/tests";
import { sessionPartRows } from "@/lib/partBaseline";
import type { SaleScope } from "@/lib/types";

const SCOPES: SaleScope[] = ["device", "gpu", "cpu", "ram", "storage", "battery"];

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const denied = await requireStaff();
  if (denied) return denied;
  const { id } = await params;
  const session = (await readDb()).sessions.find((s) => s.id === id);
  if (!session) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ ...session, partRows: sessionPartRows(session) });
}

// The shop picks the stress tier before the agent starts. Null means the agent
// chooses: Light on a laptop, Standard on a desktop.
export async function PATCH(request: Request, { params }: Ctx) {
  const denied = await requireStaff();
  if (denied) return denied;
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || (!("stressTier" in body) && !("saleScope" in body) && !("hashrate" in body))) {
    return Response.json({ error: "stressTier, saleScope, or hashrate is required" }, { status: 400 });
  }
  if ("stressTier" in body && body.stressTier !== null && !isStressTier(body.stressTier)) {
    return Response.json({ error: "Stress tier must be light, standard, bench, or unset" }, { status: 400 });
  }
  if ("saleScope" in body && !SCOPES.includes(body.saleScope)) {
    return Response.json({ error: "Sale scope must be the whole PC or one part" }, { status: 400 });
  }

  const result = await updateDb((db) => {
    const session = db.sessions.find((s) => s.id === id);
    if (!session) return { error: "not found", status: 404 as const };
    if (session.status !== "waiting") return { error: "This is chosen before the test starts", status: 409 as const };
    if ("stressTier" in body) {
      session.stressTier = body.stressTier;
      if (body.stressTier !== "standard" && body.stressTier !== "bench") session.hashrate = false;
    }
    if ("saleScope" in body) session.saleScope = body.saleScope;
    if ("hashrate" in body) {
      session.hashrate = session.stressTier === "standard" || session.stressTier === "bench" ? Boolean(body.hashrate) : false;
    }
    return { session };
  });

  if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
  return Response.json(result.session);
}

// Cancels an unpublished session. Published sessions are kept: their listing points at them.
export async function DELETE(_req: Request, { params }: Ctx) {
  const denied = await requireStaff();
  if (denied) return denied;
  const { id } = await params;
  const removed = await updateDb((db) => {
    const i = db.sessions.findIndex((s) => s.id === id && s.status !== "published");
    if (i === -1) return false;
    db.sessions.splice(i, 1);
    return true;
  });
  return removed
    ? Response.json({ ok: true })
    : Response.json({ error: "not found or already published" }, { status: 400 });
}
