import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "dibs_staff";

const password = () => process.env.DIBS_ADMIN_PASSWORD ?? "dibs";

export const sessionToken = () =>
  crypto.createHash("sha256").update(`dibs-staff:${password()}`).digest("hex");

export const checkPassword = (input: string) => input === password();

export async function isStaff() {
  return (await cookies()).get(ADMIN_COOKIE)?.value === sessionToken();
}

export async function requireStaff() {
  if (!(await isStaff())) {
    return Response.json({ error: "staff login required" }, { status: 401 });
  }
  return null;
}
