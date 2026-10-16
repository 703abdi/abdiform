import { notFound } from "next/navigation";
import { getForm } from "@/forms/repo";
import { allEndings } from "@/forms/lib";
import { ConnectPanel } from "@/components/admin/ConnectPanel";
import { listAutomations } from "@/automations/repo";

export default async function ConnectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const form = await getForm(id);
  if (!form) notFound();
  const autos = (await listAutomations()).filter((a) => a.trigger.type === "form_submitted" && (!a.trigger.form_id || a.trigger.form_id === id));
  const calendly = allEndings(form.settings).filter((e) => e.calendly_url).map((e) => e.calendly_url!) ;
  return (
    <ConnectPanel
      id={form.id}
      notifyEmail={form.settings.notify_email ?? ""}
      webhookUrl={form.settings.webhook_url ?? ""}
      calendly={[...new Set(calendly)]}
      emailReady={!!process.env.BREVO_API_KEY && !!process.env.NOTIFY_FROM_EMAIL}
      automations={autos.filter((a) => a.status === "live").length}
    />
  );
}
