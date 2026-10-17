// Starts an in-memory Postgres, seeds test forms, then serves the production build.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const PG_PORT = 5434;
const db = await PGlite.create();
await new PGLiteSocketServer({ db, port: PG_PORT, host: "127.0.0.1" }).start();

// Fake Calendly API for the sync tests: four calls in every state.
import http from "node:http";
const H = 3_600_000;
const iso = (ms) => new Date(Date.now() + ms).toISOString();
const EVENTS = [
  { id: "ev-up", name: "1:1 Discovery Call", start: iso(48 * H), status: "active", invitee: { email: "upcoming@e2e.test", name: "Upa Coming", no_show: null } },
  { id: "ev-done", name: "1:1 Discovery Call", start: iso(-48 * H), status: "active", invitee: { email: "done@e2e.test", name: "Dana Done", no_show: null } },
  { id: "ev-ns", name: "1:1 Discovery Call", start: iso(-24 * H), status: "active", invitee: { email: "noshow@e2e.test", name: "Nick Noshow", no_show: { uri: "x" } } },
  { id: "ev-cx", name: "1:1 Discovery Call", start: iso(24 * H), status: "canceled", invitee: { email: "cancel@e2e.test", name: "Cara Cancel", no_show: null, cancellation: { reason: "Something came up" } } },
];
const CAL = "https://api.calendly.com";
http
  .createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    const send = (body) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (req.headers.authorization !== "Bearer e2e-calendly-token") { res.writeHead(401); return res.end("{}"); }
    if (u.pathname === "/users/me") return send({ resource: { uri: `${CAL}/users/ME` } });
    if (u.pathname === "/scheduled_events")
      return send({ collection: EVENTS.map((e) => ({ uri: `${CAL}/scheduled_events/${e.id}`, name: e.name, start_time: e.start, end_time: e.start, status: e.status })), pagination: { next_page: null } });
    const m = /^\/scheduled_events\/([^/]+)\/invitees$/.exec(u.pathname);
    const ev = m && EVENTS.find((e) => e.id === m[1]);
    if (ev)
      return send({
        collection: [{ uri: `${CAL}/scheduled_events/${ev.id}/invitees/i-${ev.id}`, ...ev.invitee, status: ev.status, reschedule_url: "", cancel_url: "", questions_and_answers: [] }],
        pagination: { next_page: null },
      });
    res.writeHead(404);
    res.end("{}");
  })
  .listen(3199, "127.0.0.1");

const env = {
  ...process.env,
  DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${PG_PORT}/postgres`,
  DATABASE_POOL_MAX: "1",
  ADMIN_PASSWORD: "e2e-admin-pass",
  SESSION_SECRET: "e2e-session-secret-0123456789",
  NODE_ENV: "production",
  CALENDLY_TOKEN: "e2e-calendly-token",
  CALENDLY_API_BASE: "http://127.0.0.1:3199",
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
