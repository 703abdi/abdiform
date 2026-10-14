import { notFound } from "next/navigation";
import type { Metadata } from "next";
import FormRunner from "@/components/forms/FormRunner";
import { getFormBySlug } from "@/forms/repo";
import { isAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const form = await getFormBySlug(slug);
  return {
    title: form?.title ?? "Application",
    robots: { index: false },
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
  if (!form) notFound();

  const preview = sp.preview === "1" && (await isAdmin());
  if (form.status !== "published" && !preview) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-white px-6 text-center text-slate-700">
        <div>
          <h1 className="text-2xl font-semibold">
            {form.status === "closed" ? "This form is closed" : "This form isn't live yet"}
          </h1>
          <p className="mt-2 text-slate-500">
            {form.status === "closed"
              ? "It is no longer accepting responses."
              : "Please check back soon."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <FormRunner
      slug={form.slug}
      title={form.title}
      description={form.description}
      fields={form.fields}
      settings={form.settings}
      preview={preview}
    />
  );
}
