import os from "node:os";
import { headers } from "next/headers";

/** The address the browser actually used. Keeps https when a tunnel forwards to this PC. */
export async function publicOrigin() {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = (h.get("x-forwarded-proto") ?? "http").split(",")[0].trim() || "http";
  return `${proto}://${host}`;
}

/** Other machines on this Wi-Fi. A public tunnel host has no port, so the LAN link stays on 3000. */
export function lanOrigins() {
  const port = process.env.PORT || "3000";
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal && !i.address.startsWith("169.254."))
    .map((i) => `http://${i!.address}:${port}`);
}
