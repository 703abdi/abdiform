import { after } from "next/server";
import { listBlasts } from "@/blasts/repo";
import { processBlasts, blastSender } from "@/blasts/send";
import { BlastsList } from "@/components/blasts/BlastsList";

export const metadata = { title: "Blasts · Tawakkul Forms" };

export default async function BlastsPage() {
  after(() => processBlasts(30_000).catch(() => {}));
  return <BlastsList blasts={await listBlasts()} brevoReady={!!blastSender()} />;
}
