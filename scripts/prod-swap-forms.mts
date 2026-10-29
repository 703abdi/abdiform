// Live: the "everyone books a call" copy takes over the main link; the old form moves aside.
import { getForm, updateForm } from "../src/forms/repo.ts";

const OLD = "3504b76e-a39d-44a6-9cf0-645725f6bdc7";
const NEW = "10f3e365-bb2c-46a7-b97d-5a4c9e711f50";
const old = (await getForm(OLD))!;
const neu = (await getForm(NEW))!;
console.log("before:", old.slug, old.status, "|", neu.slug, neu.status);
if (old.slug === "tawakkul-1-1-app") await updateForm(OLD, { slug: "tawakkul-1-1-app-old", title: "Tawakkul 1:1 App (old routing)" });
await updateForm(NEW, { slug: "tawakkul-1-1-app", title: "Tawakkul 1:1 App", status: "published" });
const a = (await getForm(OLD))!;
const b = (await getForm(NEW))!;
console.log("after: old ->", a.slug, a.status, "| new ->", b.slug, b.status);
process.exit(0);
