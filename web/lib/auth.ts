import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "dibs_staff";

// The repo is public, so the "dibs" fallback is for local dev only. A production
// deployment without DIBS_ADMIN_PASSWORD has no staff login at all.
const password = () => process.env.DIBS_ADMIN_PASSWORD ?? (process.env.NODE_ENV === "production" ? null : "dibs");

export const sessionToken = () => {
  const pw = password();
  // No password set in production: a token nobody can present.
  if (pw === null) return crypto.randomBytes(32).toString("hex");
  return crypto.createHash("sha256").update(`dibs-staff:${pw}`).digest("hex");
};

export const checkPassword = (input: string) => {
  const pw = password();
  return pw !== null && input === pw;
};

export async function isStaff() {
  return (await cookies()).get(ADMIN_COOKIE)?.value === sessionToken();
}

export async function requireStaff() {
  if (!(await isStaff())) {
    return Response.json({ error: "staff login required" }, { status: 401 });
  }
  return null;
}
