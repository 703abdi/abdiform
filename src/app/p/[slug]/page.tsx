// Public VSL / landing page.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getPageBySlug } from "@/sitepages/repo";
import { PageView } from "@/components/sitepages/PageView";
import { isAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = await getPageBySlug(slug);
  if (!p || p.status !== "published") return { title: "Page not found" };
  return {
    title: p.seo.title || p.title,
    description: p.seo.description,
    robots: p.seo.noindex ? { index: false } : undefined,
    openGraph: { title: p.seo.title || p.title, description: p.seo.description, images: p.seo.image ? [p.seo.image] : undefined },
  };
}

export default async function PublicPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ preview?: string }> }) {
  const { slug } = await params;
  const p = await getPageBySlug(slug);
  if (!p) notFound();
  const preview = (await searchParams).preview === "1" && (await isAdmin()); // drafts: admins only
  if (p.status !== "published" && !preview) notFound();
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? ""}`;
  return <PageView blocks={p.blocks} theme={p.theme} slug={p.slug} track={p.status === "published" && !preview} origin={origin} />;
}
