import Link from "next/link";
import { FormsNav } from "@/components/forms/FormsNav";
import { requireAdmin } from "@/lib/auth";
import { formsBackend } from "@/forms/repo";
import { logoutAction } from "@/app/login/actions";
import { authBypassed } from "@/lib/session";

export const metadata = { title: "Leads & Forms · Tawakkul" };
export const dynamic = "force-dynamic";

export default async function FormsLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const backend = formsBackend();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[1800px] items-center gap-6 px-4 sm:px-6">
          <Link href="/forms" className="flex items-center gap-2 font-bold text-slate-900">
            <span aria-hidden className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-brand text-sm text-white">T</span>
            Tawakkul Forms
          </Link>
          <FormsNav />
          <div className="ml-auto flex items-center gap-3 text-sm">
            {!authBypassed() && (
              <form action={logoutAction}>
                <button type="submit" className="text-slate-500 hover:text-slate-800">Log out</button>
              </form>
            )}
          </div>
        </div>
      </header>
      <div className="mx-auto w-full max-w-[1800px] px-4 py-6 sm:px-6">
        {backend === "local" && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <b>Local data store.</b> Leads are saved to a file on this machine only. Set <code>DATABASE_URL</code> to
            store them permanently in your database before sending real applicants to a form.
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
