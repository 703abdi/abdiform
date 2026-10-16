// Starts an in-memory Postgres, seeds test forms, then serves the production build.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const PG_PORT = 5434;
const db = await PGlite.create();
await new PGLiteSocketServer({ db, port: PG_PORT, host: "127.0.0.1" }).start();

const env = {
  ...process.env,
  DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${PG_PORT}/postgres`,
  DATABASE_POOL_MAX: "1",
  ADMIN_PASSWORD: "e2e-admin-pass",
  SESSION_SECRET: "e2e-session-secret-0123456789",
  NODE_ENV: "production",
  // emails (verification codes etc.) are written here instead of being sent
  EMAIL_OUTBOX_FILE: path.resolve(".e2e-outbox.jsonl"),
};
fs.rmSync(env.EMAIL_OUTBOX_FILE, { force: true });
delete env.GMAIL_USER;
delete env.GMAIL_APP_PASSWORD;
delete env.BREVO_API_KEY;

// async on purpose: this process hosts the database, so it must stay responsive while seeding
const seedCode = await new Promise((resolve) => {
  const seed = spawn("npx", ["tsx", "scripts/e2e-seed.mts"], { env: { ...env, NODE_ENV: "development" }, stdio: "inherit" });
  seed.on("exit", resolve);
});
if (seedCode !== 0) process.exit(1);

const next = spawn("npx", ["next", "start", "-p", "3100"], { env, stdio: "inherit" });
const stop = () => { next.kill(); process.exit(0); };
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
next.on("exit", (c) => process.exit(c ?? 0));
