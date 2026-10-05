import { cookies } from "next/headers";
import { ADMIN_COOKIE, checkPassword, sessionToken } from "@/lib/auth";

export async function POST(request: Request) {
  const { password } = await request.json().catch(() => ({ password: "" }));
  if (!checkPassword(String(password ?? ""))) {
    return Response.json({ error: "Wrong password" }, { status: 401 });
  }
  (await cookies()).set(ADMIN_COOKIE, sessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return Response.json({ ok: true });
}
