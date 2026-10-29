// Shared Postgres access for the whole app (Supabase, Neon or any Postgres via DATABASE_URL).
//
// - node-postgres + Vercel's attachDatabasePool: idle connections are closed before a
//   serverless function is suspended (a stale socket would make the next request hang).
// - Versioned migrations run automatically on first use, inside one transaction guarded by an
//   advisory lock, so several cold instances starting together can't trip over each other.

import { Pool, type PoolClient } from "pg";
import { attachDatabasePool } from "@vercel/functions";

const G = "__tawakkul_forms_pg__";

/** Split DATABASE_URL by hand so passwords containing ? # / @ % work without URL-encoding. */
function connectionOptions(url: string) {
  const m = url.match(/^postgres(?:ql)?:\/\/([^:]+):(.*)@([^@/:]+)(?::(\d+))?\/([^?]*)/);
  if (!m) return { connectionString: url };
  const [, user, password, host, port, database] = m;
  return { host, port: port ? Number(port) : 5432, user, password, database: database || "postgres" };
}

export const databaseConfigured = () => !!process.env.DATABASE_URL;

function pool(): Pool {
  const g = globalThis as unknown as Record<string, Pool | undefined>;
  if (g[G]) return g[G]!;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Add your Postgres connection string to the environment.");
  const local = /localhost|127\.0\.0\.1/.test(url);
  const p = new Pool({
    ...connectionOptions(url),
    ssl: local ? false : { rejectUnauthorized: false },
    max: Number(process.env.DATABASE_POOL_MAX ?? 3),
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 10_000,
    query_timeout: 15_000,
    statement_timeout: 15_000,
  });
  p.on("error", () => {
    // an idle client died; the pool discards it and opens a new one on demand
  });
  if (process.env.VERCEL) attachDatabasePool(p);
  g[G] = p;
  return p;
}

/* -------------------------------- migrations -------------------------------- */

const MIGRATIONS: string[][] = [
  // 1: forms + responses + uploads + rate limiting
  [
    `create table if not exists forms (
      id uuid primary key default gen_random_uuid(),
      slug text unique not null,
      title text not null,
      description text not null default '',
      status text not null default 'draft',
      fields jsonb not null default '[]'::jsonb,
      settings jsonb not null default '{}'::jsonb,
      views integer not null default 0,
      starts integer not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`,
    `create table if not exists form_responses (
      id uuid primary key default gen_random_uuid(),
      form_id uuid not null references forms(id) on delete cascade,
      answers jsonb not null default '{}'::jsonb,
      submitted_at timestamptz not null default now(),
      source text not null default 'web',
      external_id text,
      status text not null default 'new',
      notes text not null default '',
      meta jsonb not null default '{}'::jsonb,
      unique (form_id, external_id)
    )`,
    `create index if not exists form_responses_form_idx on form_responses (form_id, submitted_at desc)`,
    `create table if not exists form_files (
      id uuid primary key default gen_random_uuid(),
      form_id uuid not null references forms(id) on delete cascade,
      name text not null,
      mime text not null,
      size integer not null,
      data bytea not null,
      created_at timestamptz not null default now()
    )`,
    `create table if not exists rate_limits (
      key text not null,
      window_start timestamptz not null,
      n integer not null default 0,
      primary key (key, window_start)
    )`,
  ],
  // 2: workspaces, contacts, lists, automations, visit tracking
  [
    `create table if not exists workspaces (
      id uuid primary key default gen_random_uuid(),
      name text not null,
      created_at timestamptz not null default now()
    )`,
    `alter table forms add column if not exists workspace_id uuid references workspaces(id) on delete set null`,
    `insert into workspaces (name) select 'My workspace' where not exists (select 1 from workspaces)`,
    `update forms set workspace_id = (select id from workspaces order by created_at limit 1) where workspace_id is null`,
    `create table if not exists contacts (
      id uuid primary key default gen_random_uuid(),
      email text not null,
      first_name text not null default '',
      last_name text not null default '',
      phone text not null default '',
      properties jsonb not null default '{}'::jsonb,
      tags text[] not null default '{}',
      subscribed boolean not null default true,
      source_form_id uuid references forms(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      last_activity_at timestamptz not null default now()
    )`,
    `create unique index if not exists contacts_email_key on contacts (lower(email))`,
    `alter table form_responses add column if not exists contact_id uuid references contacts(id) on delete set null`,
    `create index if not exists form_responses_contact_idx on form_responses (contact_id)`,
    `create table if not exists contact_lists (
      id uuid primary key default gen_random_uuid(),
      name text not null,
      kind text not null default 'static',
      filter jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    )`,
    `create table if not exists contact_list_members (
      list_id uuid not null references contact_lists(id) on delete cascade,
      contact_id uuid not null references contacts(id) on delete cascade,
      added_at timestamptz not null default now(),
      primary key (list_id, contact_id)
    )`,
    `create table if not exists automations (
      id uuid primary key default gen_random_uuid(),
      name text not null,
      status text not null default 'draft',
      trigger jsonb not null default '{}'::jsonb,
      steps jsonb not null default '[]'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`,
    `create table if not exists automation_runs (
      id uuid primary key default gen_random_uuid(),
      automation_id uuid not null references automations(id) on delete cascade,
      contact_id uuid references contacts(id) on delete cascade,
      trigger_key text not null,
      step integer not null default 0,
      status text not null default 'waiting',
      next_run_at timestamptz not null default now(),
      log jsonb not null default '[]'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (automation_id, contact_id, trigger_key)
    )`,
    `create index if not exists automation_runs_due_idx on automation_runs (status, next_run_at)`,
    `create table if not exists form_events (
      form_id uuid not null references forms(id) on delete cascade,
      rid text not null,
      screen text not null,
      device text not null default 'desktop',
      created_at timestamptz not null default now(),
      primary key (form_id, rid, screen)
    )`,
    `create index if not exists form_events_form_idx on form_events (form_id, created_at)`,
  ],
  // 3: email verification codes
  [
    `create table if not exists email_codes (
      form_id uuid not null references forms(id) on delete cascade,
      email text not null,
      code_hash text not null,
      attempts integer not null default 0,
      expires_at timestamptz not null,
      created_at timestamptz not null default now(),
      primary key (form_id, email)
    )`,
  ],
  // 4: pages (VSL / landing pages) and email blasts
  [
    `create table if not exists pages (
      id uuid primary key default gen_random_uuid(),
      slug text unique not null,
      title text not null,
      status text not null default 'draft',
      blocks jsonb not null default '[]'::jsonb,
      theme jsonb not null default '{}'::jsonb,
      seo jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`,
    `create table if not exists page_events (
      page_id uuid not null references pages(id) on delete cascade,
      vid text not null,
      kind text not null,
      target text not null default '',
      created_at timestamptz not null default now(),
      primary key (page_id, vid, kind, target)
    )`,
    `create index if not exists page_events_page_idx on page_events (page_id, created_at)`,
    `create table if not exists blasts (
      id uuid primary key default gen_random_uuid(),
      name text not null,
      subject text not null default '',
      preheader text not null default '',
      body text not null default '',
      audience jsonb not null default '{}'::jsonb,
      status text not null default 'draft',
      scheduled_at timestamptz,
      started_at timestamptz,
      sent_at timestamptz,
      error text not null default '',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`,
    `create table if not exists blast_recipients (
      blast_id uuid not null references blasts(id) on delete cascade,
      contact_id uuid references contacts(id) on delete set null,
      email text not null,
      status text not null default 'queued',
      error text not null default '',
      sent_at timestamptz,
      primary key (blast_id, email)
    )`,
    `create index if not exists blast_recipients_queue_idx on blast_recipients (blast_id, status)`,
  ],
  // 5: video watch tracking + Calendly bookings
  [
    `create table if not exists video_watch (
      page_id uuid not null references pages(id) on delete cascade,
      contact_id uuid not null references contacts(id) on delete cascade,
      block_id text not null,
      pct integer not null default 0,
      seconds integer not null default 0,
      first_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (page_id, contact_id, block_id)
    )`,
    `create table if not exists bookings (
      invitee_uri text primary key,
      event_uri text not null,
      event_name text not null default '',
      email text not null,
      name text not null default '',
      contact_id uuid references contacts(id) on delete set null,
      start_time timestamptz not null,
      end_time timestamptz,
      status text not null default 'active',
      no_show boolean not null default false,
      cancel_reason text not null default '',
      reschedule_url text not null default '',
      cancel_url text not null default '',
      answers jsonb not null default '[]'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`,
    `create index if not exists bookings_contact_idx on bookings (contact_id)`,
    `create index if not exists bookings_start_idx on bookings (start_time)`,
  ],
  // 6: payments (Whop) + event details carried by automation runs
  [
    `create table if not exists payments (
      id text primary key,
      source text not null default 'whop',
      email text not null default '',
      name text not null default '',
      contact_id uuid references contacts(id) on delete set null,
      product text not null default '',
      product_id text not null default '',
      amount numeric not null default 0,
      currency text not null default 'usd',
      recurring boolean not null default false,
      billing_reason text not null default '',
      paid_at timestamptz not null default now(),
      raw jsonb not null default '{}'::jsonb
    )`,
    `create index if not exists payments_contact_idx on payments (contact_id)`,
    `create index if not exists payments_paid_idx on payments (paid_at)`,
    `alter table automation_runs add column if not exists context jsonb not null default '{}'::jsonb`,
  ],
  // 7: visitor analytics (one row per form visit) + time spent on each screen
  [
    `create table if not exists form_sessions (
      form_id uuid not null references forms(id) on delete cascade,
      rid text not null,
      visitor_id text not null default '',
      repeat_visit boolean not null default false,
      first_at timestamptz not null default now(),
      last_at timestamptz not null default now(),
      active_ms integer not null default 0,
      source text not null default 'direct',
      referrer text not null default '',
      utm jsonb not null default '{}'::jsonb,
      device text not null default 'desktop',
      os text not null default '',
      browser text not null default '',
      in_app text not null default '',
      country text not null default '',
      region text not null default '',
      city text not null default '',
      language text not null default '',
      timezone text not null default '',
      screen_w integer not null default 0,
      last_screen text not null default '',
      screens integer not null default 0,
      backs integer not null default 0,
      started boolean not null default false,
      finished boolean not null default false,
      primary key (form_id, rid)
    )`,
    `create index if not exists form_sessions_time_idx on form_sessions (form_id, first_at)`,
    `create index if not exists form_sessions_visitor_idx on form_sessions (visitor_id)`,
    `alter table form_events add column if not exists ms integer not null default 0`,
  ],
];

const RLS_TABLES = [
  "forms", "form_responses", "form_files", "rate_limits", "workspaces", "contacts", "contact_lists",
  "contact_list_members", "automations", "automation_runs", "form_events", "app_meta", "email_codes", "pages", "page_events", "blasts", "blast_recipients", "video_watch", "bookings", "payments", "form_sessions",
];

export const SCHEMA_VERSION = MIGRATIONS.length;

async function migrate(p: Pool): Promise<void> {
  await p.query(`create table if not exists app_meta (key text primary key, value text not null)`);
  const cur = Number((await p.query(`select value from app_meta where key = 'schema_version'`)).rows[0]?.value ?? 0);
  if (cur >= SCHEMA_VERSION) return;
  const c = await p.connect();
  try {
    await c.query("begin");
    await c.query("select pg_advisory_xact_lock(727274)");
    const now = Number((await c.query(`select value from app_meta where key = 'schema_version'`)).rows[0]?.value ?? 0);
    for (let v = now; v < SCHEMA_VERSION; v++) for (const stmt of MIGRATIONS[v]) await c.query(stmt);
    // Lock every table from Supabase's public REST API; this app talks to Postgres directly.
    for (const t of RLS_TABLES) {
      await c.query("savepoint rls");
      try {
        await c.query(`alter table ${t} enable row level security`);
        await c.query("release savepoint rls");
      } catch {
        await c.query("rollback to savepoint rls"); // not Supabase / no permission: fine
      }
    }
    await c.query(
      `insert into app_meta (key, value) values ('schema_version', $1)
       on conflict (key) do update set value = excluded.value`,
      [String(SCHEMA_VERSION)],
    );
    await c.query("commit");
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

let ready: Promise<void> | null = null;
function ensureReady(): Promise<Pool> {
  const p = pool();
  ready ??= migrate(p).catch((e) => {
    ready = null;
    throw e;
  });
  return ready.then(() => p);
}

export type Row = Record<string, unknown>;

/** Run one query (migrations are applied first, once per process). */
export async function q(text: string, params: unknown[] = []): Promise<Row[]> {
  const p = await ensureReady();
  return (await p.query(text, params)).rows;
}

/** Run several statements in one transaction. */
export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const p = await ensureReady();
  const c = await p.connect();
  try {
    await c.query("begin");
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

export const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));
export const json = (v: unknown) => JSON.stringify(v);
export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
