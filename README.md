# Tawakkul Forms

A self-hosted Typeform-style form builder with a lead dashboard.

- **Public form:** `/apply/<slug>` (one question at a time, keyboard first, mobile friendly)
- **Admin:** `/login`, then `/forms` (password protected)
- **Typeform import:** `/forms/import` (API token or CSV)
- **Embed script:** `/embed.js` (popup, slide-in, side tab, chat bubble, full page)

## Features

Questions: short/long text, email, phone (country picker), number (min/max), website, date (format),
multiple choice (+Other, None of the above, randomize), checkboxes (min/max), picture choice, dropdown (searchable),
yes/no, legal consent, ranking, rating, opinion scale (steps/labels), matrix, file upload (4 MB), statement, and
multi-field screens (contact info, address).

Logic and flow: jump rules (any/all conditions, quiz score), several endings, Calendly booking embed with a "booked"
confirmation, recall of earlier answers and URL parameters (`{{field:ID}}`, `{{hidden:utm_source}}`), quiz scoring,
hidden fields, rich text (`*bold*`, `_italic_`, `[link](https://...)`), images on screens, autosave and resume.

Design: Typeform's "Classic blue" plus presets, custom colours, fonts, corners, text size, background image.

Results: views, starts, completion rate, average time, drop-off per screen, devices, endings reached, traffic sources,
incomplete (quit-early) responses, search, date filter, bulk status/delete, CSV export.

Operations: password-protected forms, close date and response limit, webhook (with test button), email alert (Brevo),
share preview tags, QR code, duplicate form, templates.

## Run locally

```bash
npm install --cache ./.npm-cache
npm run dev        # http://localhost:3000
```

With no env vars the dashboard is open and leads are stored in `.data/forms.json` (development only).

## Deploy (Vercel + Supabase)

Environment variables:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string (Supabase: Connect > Transaction pooler). Tables are created automatically. |
| `DATABASE_POOL_MAX` | `1` on Vercel |
| `ADMIN_PASSWORD` | Admin login password |
| `SESSION_SECRET` | Long random string used to sign the login cookie |
| `BREVO_API_KEY`, `NOTIFY_FROM_EMAIL` | Optional: email alert on each new application |

## Tests

```bash
npm test                  # unit tests: routing, validation, scoring, security helpers, rich text, metrics, import
npm run test:db           # every database function against a real Postgres (needs DATABASE_URL)
npm run test:e2e          # builds, then runs ~40 browser tests against an isolated in-memory database
node scripts/fuzz-api.mjs http://localhost:3000 <slug>     # hostile-input check of the public API
node scripts/smoke.mjs https://YOUR-SITE <slug> --env      # read-only production check (uses ADMIN_PASSWORD from env)
```

The browser tests cover: both application paths of the mentorship form, validation, back/resume, quit-early capture,
every question type, uploads, password gate, response limits, rate limiting, hostile payloads, security headers,
admin login/lockout, the builder (live preview, save, themes, publish/close), responses (search, bulk, export),
CSV import, backups, embed styles, the Calendly confirmation, phone layout and WCAG accessibility scans.
CI runs all of this on every push (`.github/workflows/ci.yml`).

## Going live checklist

1. Environment variables set in Vercel (table above), then redeploy.
2. `node scripts/smoke.mjs https://YOUR-SITE <slug> --env` passes.
3. Publish the form, open the public link once on your phone, submit a test application, delete the test lead.
4. Optional: set a Brevo key and use the "Send test" button to confirm email alerts.
5. Download a backup from the dashboard now and then.
