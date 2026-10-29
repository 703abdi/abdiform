"use server";

// Admin actions for the Forms home: workspaces and the per-form "..." menu.

import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/auth";
import { createWorkspace, deleteWorkspace, moveForm, renameForm, renameWorkspace } from "@/workspace/repo";

type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  if (!(await isAdmin())) return { ok: false, error: "Not allowed." };
  try {
    const data = await fn();
    revalidatePath("/forms");
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

export async function createWorkspaceAction(name: string) {
  return run(async () => (await createWorkspace(name)).id);
}
export async function renameWorkspaceAction(id: string, name: string) {
  return run(async () => void (await renameWorkspace(id, name)));
}
export async function deleteWorkspaceAction(id: string) {
  return run(async () => void (await deleteWorkspace(id)));
}
export async function renameFormAction(id: string, title: string, updateLink = false) {
  return run(async () => {
    const { slugify } = await import("@/forms/lib");
    return renameForm(id, title, updateLink ? slugify(title) : undefined);
  });
}
export async function moveFormAction(id: string, workspaceId: string) {
  return run(async () => void (await moveForm(id, workspaceId)));
}
