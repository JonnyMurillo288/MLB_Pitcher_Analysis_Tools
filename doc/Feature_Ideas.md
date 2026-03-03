# Feature Ideas — Pitcher Trend Analyzer

A brainstorm of high-value additions across insight quality, usability, personalization, alerts, visual clarity, and sharing. The tool's goal is to surface real statistical trends and analysis — not to give fantasy advice.

Status: ✅ Done · 🔧 Partial · ❌ Not yet

---

## 1. Automated Trend Signals

### Signal badges ✅
- **↑ / ↓ arrows** — rolling stat meaningfully better or worse than season avg · Implemented in LeagueTable, TableView, and OutcomeStats
- **⚡ Multi-stat breakout** — velocity, whiff%, and K/9 all trending positive simultaneously · `compute_signals()` in backend, displayed in all three tabs
- **⚠ Divergence flag** — velocity declining while walk rate is rising · Same as above
- **🔄 Pitch mix shift** — usage of any pitch type changed >10pp in last 30 days · Same as above

### Statistical significance indicator ❌
Rather than just showing the raw delta, show whether the rolling-window shift is meaningfully different from the season baseline — e.g., using a simple z-score or confidence interval. "Up 0.8 mph (unusual)" instead of "↑ 0.8 mph".

### Fatigue / workload flag ❌
- Rolling velocity relative to April–May baseline, especially late season
- Innings pace vs. prior seasons on record — a quantified workload signal

---

## 2. Additional Statcast Metrics

All computed from existing Statcast columns — no new data sources needed.

- **Hard-hit rate (HHR%)** ✅ — balls hit ≥95 mph / BIP. More predictive than mean exit velo
- **Barrel rate** ✅ — barrels per PA. Strongest single-outcome indicator
- **First-pitch strike %** ✅ — pitchers who attack early stay ahead in counts
- **Zone rate (Z%)** ✅ — % of pitches in the strike zone. Low Z% + high BB/9 = control regression risk
- **In-zone whiff%** ✅ — pure swing-through stuff; driven by spin and deception
- **Out-of-zone whiff%** ✅ — chase-inducing quality; driven by movement and tunneling
- **2-strike whiff%** ✅ — pure strikeout stuff
- **Release point consistency** ✅ — SD of release_pos_x/Z; inconsistency often precedes velocity loss or injury
- **0-0 attack rate / ahead-behind K–BB differential** ❌ — count-state splits not yet surfaced

---

## 3. Pitch-Level Visual Tools

### Pitch mix evolution chart ✅
Stacked area chart showing pitch type usage % game-by-game across the season. Shows when a pitcher introduces or abandons a pitch. Implemented in PitchMetrics tab.

### Break plot (movement scatter) ✅
Season-average pfx_x (horizontal) vs pfx_z (induced vertical) per pitch type. Marker size scales with pitch count; hover shows velocity. Implemented in PitchMetrics tab.

### Velocity trend by pitch type ✅
Separate time-series lines per pitch type already exist in the PitchMetrics time-series section.

### Zone heatmap over time ❌ (NOT YET)
Rolling pitch location density map — spot command leaking before it shows up in walk rate. Requires `plate_x` / `plate_z` binning + contour or heatmap Plotly trace.

### Tunneling / sequencing matrix ❌ (NOT YET)
A grid showing pitch-type transition frequencies (what follows what). Pitchers with better tunneling tend to outperform their raw stuff metrics.

---

## 4. Comparison Tools

### Head-to-head pitcher comparison ❌
Select two pitchers and display their stats side-by-side in the same table format as the Table View. Same season, same rolling window, direct column-by-column comparison.

### Career context percentiles ❌
Show where a current rolling-window stat ranks relative to all games on record for that pitcher. "Current velocity is at the 12th percentile of all recorded starts" is more informative than the raw number.

### Season-over-season overlay ❌
In time-series charts, overlay the same stat from the prior season as a dashed reference line. Distinguishes seasonal patterns from genuine changes.

### Team staff view ✅
Filter the league table by team — already implemented in LeagueTable.

---

## 5. Game Log View ✅

Per-game table: Date · IP · K · BB · HR · Velo · Whiff% · Exit Velo. Implemented as a standalone tab.

---

## 6. Rolling Window Improvements

### Rolling window presets ✅
7d / 14d / 30d / 60d quick-select buttons already in TableView.

### "Last N starts" mode ❌
Instead of a calendar-day rolling window, compute the period by number of starts rather than days. More meaningful for starters whose start frequency varies.

### Split view: first half vs. second half ❌
Fixed split at July 1 (or the All-Star break) — a standard reference point for evaluating mid-season changes.

---

## 7. League Table Upgrades

### Delta magnitude coloring ✅
Big changes rendered with `font-semibold` in addition to color, giving magnitude signal at a glance.

### Pinned / watched pitchers float to top ✅
Watched pitchers (stars) already sort to the top of the league table regardless of sort order.

### Add from league table ✅
One-click star icon in each row already lets users add a pitcher to their watchlist without navigating away.

### CSV export ✅
League table already has a CSV download button.

### Sparklines in cells ❌
Tiny in-cell trend lines for velocity or K/9 directly in the column. Much faster to scan than delta numbers alone.

### Percentile column ❌
For any selected stat, show where each pitcher ranks in the current dataset as a percentile bar (like Baseball Savant's statcast leaderboards).

---

## 8. Regression Tab Upgrades (NOT YET)

### Predictor collinearity warnings ❌
Before running, flag pairs of predictors with |r| > 0.7 so the user knows to expect VIF issues.

### Auto-feature selection mode ❌
Forward stepwise selection from all available features, returning the best subset.

### Rolling regression ❌
Run the same model on a rolling 30-game window and plot how coefficients change over time. Shows if a relationship (e.g., extension → K/9) is stable or shifting.

### Residual inspector ❌
Click on an outlier in the residuals vs. fitted plot and jump to the corresponding game date in the game log.

---

## 9. Watchlist / Saved Pitcher Enhancements

### Add from league table ✅
Already implemented (see Section 7).

### Custom notes per pitcher ❌
A small free-text annotation field — e.g., "came back from elbow inflammation May 15, monitoring velo since."

### Tags and groups ❌
Label saved pitchers with custom tags (e.g., "monitoring", "healthy", "IL watch"). Filter the league table by tag.

### Watchlist trend summary card ❌
At the top of the dashboard, a compact summary of all watched pitchers showing just the 2–3 most notable changes from the last week.

---

## 10. Alert & Notification Upgrades

### Weekly email digest ✅
Pro users can enable Monday 9am digest of saved pitchers via APScheduler + SendGrid.

### Per-pitcher custom thresholds ❌
Set alerts specific to a pitcher and stat: "notify me if Cole's velocity drops >1 mph vs. his 30-day average."

### Significant-change-only digest ❌
Send only pitchers where something meaningfully changed that week, not the full watchlist.

### Immediate post-game alerts ❌
Compute rolling metrics after each game day and alert if a threshold is crossed — doesn't wait for Monday.

---

## 11. Export & Sharing

### CSV export — League Table ✅
Already implemented in LeagueTable tab.

### CSV export — Table View ✅
Just added: "↓ CSV" button exports visible stats at the current rolling window.

### Pitcher report card (PNG/PDF) ❌
A one-page formatted export for a single pitcher: rolling trend table + velocity chart + pitch mix evolution + key signals. Useful for sharing in group chats or league forums.

### Shareable watchlist URL ❌
A read-only public link to a watchlist view — pitchers, selected stats, rolling window — for sharing analysis with others.

---

## 12. New Analysis Ideas

### K% − BB% composite score
`(K% − BB%)` as a single column in the league table and table view. A well-known proxy for overall pitcher quality that combines strikeout and control profiles into one number.

### xFIP vs FIP divergence
Surface the gap between FIP (uses actual HR allowed) and xFIP (uses expected HR based on FB%). A large FIP − xFIP gap predicts regression — high if HR/FB was low, low if HR/FB was high.

### Pitch efficiency rating
`(K + IP_outs) / pitches` style composite. Pitchers who do more with fewer pitches are lower injury risk and more consistent deep into starts.

### Platoon split detection
Using `stand` (batter handedness) from Statcast, compute K%, BB%, whiff%, and exit velo splits by LHB vs RHB. A large platoon gap predicts roster usage (more reliever-like, vulnerable to switches).

### Arm angle inference
Estimated arm angle from pfx_x / pfx_z ratio patterns. Arm slot correlates strongly with which hitter types a pitcher suppresses (high arm slots suppress same-side batters; low arm slots cross-platoon).

### Release tunnel score
At 55 feet from home plate, how similar do back-to-back pitches of different types look? Pitchers with tight tunnels outperform their raw stuff metrics because hitters can't distinguish pitch types early.

### Count-state performance matrix
A 3×3 grid showing K%, BB%, and exit velo across pitch count states (0-0, ahead, behind, two-strike). Reveals whether a pitcher's arsenal holds up when hitters know a strike is coming.

### Historical comp finder
Find the most similar pitcher season in the database based on a weighted distance across key metrics (velo, whiff%, K/9, BB/9, GB%). Returns the top 3 historical comps with their end-of-season outcomes.

### Batted ball clustering
Use k-means on exit velo + launch angle to categorize each game start as "soft contact day", "balanced", or "hard contact day". Track how often a pitcher can induce soft contact across the season.

### Leverage-adjusted metrics
Filter outcomes to high-leverage situations only (runners on base, late innings). Shows how a pitcher performs when it matters most — useful for evaluating closers and setup men.
