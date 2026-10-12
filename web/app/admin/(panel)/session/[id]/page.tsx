import { notFound } from "next/navigation";
import { readDb } from "@/lib/db";
import { sessionPartRows } from "@/lib/partBaseline";
import { lanOrigins, publicOrigin } from "@/lib/origin";
import { SessionLive } from "@/components/admin/SessionLive";

export default async function SessionPage({ params }: PageProps<"/admin/session/[id]">) {
  const { id } = await params;
  const db = await readDb();
  const session = db.sessions.find((s) => s.id === id);
  if (!session) notFound();

  const servers = Array.from(new Set([await publicOrigin(), ...lanOrigins()]));

  return <SessionLive initial={session} partRows={sessionPartRows(session, db)} servers={servers} />;
}
