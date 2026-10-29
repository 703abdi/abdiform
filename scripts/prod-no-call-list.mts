// One-off: smart list of everyone who finished the 1:1 application but has no call booked or done.
// Membership updates itself: new applicants join, anyone who books drops off.
import { createList, listContacts } from "../src/contacts/repo";
import { matchesFilter } from "../src/contacts/filter";
import type { ContactFilter } from "../src/contacts/types";

const filter: ContactFilter = {
  match: "all",
  rules: [
    { field: "tag", op: "has", value: "Tawakkul 1:1 App" },
    { field: "tag", op: "has", value: "Completed" },
    { field: "tag", op: "has_not", value: "Booked" },
    { field: "tag", op: "has_not", value: "Call done" },
    { field: "tag", op: "has_not", value: "No-show" },
    { field: "subscribed", op: "is", value: "yes" },
  ],
};
const list = await createList("Applied, no call booked", "smart", filter);
const all = await listContacts();
const members = all.filter((c) => matchesFilter(c, filter));
console.log(`list ${list.id}: ${members.length} people (${members.filter((c) => c.tags.includes("Canceled")).length} of them canceled a call)`);
const byMonth = new Map<string, number>();
for (const c of members) byMonth.set(c.created_at.slice(0, 7), (byMonth.get(c.created_at.slice(0, 7)) ?? 0) + 1);
console.log([...byMonth].sort().map(([m, n]) => `${m}: ${n}`).join("  "));
process.exit(0);
