import { requireStaff } from "@/lib/auth";
import { updateDb } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

// Staff: mark a listing sold / back on sale.
export async function PATCH(request: Request, { params }: Ctx) {
  const denied = await requireStaff();
  if (denied) return denied;
  const { id } = await params;
  const { status } = await request.json().catch(() => ({}));
  if (status !== "for_sale" && status !== "sold") {
    return Response.json({ error: "status must be for_sale or sold" }, { status: 400 });
  }
  const listing = updateDb((db) => {
    const l = db.listings.find((x) => x.id === id);
    if (l) l.status = status;
    return l;
  });
  if (!listing) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ ok: true });
}
