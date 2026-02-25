# Pitcher Trend Analyzer — Project Memory

## Stack
- **Backend**: FastAPI + Python 3.11 (.venv), runs on port 8000
- **Frontend**: React 18 + Vite + TypeScript + Tailwind CSS, runs on port 5173
- **Data**: pybaseball (Statcast + Fangraphs), in-memory TTL cache
- **Auth/DB**: Supabase (email/password auth, Postgres)
- **Payments**: Stripe ($5/year Pro plan)
- **Email**: SendGrid (weekly Monday 9am notifications for paid users)
- **Scheduler**: APScheduler (BackgroundScheduler, CronTrigger)

## Key File Locations
- `backend/main.py` — FastAPI app, all routes
- `backend/data.py` — pybaseball fetch + cache layer
- `backend/compute.py` — analysis computations
- `backend/auth.py` — JWT verification + TEST_MODE bypass (X-Dev-User-ID header)
- `backend/db.py` — router: TEST_MODE→db_local.py, prod→db_supabase.py
- `backend/db_local.py` — psycopg2 DB layer (Docker/test)
- `backend/db_supabase.py` — Supabase DB layer (production)
- `backend/email_service.py` — Jinja2 template render + SMTP (test) / SendGrid (prod)
- `backend/templates/weekly_email.html` — editable Jinja2 email template
- `backend/scheduler.py` — APScheduler Monday 9am job
- `backend/dev_routes.py` — /dev/* endpoints (TEST_MODE only)
- `backend/migrations/001_initial.sql` — Supabase schema (run in Supabase SQL Editor)
- `backend/migrations/002_local_auth.sql` — Docker local Postgres schema
- `backend/seed.sql` — Docker seed data (paid + free test users)
- `backend/.env` — all secret keys (placeholders, user fills in)
- `docker-compose.yml` — postgres + mailpit + backend
- `frontend/src/contexts/AuthContext.tsx` — Supabase auth state
- `frontend/src/pages/AuthPage.tsx` — sign in / sign up form
- `frontend/src/components/UserMenu.tsx` — account/subscription/notification settings UI
- `frontend/src/components/Sidebar.tsx` — main sidebar, includes saved pitcher bucket
- `frontend/src/api/client.ts` — typed API functions, all accept optional TokenGetter
- `frontend/.env` — VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_STRIPE_PUBLISHABLE_KEY

## Auth Flow
- Supabase handles email/password auth
- Frontend: `@supabase/supabase-js` → `AuthContext` → `useAuth()` hook
- Backend: JWT from Supabase verified via `PyJWT` using `SUPABASE_JWT_SECRET`
- Protected routes use `Depends(get_user_id)` from `auth.py`

## Database Tables (Supabase Postgres)
- `profiles` — auto-created on signup via trigger
- `saved_pitchers` — user's watched pitchers bucket (UNIQUE user_id + pitcher_name)
- `subscriptions` — Stripe subscription status per user
- `notification_settings` — email notification preferences (Pro only)
- All tables have Row Level Security enabled

## Stripe Flow
- Backend creates Checkout Session → redirects to Stripe
- Success URL: `APP_URL?checkout=success`
- Webhook (`/api/webhooks/stripe`): handles `checkout.session.completed` and `customer.subscription.deleted/updated`
- Local testing: `stripe listen --forward-to localhost:8000/api/webhooks/stripe`

## User Preferences
- User can continue as guest (no account needed for analysis)
- Saved pitcher bucket visible at top of sidebar when logged in
- ★ indicator on saved pitchers in the full list
- Watch/★ toggle button next to selected pitcher name

## Docker Dev Environment
- `docker-compose up --build` — starts postgres + mailpit + backend
- Backend: http://localhost:8000 | Mailpit email UI: http://localhost:8025
- TEST_MODE=1 in Docker — bypasses JWT, uses local Postgres, sends email via SMTP to Mailpit
- Seeded paid user ID: `00000000-0000-0000-0000-000000000001`
- Seeded free user ID: `00000000-0000-0000-0000-000000000002`
- Auth in TEST_MODE: send `X-Dev-User-ID: <uuid>` header (no header = defaults to paid user)
- Dev endpoints: `GET /dev/email-preview`, `POST /dev/send-test-email`, `GET /dev/seed-status`
- Email template: edit `backend/templates/weekly_email.html` then refresh `/dev/email-preview`

## Tests
- Run: `docker-compose exec backend pytest tests/`
- pytest.ini at `tests/pytest.ini` (pythonpath = backend)
- conftest.py sets TEST_MODE=1 and DATABASE_URL before app imports
- Reports tests mock `data.load_season` / `data.build_trend_df` — no pybaseball network calls

## Running (non-Docker)
- Backend: `cd backend && uvicorn main:app --reload`
- Frontend: `cd frontend && npm run dev` (requires Node 20 via nvm)
  - `source ~/.nvm/nvm.sh` then `npm run dev`
- Build: `source ~/.nvm/nvm.sh && npm run build`

## Setup Checklist (for user)
1. Create Supabase project, run `backend/migrations/001_initial.sql`
2. Fill in `backend/.env` and `frontend/.env` with real keys
3. Create Stripe product ($5/year) and paste price ID in backend/.env
4. Set up SendGrid API key for weekly emails
5. For Stripe local testing: install Stripe CLI, run `stripe listen`
