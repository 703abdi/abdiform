import { FormsHome } from "@/components/admin/FormsHome";
import { listFormsWithStats, listWorkspaces } from "@/workspace/repo";

export default async function FormsPage({ searchParams }: { searchParams: Promise<{ ws?: string }> }) {
  const { ws } = await searchParams;
  const [workspaces, forms] = await Promise.all([listWorkspaces(), listFormsWithStats()]);
  const current = workspaces.find((w) => w.id === ws)?.id ?? workspaces[0]?.id ?? "";
  return <FormsHome key={current} workspaces={workspaces} forms={forms} current={current} />;
}
