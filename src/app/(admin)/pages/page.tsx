import { listPages } from "@/sitepages/repo";
import { PagesList } from "@/components/sitepages/PagesList";

export const metadata = { title: "Pages · Tawakkul Forms" };

export default async function PagesPage() {
  const pages = await listPages();
  return <PagesList pages={pages} />;
}
