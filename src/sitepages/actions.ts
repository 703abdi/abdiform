"use server";

import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/auth";
import { createPage, deletePage, duplicatePage, updatePage } from "@/sitepages/repo";
import { THEMES, type Block, type PageSeo, type PageStatus, type PageTheme } from "@/sitepages/types";
import { PAGE_TEMPLATES } from "@/sitepages/templates";

type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  if (!(await isAdmin())) return { ok: false, error: "Not allowed." };
  try {
    const data = await fn();
    revalidatePath("/pages");
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

export async function createPageAction(title: string, template: string) {
  return run(async () => {
    const t = PAGE_TEMPLATES.find((x) => x.key === template) ?? PAGE_TEMPLATES[0];
    const built = t.build();
    return (await createPage({ title: title.trim() || built.title, blocks: built.blocks, theme: built.theme ?? THEMES.tawakkul.theme })).id;
  });
}

export async function savePageAction(
  id: string,
  patch: { title: string; slug: string; status: PageStatus; blocks: Block[]; theme: PageTheme; seo: PageSeo },
) {
  return run(async () => {
    if (!patch.title.trim()) throw new Error("Give the page a title.");
    const p = await updatePage(id, patch);
    if (!p) throw new Error("Page not found.");
    revalidatePath(`/pages/${id}`);
    revalidatePath(`/p/${p.slug}`);
    return { slug: p.slug };
  });
}

export async function setPageStatusAction(id: string, status: PageStatus) {
  return run(async () => void (await updatePage(id, { status })));
}

export async function duplicatePageAction(id: string) {
  return run(async () => (await duplicatePage(id))?.id ?? null);
}

export async function deletePageAction(id: string) {
  return run(() => deletePage(id));
}
