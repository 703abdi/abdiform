// Dev/test helper: an in-memory Postgres on localhost:5433.
//   node scripts/pg-dev.mjs
//   DATABASE_URL=postgres://postgres:postgres@localhost:5433/postgres npm run dev
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const db = await PGlite.create();
const server = new PGLiteSocketServer({ db, port: 5433, host: "127.0.0.1" });
await server.start();
console.log("pglite listening on 5433");
