import os from "node:os";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { readDb } from "@/lib/db";
import { SessionLive } from "@/components/admin/SessionLive";

/** LAN addresses so the agent can be run from another PC on the shop network. */
function lanServers(port: string) {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal && !i.address.startsWith("169.254."))
    .map((i) => `http://${i!.address}:${port}`);
}

export default async function SessionPage({ params }: PageProps<"/admin/session/[id]">) {
  const { id } = await params;
  const session = readDb().sessions.find((s) => s.id === id);
  if (!session) notFound();

  const host = (await headers()).get("host") ?? "localhost:3000";
  const port = host.split(":")[1] ?? "80";
  const servers = Array.from(new Set([`http://${host}`, ...lanServers(port)]));

  return <SessionLive initial={session} servers={servers} />;
}
