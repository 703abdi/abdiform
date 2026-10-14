# Tawakkul Forms

Standalone lead-capture app: a Typeform-style public form, an admin dashboard, and Typeform import.

- Public form: `/apply/<slug>`
- Admin dashboard: `/forms` (password protected)
- Typeform import: `/forms/import` (API token or CSV)

## Run locally

```bash
npm install --cache ./.npm-cache
npm run dev        # http://localhost:3000
```

With no env vars set, the dashboard is open and leads are saved to `.data/forms.json` (dev only).

## Deploy (Vercel + Supabase)

1. Create a new Supabase project. Go to **Connect > Transaction pooler** and copy the connection string.
2. In Vercel, import this project and add these environment variables:
   - `DATABASE_URL` = the connection string (replace `[YOUR-PASSWORD]` with your database password)
   - `ADMIN_PASSWORD` = the password you will use to log in
   - `SESSION_SECRET` = any long random string
3. Deploy. Tables are created automatically on first use. There is no SQL to run.
4. Open `/login`, then `/forms/import` to bring in your Typeform data, publish the form, and share `/apply/<slug>`.
