"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { rateLimited } from "@/forms/repo";
import { COOKIE, SESSION_MAX_AGE, authConfigured, createToken, passwordMatches } from "@/lib/session";

export async function loginAction(_prev: { error?: string } | undefined, formData: FormData) {
  if (!authConfigured()) return { error: "ADMIN_PASSWORD is not set on the server." };
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  // count every attempt (not only failures) so guessing can't outrun the limiter
  if (await rateLimited("login", ip, 10, 600)) return { error: "Too many attempts. Try again in a few minutes." };
  if (!(await passwordMatches(String(formData.get("password") ?? "")))) return { error: "Wrong password." };
  (await cookies()).set(COOKIE, await createToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  redirect("/forms");
}

export async function logoutAction() {
  (await cookies()).delete(COOKIE);
  redirect("/login");
}
