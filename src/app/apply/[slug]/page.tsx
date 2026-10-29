import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import FormRunner from "@/components/forms/FormRunner";
import PasswordGate from "@/components/forms/PasswordGate";
import { closedReason, getFormBySlug, getFormByOldSlug } from "@/forms/repo";
import { allEndings, plainText } from "@/forms/lib";
import { isUnlocked, respondentSettings, unlockCookie } from "@/forms/access";
import { isAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const form = await getFormBySlug(slug);
  if (!form) return { title: "Form", robots: { index: false } };
  const s = form.settings;
  const title = s.meta_title || plainText(form.title);
  const description = s.meta_description || plainText(s.welcome_description || form.description || "");
  const image = s.meta_image && /^https:\/\//i.test(s.meta_image) ? s.meta_image : undefined;
  return {
    title,
    description: description || undefined,
    robots: s.allow_indexing ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: { title, description: description || undefined, images: image ? [image] : undefined, type: "website" },
    twitter: { card: image ? "summary_large_image" : "summary", title, description: description || undefined, images: image ? [image] : undefined },
  };
}

export default async function ApplyPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const form = await getFormBySlug(slug);
  if (!form) {
    // renamed form: send old links to the current one, keeping ?utm_... etc.
    const moved = await getFormByOldSlug(slug);
    if (!moved) notFound();
    const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]).toString();
    redirect(`/apply/${moved.slug}${qs ? `?${qs}` : ""}`);
  }

  const preview = sp.preview === "1" && (await isAdmin());
  const closed = preview ? null : await closedReason(form);
  if ((form.status !== "published" || closed) && !preview) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-white px-6 text-center text-slate-700">
        <div>
          <h1 className="text-2xl font-semibold">
            {form.status !== "published" && form.status !== "closed" ? "This form isn't live yet" : "This form is closed"}
          </h1>
          <p className="mt-2 text-slate-500">
            {form.status !== "published" && form.status !== "closed"
              ? "Please check back soon."
              : form.settings.closed_message || "It is no longer accepting responses."}
          </p>
        </div>
      </div>
    );
  }

  const jar = await cookies();
  if (!preview && !isUnlocked(form, jar.get(unlockCookie(form.id))?.value)) {
    return <PasswordGate slug={form.slug} title={plainText(form.title)} />;
  }

  return (
    <FormRunner
      slug={form.slug}
      title={form.title}
      description={form.description}
      fields={form.fields}
      settings={respondentSettings(form.settings)}
      endings={allEndings(form.settings)}
      preview={preview}
    />
  );
}
