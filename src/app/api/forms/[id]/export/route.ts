import { NextResponse } from "next/server";
import Papa from "papaparse";
import { isAdmin } from "@/lib/auth";
import { getForm, listResponses } from "@/forms/repo";
import { answerFields, formatAnswer, plainText } from "@/forms/lib";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return new NextResponse(null, { status: 404 });
  const { id } = await ctx.params;
  const form = await getForm(id);
  if (!form) return new NextResponse(null, { status: 404 });
  const responses = await listResponses(id);
  const cols = answerFields(form.fields);
  // Prefix cells that start with = + - @ so spreadsheets don't run them as formulas.
  const safe = (s: string) => (/^[=+\-@]/.test(s) ? `'${s}` : s);
  const rows: Record<string, string>[] = responses.map((r) => ({
    "Submitted at": r.submitted_at,
    Completed: r.meta?.partial ? "No" : "Yes",
    Status: r.status,
    Source: r.source,
    ...Object.fromEntries(cols.map((f) => [plainText(f.title), safe(formatAnswer(f, r.answers[f.id]))])),
    Notes: safe(r.notes),
  }));
  const csv = Papa.unparse(rows.length ? rows : [{ "Submitted at": "" }]);
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${form.slug}-responses.csv"`,
    },
  });
}
