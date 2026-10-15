"use server";

import { cookies, headers } from "next/headers";
import { getFormBySlug, rateLimited } from "@/forms/repo";
import { passwordOk, unlockCookie, unlockToken } from "@/forms/access";

export async function unlockFormAction(slug: string, password: string): Promise<{ ok: boolean; error?: string }> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  if (await rateLimited("pw", `${ip}:${slug}`, 8, 600)) return { ok: false, error: "Too many attempts. Try again in a few minutes." };

  const form = await getFormBySlug(slug);
  if (!form || !passwordOk(password, form)) return { ok: false, error: "That password isn't right." };
  (await cookies()).set(unlockCookie(form.id), unlockToken(form), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return { ok: true };
}
