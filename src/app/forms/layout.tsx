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
    <div className="mx-auto flex w-full max-w-7xl gap-6 px-4 py-6 sm:px-6">
      <aside className="hidden w-56 shrink-0 lg:block">
        <div className="sticky top-6 space-y-4">
          <div className="px-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tawakkul</p>
            <p className="text-sm font-bold text-slate-800">Leads &amp; Forms</p>
          </div>
          <FormsNav />
          {!authBypassed() && (
            <form action={logoutAction}>
              <button type="submit" className="px-3 text-xs text-slate-400 hover:text-slate-600">Log out</button>
            </form>
          )}
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="mb-4 flex gap-2 overflow-x-auto lg:hidden">
          <FormsNav />
        </div>
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
