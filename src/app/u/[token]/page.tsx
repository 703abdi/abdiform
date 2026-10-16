// Public unsubscribe link from automation emails: /u/<contactId>.<signature>

import { verifySignedValue } from "@/lib/session";
import { setSubscribed } from "@/contacts/repo";
import { isUuid } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Unsubscribe", robots: { index: false } };

export default async function Unsubscribe({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [id, sig] = decodeURIComponent(token).split(".");
  const ok = !!id && !!sig && isUuid(id) && (await verifySignedValue(`unsub:${id}`, sig));
  if (ok) await setSubscribed([id], false);
  return (
    <main className="flex min-h-dvh items-center justify-center bg-white px-6 text-center text-[#262627]">
      <div className="max-w-sm">
        <h1 className="text-[22px] font-semibold">{ok ? "You're unsubscribed" : "This link isn't valid"}</h1>
        <p className="mt-2 text-[15px] text-[#5e5e5e]">
          {ok ? "You won't get any more of these emails." : "It may have been copied incompletely. Reply to the email and we'll remove you by hand."}
        </p>
      </div>
    </main>
  );
}
