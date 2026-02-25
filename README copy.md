# Pitcher Trend Analyzer

A tool for comparing a pitcher's single-game performance against their longer-term statistical trend, powered by MLB Statcast data via pybaseball.

---

## What It Does

Given a pitcher and a specific game date, the app pulls pitch-level Statcast data and computes:

- **Pitch Metrics** — velocity, spin rate, extension, break, and release point, broken down by pitch type, compared against a configurable trend window
- **Outcome Stats** — exit velocity, GB%, FB%, BB/9, K/9, Whiff%, SwStr%, Chase%, again vs. trend
- **Regression Analysis** — build an OLS model from per-game features with configurable lags, full assumption tests, and diagnostic plots

---

## Versions

| Version | Stack | Use Case |
|---------|-------|----------|
| `pitcher_trend_analyzer.py` | Streamlit | Quick demos, local exploration |
| `backend/` + `frontend/` | FastAPI + React/TypeScript | Full-stack deployment, shareable UI |

Both versions consume the same underlying data and compute the same metrics. The Streamlit file is intentionally kept untouched.

---

## Project Structure

```
pitching_against_average/
├── pitcher_trend_analyzer.py      ← Streamlit prototype (do not modify)
│
├── backend/
│   ├── main.py                    ← FastAPI app, all API routes
│   ├── data.py                    ← pybaseball fetching, caching, trend building
│   ├── compute.py                 ← Pure computation: metrics, outcomes, OLS
│   ├── cache.py                   ← TTL in-memory cache
│   └── requirements.txt
│
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts             ← Proxies /api → localhost:8000
│   ├── tailwind.config.js
│   └── src/
│       ├── App.tsx                ← Top-level state, committed analysis trigger
│       ├── main.tsx               ← React + React Query entry point
│       ├── index.css              ← Tailwind + dark-mode globals
│       ├── types/index.ts         ← All TypeScript interfaces
│       ├── api/client.ts          ← Fetch wrappers for every endpoint
│       └── components/
│           ├── Sidebar.tsx        ← Pitcher search, controls, Run button
│           ├── ui/MetricCard.tsx  ← Reusable metric card with delta badge
│           └── tabs/
│               ├── PitchMetrics.tsx   ← Tab 1
│               ├── OutcomeStats.tsx   ← Tab 2
│               └── Regression.tsx    ← Tab 3
│
└── doc/
    ├── README.md                  ← This file
    └── QUICKSTART.md
```

---

## API Reference

### Meta

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/pitchers` | Qualified pitcher list (>100 IP or >70% GS) |
| GET | `/api/meta/metrics` | Available pitch metrics with labels and units |
| GET | `/api/meta/seasons` | Available data seasons |

### Pitcher Data

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/pitcher/{name}/id` | Resolve MLBAM ID from full name |
| GET | `/api/pitcher/{pid}/season/{year}/dates` | Game dates + pitch counts |
| GET | `/api/pitcher/{pid}/season/{year}/pitch-types` | Pitcher's arsenal for a season |

### Analysis

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/analysis/pitch-metrics` | Tab 1: comparison rows, time-series, KPIs |
| POST | `/api/analysis/outcomes` | Tab 2: outcome aggregates + per-game rows |
| POST | `/api/regression/features` | Available columns for regression |
| POST | `/api/regression/run` | OLS fit, diagnostics, plot data |

---

## Caching

The backend uses two TTL in-memory caches (no Redis required):

| Cache | TTL | Contents |
|-------|-----|----------|
| `PITCHER_CACHE` | 24 hours | Pitcher list, MLBAM ID lookups |
| `SEASON_CACHE` | 1 hour | Full Statcast season data per pitcher/year |

On first load for a pitcher/season pair, pybaseball fetches the full season. Subsequent requests for any date within that season are served from cache.

---

## Tech Stack

**Backend**
- Python 3.10+
- FastAPI + Uvicorn
- pybaseball (Statcast + FanGraphs)
- pandas, numpy, statsmodels, scipy

**Frontend**
- React 18 + TypeScript
- Vite
- Tailwind CSS (dark mode)
- @tanstack/react-query — server state management
- react-plotly.js — all charts (Plotly.js)
- @radix-ui/react-tabs — tab navigation

---

## Pitcher Eligibility

A pitcher appears in the dropdown if, in any season from 2022 onward, they had:
- At least **100 innings pitched**, OR
- At least **70% of appearances as starts** (and at least 5 games)

The list deduplicated by name, keeping the most recent qualifying season.

---

## Trend Window Options

| Type | Behavior |
|------|----------|
| Rolling N days | The N calendar days immediately preceding the target game date |
| Full season | All games in the selected trend season |

The trend season defaults to the current year and can be set independently of the data season, allowing cross-year comparisons.

---

## Regression Tab

The regression feature builds a per-game feature matrix from Statcast data. Available predictors include pitch metrics, outcome stats, and usage percentages. Each predictor can be configured independently:

| Lag Type | Effect |
|----------|--------|
| None | Raw value for each game |
| Point lag N | Value from N games ago (`shift(N)`) |
| Rolling mean N | N-game rolling average, lagged 1 game to avoid leakage |

Assumption tests reported:

| Test | What it checks |
|------|---------------|
| Shapiro-Wilk | Normality of residuals |
| Breusch-Pagan | Homoscedasticity |
| Durbin-Watson | Serial autocorrelation |
| VIF | Multicollinearity per predictor |
| ADF | Stationarity per variable |

Diagnostic plots: Residuals vs Fitted, Q-Q, Scale-Location, Cook's Distance, Residuals over Time, Correlation Heatmap.
