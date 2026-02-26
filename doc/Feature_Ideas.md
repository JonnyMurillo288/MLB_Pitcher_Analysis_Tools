# Feature Ideas — Pitcher Trend Analyzer

A brainstorm of high-value additions across insight quality, usability, personalization, alerts, visual clarity, and sharing. The tool's goal is to surface real statistical trends and analysis — not to give fantasy advice.

---

## 1. Automated Trend Signals

The biggest gap is that users have to notice trends manually. Automated signals would surface patterns without requiring a full table scan.

### Signal badges in the league table and pitcher header
- **↑ / ↓ arrows** — rolling stat meaningfully better or worse than season avg (>1σ change)
- **⚡ Multi-stat breakout** — velocity, whiff%, and K/9 all trending positive simultaneously
- **⚠ Divergence flag** — velocity declining while walk rate is rising (common mechanical issue)
- **🔄 Pitch mix shift** — usage of any pitch type changed >10pp in last 30 days (often signals a new weapon or injury compensation)

### Statistical significance indicator
Rather than just showing the raw delta, show whether the rolling-window shift is meaningfully different from the season baseline — e.g., using a simple z-score or confidence interval. Turns "up 0.8 mph" into "up 0.8 mph (unusual)".

### Fatigue / workload flag
- Rolling velocity relative to April–May baseline, especially late season
- Innings pace vs. prior seasons on record — a quantified workload signal

---

## 2. Additional Statcast Metrics

These are all computable from existing Statcast columns already being pulled — no new data sources needed.

### Hard-hit rate (HHR%)
Balls hit ≥95 mph exit velocity / total balls in play. More predictive of future run prevention than mean exit velo.

### Barrel rate allowed
Barrels per PA — the strongest single-outcome indicator. A barrel is defined by Statcast as exit velo ≥ 98 mph at launch angles 26–30°, expanding at higher velocities.

### First-pitch strike %
% of PA where pitch 1 is a called or swinging strike. Pitchers who attack early stay ahead in counts. Computable from `description` + `balls/strikes` columns.

### Zone rate (Z%)
% of pitches thrown in the strike zone (zones 1–9). Low Z% + high walk rate = control regression risk; high Z% + high exit velo = hittable pitcher.

### whiff% by zone
Split into:
- **In-zone whiff%** — pure swing-through stuff, driven by spin and deception
- **Out-of-zone whiff%** — chase-inducing quality, driven by movement and tunneling

Separating these distinguishes elite spin-rate starters from contact managers.

### Release point consistency
Standard deviation of `release_pos_x` and `release_pos_z` over the rolling window. Inconsistent release point often precedes velocity loss or injury. Computable from existing columns.

### Count-specific splits
- 2-strike whiff% — pure strikeout stuff
- 0-0 (first pitch) attack rate
- Ahead-in-count vs. behind-in-count K–BB differential

---

## 3. Pitch-Level Visual Tools (NOT YET)

### Pitch mix evolution chart
A stacked area or 100% stacked bar chart showing pitch type usage % by month across the season. Shows when a pitcher introduces or abandons a pitch.

### Break plot (movement scatter)
For a selected date range, plot each pitch as a point:
- x = horizontal break (pfx_x), y = induced vertical break (pfx_z)
- Color = pitch type, size = velocity
- Reveals how pitch shape clusters and how tight/wide the groupings are

### Zone heatmap over time
Rolling pitch location density map — spot command leaking before it shows up in walk rate.

### Velocity trend by pitch type
Separate time-series lines for each pitch type's velocity, not just overall. A fastball velo drop that's masked by more off-speed usage is easy to miss without this view.

### Tunneling / sequencing matrix
A grid showing pitch-type transition frequencies (what follows what). Pitchers with better tunneling tend to outperform their raw stuff metrics — this makes it visible.

---

## 4. Comparison Tools

### Head-to-head pitcher comparison
Select two pitchers and display their stats side-by-side in the same table format as the Table View. Same season, same rolling window, direct column-by-column comparison.

### Career context percentiles
Show where a current rolling-window stat ranks relative to all games on record for that pitcher. "Current velocity is at the 12th percentile of all recorded starts" is more informative than the raw number.

### Season-over-season overlay
In time-series charts, overlay the same stat from the prior season as a dashed reference line. Distinguishes seasonal patterns from genuine changes.

### Team staff view
Filter the league table by team — see all of a team's starters sorted by any stat.

---

## 5. Game Log View

A raw per-game table for a single pitcher showing:

| Date | Opp | IP | K | BB | HR | Velo | Whiff% | Exit Velo | K/9 |
|---|---|---|---|---|---|---|---|---|---|

Gives the granular record that the time-series charts summarize. Filterable by date range. Sortable. This is the thing analysts want when investigating a specific outing.

---

## 6. Rolling Window Improvements

### "Last N starts" mode
Instead of a calendar-day rolling window, compute the period by number of starts rather than days. "Last 3 starts" is more meaningful for starters than "last 21 days" since start frequency varies.

### Rolling window slider
A visual 7d → 14d → 30d → 60d slider for quick exploration of different time horizons — faster than typing.

### Split view: first half vs. second half
A fixed split at July 1 (or the All-Star break) — a standard reference point for evaluating mid-season changes.

---

## 7. League Table Upgrades

### Sparklines in cells
Tiny in-cell trend lines for velocity or K/9 directly in the table column — much faster to scan than delta numbers alone.

### Delta magnitude coloring
Currently delta is green/red by direction only. Add intensity: dark green = large significant change, light green = small change. Conveys magnitude at a glance.

### Pinned / watched pitchers
Watched pitchers float to the top of the league table regardless of sort order, with a visual separator below them.

### Percentile column
For any selected stat, show where each pitcher ranks in the current dataset as a percentile bar (like Baseball Savant's statcast leaderboards).

---

## 8. Regression Tab Upgrades (NOT YET)

### Predictor collinearity warnings
Before running, flag pairs of predictors with |r| > 0.7 so the user knows to expect VIF issues.

### Auto-feature selection mode
Offer a mode where the model runs forward stepwise selection from all available features and returns the best subset — useful for exploration.

### Rolling regression
Instead of a single regression over the season, run the same model on a rolling 30-game window and plot how the coefficients change over time. Shows if a relationship (e.g., extension → K/9) is stable or shifting.

### Residual inspector
Click on an outlier point in the residuals vs. fitted plot and jump to the corresponding game date in the game log.

---

## 9. Watchlist / Saved Pitcher Enhancements

### Custom notes per pitcher
A small free-text annotation field — e.g., "came back from elbow inflammation May 15, monitoring velo since."

### Tags and groups
Label saved pitchers with custom tags (e.g., "monitoring", "healthy", "IL watch"). Filter the league table by tag.

### Add from league table
One-click star/watch icon in each league table row — avoids needing to look up the pitcher separately.

### Watchlist trend summary card
At the top of the dashboard, a compact summary of all watched pitchers showing just the 2–3 most notable changes from the last week.

---

## 10. Alert & Notification Upgrades

### Per-pitcher custom thresholds
Set alerts specific to a pitcher and stat: "notify me if Cole's velocity drops >1 mph vs. his 30-day average" rather than a fixed weekly digest.

### Significant-change-only digest
Instead of always sending all watched pitchers, send only the pitchers where something meaningfully changed that week.

### Immediate post-game alerts
Compute rolling metrics after each game day and alert if a threshold is crossed — doesn't wait for Monday.

---

## 11. Export & Sharing

### CSV export
Download the current league table view (selected stats, current sort order) as a CSV. The data is already computed server-side.

### Pitcher report card (PNG/PDF)
A one-page formatted export for a single pitcher: rolling trend table + velocity chart + pitch mix evolution + key signals. Useful for sharing in group chats or league forums.

### Shareable watchlist URL
A read-only public link to a watchlist view — pitchers, selected stats, rolling window — for sharing analysis with others.
