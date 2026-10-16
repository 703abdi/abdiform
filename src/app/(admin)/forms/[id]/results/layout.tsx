import { notFound } from "next/navigation";
import { getForm } from "@/forms/repo";
import { q } from "@/lib/db";
import { ResultsTabs } from "@/components/admin/ResultsTabs";

export default async function ResultsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const form = await getForm(id);
  if (!form) notFound();
  const [row] = await q(`select count(*)::int as n from form_responses where form_id = $1`, [id]);
  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-8">
      <ResultsTabs id={id} responses={Number(row?.n ?? 0)} />
      {children}
    </div>
  );
}
