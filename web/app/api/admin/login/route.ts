import { cookies } from "next/headers";
import { ADMIN_COOKIE, checkPassword, sessionToken } from "@/lib/auth";

function publicOrigin(request: Request) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "localhost:3000";
  const proto = (request.headers.get("x-forwarded-proto") ?? "http").split(",")[0].trim();
  return `${proto}://${host}`;
}

async function readPassword(request: Request) {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    return { password: String(body?.password ?? ""), form: false };
  }
  const form = await request.formData().catch(() => null);
  return { password: String(form?.get("password") ?? ""), form: true };
}

export async function POST(request: Request) {
  const { password, form } = await readPassword(request);
  const origin = publicOrigin(request);
  const secure = origin.startsWith("https://");

  if (!checkPassword(password)) {
    if (form) return Response.redirect(`${origin}/admin/login?error=1`, 303);
    return Response.json({ error: "Wrong password" }, { status: 401 });
  }

  // Cloudflare terminates HTTPS and forwards plain HTTP. The browser still
  // needs a Secure cookie or it drops the session and the form looks like it failed.
  (await cookies()).set(ADMIN_COOKIE, sessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  if (form) return Response.redirect(`${origin}/admin`, 303);
  return Response.json({ ok: true });
}
