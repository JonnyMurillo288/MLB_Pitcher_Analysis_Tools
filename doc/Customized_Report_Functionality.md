# Customized Reports

## The bread and butter analysis that will make money
### Purpose
Pitchers tend to be injured after they start to see a drop (sometimes consistent drop) in fastball velocity. This application is meant to easily show the over time analysis for pitchers throughout the season.

The customized reports create a personalized homepage and weekly email digest for signed-up users. Users select pitchers they want to watch throughout the year and see their trends for pitching metrics and stats over time.

---

### Flow

1. **User signs up** — email + password via Supabase Auth. A confirmation email is sent; user must confirm before signing in.
2. **Guest mode** — users can continue without an account. Saving pitchers requires sign-in.
3. **Watch list (bucket)** — logged-in users see a "Watching" section at the top of the sidebar. Any pitcher can be added/removed with the ☆ Watch button next to the selected pitcher name. Saved pitchers also show a ★ indicator in the full pitcher list.
4. **On app open** — if logged in, saved pitchers are shown first (top of sidebar) so the user can jump straight into their watchlist.
5. **Notifications (Pro only)** — users can toggle weekly Monday morning emails from the account menu. Requires an active Pro subscription.
   - Notification email defaults to the account email but can be changed.
   - Emails go out every **Monday at 9 AM ET**.

---

### Pricing & Payments

- **Free tier**: full analysis tool + pitcher watch list (save up to any number of pitchers)
- **Pro tier ($5/year)**: unlocks weekly email notifications
- Payment is processed via **Stripe Checkout** (subscription, annual)
- "Upgrade" button lives in the account dropdown menu (top-right avatar)
- After payment, Stripe sends a webhook to the backend which activates the subscription in the database

---

### Technical Implementation

#### Auth — `frontend/src/contexts/AuthContext.tsx`
- Supabase email/password auth
- `useAuth()` hook exposes: `user`, `session`, `signIn`, `signUp`, `signOut`, `getToken`
- Auth state wraps the entire app via `<AuthProvider>` in `main.tsx`

#### Database — Supabase Postgres (`backend/migrations/001_initial.sql`)
| Table | Purpose |
|-------|---------|
| `profiles` | Auto-created on signup via DB trigger |
| `saved_pitchers` | User's watched pitcher list (unique per user+name) |
| `subscriptions` | Stripe subscription status per user |
| `notification_settings` | Email + enabled flag per user |

All tables use Row Level Security — users can only read/write their own rows.

#### Backend API — `backend/main.py`
| Endpoint | Auth Required | Description |
|----------|--------------|-------------|
| `GET /api/user/saved-pitchers` | Yes | List user's saved pitchers |
| `POST /api/user/saved-pitchers` | Yes | Add pitcher to watch list |
| `DELETE /api/user/saved-pitchers/{name}` | Yes | Remove pitcher from watch list |
| `GET /api/user/subscription` | Yes | Get subscription status |
| `POST /api/user/subscription/checkout` | Yes | Create Stripe Checkout Session |
| `POST /api/webhooks/stripe` | Stripe sig | Handle payment/cancellation events |
| `GET /api/user/notifications` | Yes | Get notification settings |
| `PUT /api/user/notifications` | Yes (Pro) | Update notification settings |

#### Weekly Emails — `backend/email_service.py` + `backend/scheduler.py`
- SendGrid API for delivery
- APScheduler `CronTrigger(day_of_week="mon", hour=9)` in Eastern time
- Only sends to users who: (1) have notifications enabled AND (2) have an active subscription
- Email contains the user's saved pitcher list with a link back to the app

---

### Environment Variables

**`backend/.env`**
```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_JWT_SECRET
STRIPE_SECRET_KEY
STRIPE_PUBLISHABLE_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_ID          # $5/year product price ID from Stripe dashboard
SENDGRID_API_KEY
SENDGRID_FROM_EMAIL
APP_URL                  # http://localhost:5173 for local dev
```

**`frontend/.env`**
```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_STRIPE_PUBLISHABLE_KEY
```

---

### Setup Checklist

- [] [] Create Supabase project → run `backend/migrations/001_initial.sql` in SQL Editor
- [DONE*] Fill in all keys in `backend/.env` and `frontend/.env`
- [ ] Create a Stripe Product ($5/year recurring) → paste Price ID in `backend/.env`
- [DONE*] Create a SendGrid API key and set a verified sender email
- [DONE*] For local Stripe webhook testing: `stripe listen --forward-to localhost:8000/api/webhooks/stripe`
