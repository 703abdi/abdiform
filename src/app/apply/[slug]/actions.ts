"use server";

import { cookies, headers } from "next/headers";
import { getFormBySlug } from "@/forms/repo";
import { passwordOk, unlockCookie, unlockToken } from "@/forms/access";

const fails = new Map<string, number[]>();

export async function unlockFormAction(slug: string, password: string): Promise<{ ok: boolean; error?: string }> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  const now = Date.now();
  const recent = (fails.get(`${ip}:${slug}`) ?? []).filter((t) => now - t < 10 * 60_000);
  if (recent.length >= 8) return { ok: false, error: "Too many attempts. Try again in a few minutes." };

  const form = await getFormBySlug(slug);
  if (!form || !passwordOk(password, form)) {
    recent.push(now);
    fails.set(`${ip}:${slug}`, recent);
    return { ok: false, error: "That password isn't right." };
  }
  (await cookies()).set(unlockCookie(form.id), unlockToken(form), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return { ok: true };
}
