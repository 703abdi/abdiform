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
npm run test:logic    # routing, validation, scoring, templates, cloning
npm run test:import   # Typeform / CSV import mapping
npm run test:db       # every database function (needs DATABASE_URL)
node scripts/fuzz-api.mjs http://localhost:3000 <published-slug>   # hostile-input check
```
