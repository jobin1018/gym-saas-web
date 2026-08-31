# GymDean

A gym management dashboard for front-desk staff — member check-ins, renewals,
and revenue at a glance. Built with Vite, React, TypeScript, and Tailwind CSS,
backed by Supabase (Postgres + PostgREST).

## Stack

- **Frontend:** React 19 + TypeScript, React Router, Tailwind CSS, Recharts
- **Backend:** Supabase (Postgres, PostgREST, GoTrue) — see the sibling
  `gym-saas` repo for schema migrations and Edge Functions
- **Data access:** `@supabase/supabase-js`, queried directly from the browser
  with the anon/publishable key

## Getting started

```bash
npm install
cp .env.local.example .env.local   # then fill in your local Supabase keys
npm run dev
```

Requires a running local Supabase stack (`supabase start` from the `gym-saas`
backend repo) on the default local ports (API at `127.0.0.1:54321`).

### Environment variables

| Variable | Description |
| --- | --- |
| `VITE_SUPABASE_URL` | Local or hosted Supabase API URL |
| `VITE_SUPABASE_ANON_KEY` | Anon/publishable key for that project |

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check (`tsc -b`) and build for production |
| `npm run lint` | Run Oxlint |
| `npm run preview` | Preview a production build locally |

## Pages

- **Overview** (`/`) — renewals due, overdue amount, today's check-ins
- **Members** (`/members`) — search, add, edit, and bulk CSV-import members
- **Revenue** (`/revenue`) — daily collections chart, this month vs last month

## Known gaps (read before deploying anywhere but localhost)

- **Login is placeholder PIN auth**, not real Supabase Auth. There's no
  JWT-based session, so the app can't tell which organization a request
  belongs to.
- The backend has a migration —
  `20260823160000_LOCAL_DEV_ONLY_permissive_read_policies.sql` — that grants
  the anon key read access across **all** organizations' data to work around
  the above. It is explicitly marked local-dev-only and must be rolled back
  before staging/production; see that file's header for the rollback steps.
- Because there's no real org/session context, writes (add member, CSV
  import) fall back to a hardcoded dev organization/location in
  `src/lib/session.ts` unless `gym_session` in `localStorage` happens to carry
  a real `organization_id`.
- Editing a member's plan or start date does **not** recalculate or prorate
  the current billing period — the form warns about this inline rather than
  guessing.
- Offline writes (add/edit member, CSV import) queue in `localStorage` and
  retry automatically when the browser comes back online — see
  `src/lib/offlineQueue.ts`. This is not a general offline-first
  architecture: no conflict resolution, no offline reads.
