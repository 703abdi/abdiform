// Signed contact codes for links we send people (e.g. ?c=... on the pre-call page), so a page can
// tell who is watching without a login. Can't be forged or changed to someone else's id.

import { signValue, verifySignedValue } from "@/lib/session";
import { isUuid } from "@/lib/db";

export async function contactToken(contactId: string): Promise<string | null> {
  const sig = await signValue(`ct:${contactId}`);
  return sig ? `${contactId}.${sig}` : null;
}

export async function contactFromToken(token: string | null | undefined): Promise<string | null> {
  if (!token) return null;
  const [id, sig] = token.split(".");
  if (!id || !sig || !isUuid(id)) return null;
  return (await verifySignedValue(`ct:${id}`, sig)) ? id : null;
}
