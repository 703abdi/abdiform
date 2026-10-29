// Visitor analytics for forms: one row per visit (form_sessions) with where the visitor came from,
// where they are, their device, how long they stayed and how far they got. Time on each question
// is stored on form_events.ms. No raw IP addresses are stored: location comes from Vercel's
// geo headers (country / region / city) and is kept at city level.

import { iso, q } from "@/lib/db";
import type { Device } from "@/forms/events-labels";

export interface VisitInfo {
  referrer?: string;
  utm?: Record<string, string>;
  screen_w?: number;
  language?: string;
  timezone?: string;
}

const clip = (s: unknown, n: number) => (typeof s === "string" ? s.slice(0, n) : "");

/** Social apps open links in their own browser and say so in the user agent. */
export function inAppBrowser(ua: string): string {
  if (/Instagram/i.test(ua)) return "Instagram";
  if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)) return "Facebook";
  if (/musical_ly|TikTok|BytedanceWebview|ByteLocale/i.test(ua)) return "TikTok";
  if (/Snapchat/i.test(ua)) return "Snapchat";
  if (/LinkedInApp/i.test(ua)) return "LinkedIn";
  if (/Twitter|TwitterAndroid/i.test(ua)) return "X";
  if (/GSA\//.test(ua)) return "Google app";
  return "";
}

export function parseUA(ua: string): { os: string; browser: string } {
  const os = /iPhone|iPad|iPod/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /CrOS/.test(ua)
            ? "ChromeOS"
            : /Linux/.test(ua)
              ? "Linux"
              : "";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /SamsungBrowser/.test(ua)
      ? "Samsung Internet"
      : /OPR\/|Opera/.test(ua)
        ? "Opera"
        : /Firefox|FxiOS/.test(ua)
          ? "Firefox"
          : /CriOS|Chrome\//.test(ua)
            ? "Chrome"
            : /Safari\//.test(ua)
              ? "Safari"
              : "";
  return { os, browser };
}

const REF_SOURCES: [RegExp, string][] = [
  [/(^|\.)instagram\.com$/, "Instagram"],
  [/(^|\.)(facebook|fb)\.com$|(^|\.)fb\.me$/, "Facebook"],
  [/(^|\.)tiktok\.com$/, "TikTok"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "YouTube"],
  [/(^|\.)(t\.co|x\.com|twitter\.com)$/, "X"],
  [/(^|\.)linkedin\.com$|(^|\.)lnkd\.in$/, "LinkedIn"],
  [/(^|\.)snapchat\.com$/, "Snapchat"],
  [/(^|\.)reddit\.com$/, "Reddit"],
  [/(^|\.)google\.[a-z.]+$/, "Google"],
  [/(^|\.)bing\.com$/, "Bing"],
  [/(^|\.)(whatsapp\.com|wa\.me)$/, "WhatsApp"],
  [/(^|\.)t\.me$|(^|\.)telegram\.org$/, "Telegram"],
  [/(^|\.)discord(app)?\.com$/, "Discord"],
  [/(^|\.)linktr\.ee$/, "Linktree"],
  [/(^|\.)stan\.store$/, "Stan"],
  [/(^|\.)whop\.com$/, "Whop"],
  [/(^|\.)calendly\.com$/, "Calendly"],
  [/(^|\.)mail\.google\.com$|(^|\.)outlook\.(live|office)\.com$/, "Email"],
];

const UTM_NAMES: Record<string, string> = {
  ig: "Instagram", instagram: "Instagram", insta: "Instagram",
  fb: "Facebook", facebook: "Facebook", meta: "Facebook",
  tt: "TikTok", tiktok: "TikTok",
  yt: "YouTube", youtube: "YouTube",
  x: "X", twitter: "X",
  google: "Google", email: "Email", newsletter: "Email", brevo: "Email",
  linkedin: "LinkedIn", discord: "Discord", whatsapp: "WhatsApp", telegram: "Telegram", sms: "SMS",
};

/**
 * One label per visit: utm_source wins (you tagged the link), then the social app's own browser,
 * then the referring site, else "Direct" (typed, bookmarked, or the app hid where they came from).
 */
export function classifySource(referrer: string, utm: Record<string, string>, ua: string, ownHost: string): string {
  const tagged = (utm.utm_source ?? "").trim();
  if (tagged) return UTM_NAMES[tagged.toLowerCase()] ?? tagged.slice(0, 40);
  const app = inAppBrowser(ua);
  if (app && app !== "Google app") return app;
  let host = "";
  try {
    host = new URL(referrer).hostname.replace(/^www\.|^m\.|^l\.|^lm\./, "");
  } catch {
    host = "";
  }
  if (host && host !== ownHost) {
    for (const [re, name] of REF_SOURCES) if (re.test(host)) return name;
    if (/tawakkul/i.test(host)) return "Website";
    return host.slice(0, 60);
  }
  if (app === "Google app") return "Google";
  return "Direct";
}

export async function startVisit(input: {
  formId: string;
  rid: string;
  visitorId: string;
  ua: string;
  device: Device;
  ownHost: string;
  geo: { country: string; region: string; city: string };
  info: VisitInfo;
}): Promise<void> {
  const utm: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.info.utm ?? {})) {
    if (/^utm_[a-z]{1,20}$/.test(k) && typeof v === "string" && v) utm[k] = v.slice(0, 120);
  }
  const referrer = clip(input.info.referrer, 300);
  const { os, browser } = parseUA(input.ua);
  const [prior] = input.visitorId
    ? await q(`select 1 from form_sessions where visitor_id = $1 and rid <> $2 limit 1`, [input.visitorId, input.rid])
    : [];
  await q(
    `insert into form_sessions (form_id, rid, visitor_id, repeat_visit, source, referrer, utm, device, os, browser, in_app, country, region, city, language, timezone, screen_w)
     values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     on conflict (form_id, rid) do update set last_at = now()`,
    [
      input.formId,
      input.rid,
      input.visitorId,
      !!prior,
      classifySource(referrer, utm, input.ua, input.ownHost),
      referrer,
      JSON.stringify(utm),
      input.device,
      os,
      browser,
      inAppBrowser(input.ua),
      clip(input.geo.country, 2).toUpperCase(),
      clip(input.geo.region, 60),
      clip(input.geo.city, 80),
      clip(input.info.language, 20),
      clip(input.info.timezone, 60),
      Math.max(0, Math.min(10000, Math.round(Number(input.info.screen_w) || 0))),
    ],
  );
}

/** Visitor moved past a screen: record how long they spent on it. */
export async function recordDwell(formId: string, rid: string, screen: string, ms: number) {
  const t = Math.max(0, Math.min(3_600_000, Math.round(ms)));
  await q(`update form_events set ms = greatest(ms, $4) where form_id = $1 and rid = $2 and screen = $3`, [formId, rid, screen, t]);
}

export async function touchVisit(formId: string, rid: string, patch: { screen?: string; started?: boolean; finished?: boolean; back?: boolean; activeMs?: number }) {
  await q(
    `update form_sessions set
       last_at = now(),
       last_screen = case when $3::text is not null and $3 <> '' then $3 else last_screen end,
       screens = screens + case when $3::text is not null and $3 <> '' and $3 not like '\\_%' then 1 else 0 end,
       started = started or $4,
       finished = finished or $5,
       backs = backs + case when $6 then 1 else 0 end,
       active_ms = greatest(active_ms, $7)
     where form_id = $1 and rid = $2`,
    [formId, rid, patch.screen ?? null, !!patch.started, !!patch.finished, !!patch.back, Math.max(0, Math.min(86_400_000, Math.round(patch.activeMs ?? 0)))],
  );
}

/* --------------------------------- reporting --------------------------------- */

export interface VisitRow {
  rid: string;
  first_at: string;
  active_s: number;
  source: string;
  utm_campaign: string;
  device: string;
  os: string;
  browser: string;
  in_app: string;
  country: string;
  region: string;
  city: string;
  returning: boolean;
  screens: number;
  backs: number;
  last_screen: string;
  started: boolean;
  finished: boolean;
  response_id: string | null;
}

const WHERE = `form_id = $1 and ($2::timestamptz is null or first_at >= $2) and ($3::text is null or device = $3)`;

export async function visitReport(formId: string, since: Date | null, device: string | null) {
  const p = [formId, since, device];
  const count = async (col: string, limit = 12) =>
    (await q(`select ${col} as k, count(*)::int n, count(*) filter (where finished)::int done from form_sessions where ${WHERE} group by 1 order by n desc limit ${limit}`, p)).map(
      (r) => ({ key: (r.k as string) || "Unknown", n: Number(r.n), done: Number(r.done) }),
    );
  const [totals] = await q(
    `select count(*)::int visits, count(distinct nullif(visitor_id, ''))::int people,
            count(*) filter (where repeat_visit)::int repeats,
            count(*) filter (where started)::int started, count(*) filter (where finished)::int finished,
            coalesce(avg(active_ms) filter (where active_ms > 0), 0)::float avg_ms,
            coalesce(percentile_cont(0.5) within group (order by active_ms) filter (where active_ms > 0), 0)::float median_ms
     from form_sessions where ${WHERE}`,
    p,
  );
  const [sources, countries, cities, devices, browsers, campaigns, apps] = await Promise.all([
    count("source"),
    count("country"),
    count("case when city <> '' then city || case when country <> '' then ', ' || country else '' end else '' end"),
    count("device"),
    count("case when os <> '' then os || ' · ' || coalesce(nullif(in_app, ''), nullif(browser, ''), '?') else '' end"),
    count("utm->>'utm_campaign'"),
    count("nullif(in_app, '')"),
  ]);
  const byHour = (await q(`select extract(hour from first_at at time zone $4)::int h, count(*)::int n from form_sessions where ${WHERE} group by 1`, [...p, process.env.APP_TIMEZONE || "America/New_York"])).map((r) => ({ h: Number(r.h), n: Number(r.n) }));
  const rows = await q(
    `select s.*, (select r.id from form_responses r where r.form_id = s.form_id and r.external_id = 'web:' || s.rid limit 1) as response_id
     from form_sessions s where ${WHERE.replace(/form_id|first_at|device/g, (m) => `s.${m}`)} order by s.first_at desc limit 200`,
    p,
  );
  const visits: VisitRow[] = rows.map((r) => ({
    rid: r.rid as string,
    first_at: iso(r.first_at),
    active_s: Math.round(Number(r.active_ms) / 1000),
    source: r.source as string,
    utm_campaign: ((r.utm as Record<string, string>) ?? {}).utm_campaign ?? "",
    device: r.device as string,
    os: r.os as string,
    browser: r.browser as string,
    in_app: r.in_app as string,
    country: r.country as string,
    region: r.region as string,
    city: r.city as string,
    returning: !!r.repeat_visit,
    screens: Number(r.screens),
    backs: Number(r.backs),
    last_screen: r.last_screen as string,
    started: !!r.started,
    finished: !!r.finished,
    response_id: (r.response_id as string | null) ?? null,
  }));
  return {
    totals: {
      visits: Number(totals?.visits ?? 0),
      people: Number(totals?.people ?? 0),
      returning: Number(totals?.repeats ?? 0),
      started: Number(totals?.started ?? 0),
      finished: Number(totals?.finished ?? 0),
      avg_s: Math.round(Number(totals?.avg_ms ?? 0) / 1000),
      median_s: Math.round(Number(totals?.median_ms ?? 0) / 1000),
    },
    sources,
    countries,
    cities: cities.filter((c) => c.key !== "Unknown"),
    devices,
    browsers: browsers.filter((c) => c.key !== "Unknown"),
    campaigns: campaigns.filter((c) => c.key !== "Unknown"),
    apps: apps.filter((c) => c.key !== "Unknown"),
    byHour,
    visits,
  };
}

/** Average seconds people spent on each screen (only counted once they moved on from it). */
export async function timePerScreen(formId: string, since: Date | null, device: string | null): Promise<Record<string, number>> {
  const rows = await q(
    `select screen, avg(ms)::float a from form_events
     where form_id = $1 and ms > 0 and screen not like '\\_%' and ($2::timestamptz is null or created_at >= $2) and ($3::text is null or device = $3)
     group by screen`,
    [formId, since, device],
  );
  return Object.fromEntries(rows.map((r) => [r.screen as string, Math.round(Number(r.a) / 100) / 10]));
}

/** Screen-by-screen path of one visit, with seconds on each (for the response drawer). */
export async function visitPath(formId: string, rid: string) {
  const [s] = await q(`select * from form_sessions where form_id = $1 and rid = $2`, [formId, rid]);
  const steps = await q(`select screen, ms, created_at from form_events where form_id = $1 and rid = $2 order by created_at`, [formId, rid]);
  return {
    session: s
      ? {
          source: s.source as string,
          referrer: s.referrer as string,
          utm: (s.utm as Record<string, string>) ?? {},
          device: s.device as string,
          os: s.os as string,
          browser: s.browser as string,
          in_app: s.in_app as string,
          country: s.country as string,
          region: s.region as string,
          city: s.city as string,
          language: s.language as string,
          timezone: s.timezone as string,
          returning: !!s.repeat_visit,
          active_s: Math.round(Number(s.active_ms) / 1000),
          backs: Number(s.backs),
        }
      : null,
    steps: steps.map((r) => ({ screen: r.screen as string, seconds: Math.round(Number(r.ms) / 100) / 10, at: iso(r.created_at) })),
  };
}
