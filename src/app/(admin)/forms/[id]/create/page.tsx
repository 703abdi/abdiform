import { notFound } from "next/navigation";
import { FormBuilder } from "@/components/forms/FormBuilder";
import { getForm } from "@/forms/repo";
import { publicSettings } from "@/forms/access";

export default async function ContentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const form = await getForm(id);
  if (!form) notFound();
  return (
    <div className="bg-[#f7f7f7] px-3 py-4 sm:px-5">
      <FormBuilder form={{ ...form, settings: publicSettings(form.settings) }} />
    </div>
  );
}
