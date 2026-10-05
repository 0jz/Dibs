import { requireStaff } from "@/lib/auth";
import { readDb, updateDb } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const denied = await requireStaff();
  if (denied) return denied;
  const { id } = await params;
  const session = readDb().sessions.find((s) => s.id === id);
  if (!session) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(session);
}

// Cancels an unpublished session. Published sessions are kept: their listing points at them.
export async function DELETE(_req: Request, { params }: Ctx) {
  const denied = await requireStaff();
  if (denied) return denied;
  const { id } = await params;
  const removed = updateDb((db) => {
    const i = db.sessions.findIndex((s) => s.id === id && s.status !== "published");
    if (i === -1) return false;
    db.sessions.splice(i, 1);
    return true;
  });
  return removed
    ? Response.json({ ok: true })
    : Response.json({ error: "not found or already published" }, { status: 400 });
}
