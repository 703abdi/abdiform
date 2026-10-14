import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE, authBypassed, verifyToken } from "@/lib/session";

/** True when the current request has a valid admin session. */
export async function isAdmin(): Promise<boolean> {
  if (authBypassed()) return true;
  const jar = await cookies();
  return verifyToken(jar.get(COOKIE)?.value);
}

/** Page/layout guard. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect("/login");
}
