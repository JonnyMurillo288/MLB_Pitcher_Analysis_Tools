# Quickstart Guide

---

## Prerequisites

| Requirement | Minimum Version | Check |
|-------------|-----------------|-------|
| Python | 3.10 | `python --version` |
| Node.js | 18.0 | `node --version` |
| npm | 8.0 | `npm --version` |

> **Node version note:** Node 18+ is required for the frontend build tools (Vite 5, TypeScript 5). If your system Node is older, use [nvm](https://github.com/nvm-sh/nvm): `nvm use 20`.

---

## Option A — Streamlit (quickest)

No Node.js required. Run the prototype directly.

```bash
cd pitching_against_average

pip install streamlit pybaseball pandas numpy plotly statsmodels scipy
streamlit run pitcher_trend_analyzer.py
```

Opens at `http://localhost:8501`.

---

## Option B — Full Stack (FastAPI + React)

Two terminals are required.

### Step 1 — Backend

```bash
cd pitching_against_average/backend

pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Verify it's running:

```bash
curl http://localhost:8000/api/pitchers
# Should return a JSON array of pitcher names
```

### Step 2 — Frontend

```bash
cd pitching_against_average/frontend

npm install          # first time only
npm run dev
```

Opens at `http://localhost:5173`. The Vite dev server proxies all `/api` requests to the backend on port 8000 — no CORS configuration needed.

---

## First Use Walkthrough

1. **Select a pitcher** — Type a name in the filter box (e.g. "Skubal") and click it in the list.

2. **Select a season** — The Data Season defaults to the current year. Change it if you want to analyze a past season.

3. **Select a game date** — The dropdown shows every date the pitcher threw at least one pitch, with the pitch count in parentheses. The most recent game is selected by default.

4. **Configure the trend window**
   - *Rolling window* — compare against the N days before the target game (default 20 days)
   - *Full season* — compare against the entire Trend Season. Set Trend Season independently if you want a prior-year baseline.

5. **Filter pitch types and metrics** — All are selected by default. Uncheck any you don't need.

6. **Click Run Analysis** — Results load into three tabs.

---

## Tab Overview

### Tab 1 — Pitch Metrics

- **KPI row** — total pitches today, trend average, pitch types used, batters faced
- **Pitch usage pies** — today vs. trend
- **Metric cards** — grouped by metric, one card per pitch type, showing today's value, trend average, and delta
- **Time-series charts** — one per selected metric; red dashed line marks the target date, dotted lines show trend averages per pitch type
- **Delta bar chart** — all metric × pitch-type combinations sorted by magnitude
- **Velocity vs Spin scatter** — coloured by pitch type
- **Raw data table** — expandable, shows all comparison rows

### Tab 2 — Outcome Stats

- **KPI cards** — Exit velo, GB%, FB%, BB/9, K/9, Whiff%, SwStr%, Chase% — today vs. trend
- **Pitch usage pies** — same as Tab 1 for context
- **Trend lines** — one chart per outcome, showing per-game values over the trend window with the target date marked

### Tab 3 — Regression

1. Select the **dependent variable (Y)**
2. Select one or more **predictors (X)**
3. For each predictor, set the lag type (None / Point lag N / Rolling mean N)
4. Click **Run Regression**

Results persist until you click Run Regression again — changing the variable selection shows a yellow stale-results warning but does not reset the displayed output.

---

## Common Issues

### "No pitchers loading"

The backend needs network access to fetch FanGraphs data on first run. This call can take 10–20 seconds.

```bash
# Check backend logs in terminal 1 for errors
# Also verify the backend is reachable:
curl http://localhost:8000/api/pitchers
```

### "Game dates not populating after selecting a pitcher"

Statcast data for a full season can take 30–60 seconds to fetch the first time. Watch the backend terminal — you'll see the pybaseball download progress. Subsequent requests for the same pitcher/season are instant (cached for 1 hour).

### Frontend build fails

Make sure you are using Node 18+:

```bash
node --version   # must be v18 or higher
```

If using nvm:

```bash
nvm install 20
nvm use 20
npm run dev
```

### TypeScript errors when editing

Run the type check manually:

```bash
cd frontend
npx tsc --noEmit
```

### Backend import errors

Ensure all Python dependencies are installed in the same environment:

```bash
cd backend
pip install -r requirements.txt
```

---

## Production Build

To generate a static build of the frontend:

```bash
cd frontend
npm run build
# Output is in frontend/dist/
```

Serve the `dist/` directory with any static file server, or configure the FastAPI app to serve it directly by mounting `StaticFiles` in `main.py`.

---

## Environment Summary

```
pitching_against_average/
├── backend/   →  uvicorn main:app --reload --port 8000
└── frontend/  →  npm run dev  (port 5173, proxies /api to 8000)
```

Both services must be running simultaneously for the full-stack version to work.
