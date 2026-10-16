import { requireAdmin } from "@/lib/auth";
import { authBypassed } from "@/lib/session";
import { AdminNav } from "@/components/admin/AdminNav";

export const metadata = { title: "Workspace · Tawakkul Forms" };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="tf-admin min-h-dvh bg-white text-[#262627]">
      <AdminNav canLogout={!authBypassed()} />
      {children}
    </div>
  );
}
