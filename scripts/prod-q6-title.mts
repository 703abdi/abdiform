// One-off: reword the budget question (Q6) on the live main form. Choices and routing unchanged.
import { q } from "../src/lib/db";

const NEW = "*How much do you have available to fund your trading account?*";
const [f] = await q(`select id, fields from forms where slug = 'tawakkul-1-1-app'`);
const fields = f.fields as { id: string; title: string }[];
const q6 = fields.find((x) => x.id === "q_e5f8747599");
if (!q6) throw new Error("Q6 not found");
console.log("before:", q6.title);
q6.title = NEW;
await q(`update forms set fields = $2::jsonb, updated_at = now() where id = $1`, [f.id, JSON.stringify(fields)]);
console.log("after: ", NEW);
process.exit(0);
