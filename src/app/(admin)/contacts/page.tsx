import { ContactsView } from "@/components/admin/ContactsView";
import { listContacts, listLists } from "@/contacts/repo";
import { listForms } from "@/forms/repo";
import { after } from "next/server";
import { calendlyConfigured, syncCalendlyIfStale } from "@/calendly/sync";

export const metadata = { title: "Contacts · Tawakkul Forms" };

export default async function ContactsPage({ searchParams }: { searchParams: Promise<{ list?: string }> }) {
  const { list } = await searchParams;
  after(() => syncCalendlyIfStale(15).catch(() => {})); // keep calls fresh in the background
  const [contacts, lists, forms] = await Promise.all([listContacts(), listLists(), listForms()]);
  const keys = new Map<string, number>();
  for (const c of contacts) for (const k of Object.keys(c.properties)) keys.set(k, (keys.get(k) ?? 0) + 1);
  return (
    <ContactsView
      contacts={contacts}
      lists={lists}
      forms={forms.map((f) => ({ id: f.id, title: f.title }))}
      propertyKeys={[...keys.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k]) => k)}
      initialList={lists.some((l) => l.id === list) ? list! : null}
      calendly={calendlyConfigured()}
    />
  );
}
