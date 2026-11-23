# Logbook: personal progress tracker

## What this is
A personal app for Vinícius to log his day and see his progress over time.
It's a rebuild of a working prototype (`prototype/index.html`, a single-file claude.ai artifact) as a real project.
Single user. Mostly used on an iPhone (added to the Home Screen), sometimes on a PC.

## Why it exists
Tracking progress makes goals more likely to be hit (Harkin et al., 2016).
Logging must stay fast: **under 5 minutes a day**. Every feature is judged against that.
If a change adds taps or typing to the daily log, it needs a strong reason.

## Non-negotiables
- **Under 5 minutes a day** to log. Prefill, suggest, and remember. Never ask twice.
- **Autosave.** No "Save" button. Show a small status line ("Saving…", "Saved").
- **Mobile-first.** Works well at 375px wide. Tap targets at least 44px.
- **Inputs at 16px font or larger.** Smaller makes iOS Safari zoom in on focus.
- **Brazilian formats.** Dates `dd/mm` and `dd/mm/yyyy`, 24h time, kg. Accept a comma
  decimal (`62,5`) in number fields and show decimals with a comma.
- **The data shape below stays stable.** Add fields; don't rename or remove them.
  Old records must still load.
- **Offline-first.** Logging must work with no signal (gym basement). Sync is a bonus.

## v1 scope (the prototype already does all of this; port it first, then improve)
- **Header:** date bar with prev/next day, and a ring showing how many of the 5 sections
  are logged today (gym, work, study, meals, journal).
- **Greeting:** "Good afternoon, Vini." plus one line: "3 of 5 logged · study and meals left."
- **Gym:** workout letter (Treino A–E or Rest), exercises with kg, sets, reps.
  - Under each exercise: last weight/sets/reps for that exercise (progressive overload).
  - If last time reps were 10 or more, suggest +2,5kg ("ready for 67,5kg").
  - **"Load last Treino A"** button: picking a letter offers to copy that workout's
    exercises from the last time he did it. One tap fills the whole session.
  - Exercise names autocomplete from history.
  - He trains low volume, 6–10 reps (e.g. 2x8).
- **Work:** sessions with minutes + what he worked on. Daily total.
  Quick-add chips (+30m, +1h, +1h30, +2h) plus a custom entry. "What" autocompletes from history.
- **Study:** sessions with minutes + topic (sales, languages, skills). Daily total.
  Quick-add chips (+15m, +30m, +1h). Topic autocompletes from history.
- **Meals:** simple text for breakfast, lunch, dinner, snacks + "hit protein" checkbox.
  No calories or macros.
- **Journal:** energy 1–5, mood 1–5, wins, notes.
- **Progress view:**
  - **Your goals, live:** 4 goals, each with a 6-week sparkline, % change vs the previous
    7 days, and a label (on track / rising / steady / slipping). Tap to expand the detail.
    Goals: train (target 4×/week), work (30h/week), study (5h/week), mood (average).
    Targets live in one `CONFIG` object.
  - **Stat chips:** train, protein days, mood, energy, logging streak.
  - **What the logbook noticed:** one plain-language insight at a time, "Show me another"
    to cycle (rules below).
  - Work/study hours last 7 days (bar chart), logged days last 28 (dot grid),
    lifts table (last, best, 4-week change), study time by topic (28 days).
  - **Backup:** export all data as JSON, import merges by `updatedAt` (newer wins).

## Data shape (one record per day, key = YYYY-MM-DD)
```json
{
  "date": "2026-11-23",
  "treino": "A",
  "gym": [{ "ex": "Bench press", "kg": "60", "sets": "2", "reps": "8" }],
  "work": [{ "min": "90", "what": "Missed-call automation outreach" }],
  "study": [{ "min": "30", "topic": "Sales" }],
  "meals": { "breakfast": "", "lunch": "", "dinner": "", "snacks": "" },
  "protein": true,
  "energy": 4, "mood": 4,
  "wins": "", "notes": "",
  "updatedAt": 1700000000000
}
```
Number fields are stored as the strings he typed (they may contain a comma).
Always parse with the shared `num()` helper (comma → dot), never bare `parseFloat`.

**"Logged" means real content**, not an empty row: gym = workout letter or a named exercise;
work/study = minutes above 0; meals = any text or protein ticked; journal = any rating or text.
Streaks and the completion ring use these rules.

## Insights ("What the logbook noticed")
Deterministic rules on his own data. No AI calls in v1. Each insight shows only when there's
enough data, and is tied to a goal. Current rules (last 42 days unless noted):
1. Mood on training days vs non-training days (at least 3 days each, gap ≥ 0,4).
2. Energy on protein days vs non-protein days (at least 3 each, gap ≥ 0,4).
3. Work hours last 7 days vs the 7 before (change ≥ 20%, previous week ≥ 2h).
4. Days since the last study session (3 or more), with the last topic.
5. Biggest kg gain on one exercise (first vs latest entry).
6. Strongest work weekday over 28 days (needs 6+ work days).
7. Logging streak of 5+ days, compared with his record.
Tone: short, direct, specific numbers, a little encouraging. Never preachy.
Add rules here when you add them in code.

## Design direction (updated 23/11/2026)
Reference: brez-challenge.vercel.app (deep navy, heavy tight grotesk, blue accent, green "done").
The earlier serif + monospace look read as "vibe coded"; don't bring it back.
- **Themes:** dark by default (navy `#060B1E`). Header button cycles Auto (follows phone) → Dark → Light,
  saved in `localStorage["logbook-theme"]`, applied by an inline script in `<head>` before paint.
- **Type:** headings Inter Tight 800–900 with tight tracking (≈ -0.035em); body Inter;
  labels are small uppercase Inter 700 with wide tracking (0.12–0.16em). Numbers use tabular figures. No mono, no serif.
- **Cards:** 2px blue line on top, a numbered kicker ("01 · Train") above a heavy title.
  When a section counts as logged, the card turns green: green top line and border, "· Done" on the kicker, check circle.
- **Color means something:** blue = primary / the logbook talking (buttons, insights, load-last);
  green = done / good / rising; amber = slipping / attention. Nothing else.
- Calm and sparse. One insight at a time, not a wall of stats.

## Stack (decided 23/11/2026)
- **PWA**, not a native app (single user). Can be wrapped with Capacitor later if he wants the App Store.
- **Sync backend: Supabase** (free tier). Sign-in with a typed 6-digit email code, not a magic link:
  a Home Screen PWA on iOS has separate storage from Safari, so a link would sign in Safari, not the app.
- **Code lives on GitHub**; hosting TBD (GitHub Pages or Cloudflare Pages, both free).

### Original stack notes
- **Milestone 1–2:** plain HTML/CSS/JS, no build step, no framework. Easy for him to read.
  Split into `index.html`, `styles.css`, `app.js` (and small modules if `app.js` passes ~800 lines).
  Make it a **PWA**: `manifest.json` + icons + a service worker that caches the app, so it
  installs to the iPhone Home Screen and opens offline.
  Storage: `localStorage` is fine to start (same key as the prototype: `logbook-fallback`).
  Move to IndexedDB only if data size becomes a problem.
- **Milestone 3 (sync):** needs a backend. **Ask before choosing any hosting or database
  service**, even free tiers. Lay out 2–3 options with cost, limits, and setup effort
  (e.g. Supabase free tier, Firebase free tier, Cloudflare Pages + D1). Keep the app working
  offline; sync merges by `updatedAt` per day.
- The prototype also syncs through `window.claude.use("db")`. That only exists inside
  claude.ai artifacts. Keep that code path out of the standalone app.

## Status
- Milestone 1 (port) and 2 (PWA: manifest, icons, `sw.js`, offline, 14-day backup reminder) done 23/11/2026.
  Bump `VERSION` in `sw.js` whenever app files change, or phones keep the old cached copy.
- Next: deploy, then Milestone 3 (Supabase sync).

## Build order
1. **Port** the prototype into the file structure above. Same features, same look,
   same data. Done when old data loads untouched. Note: the prototype's data lives inside claude.ai,
   a different origin, so it can't be read directly. He moves it with Export backup (prototype) → Import backup (new app).
2. **PWA + safety:** manifest, icons, service worker, offline test, backup reminder if no
   export in 14 days.
3. **Sync** between iPhone and PC (after the stack decision above).
4. **Later ideas** (one at a time, each must respect the 5-minute rule):
   editable targets in a settings screen, sleep hours, body weight, screen time,
   a work timer, weekly review prompt (Sunday), CSV export, reminders,
   AI-written weekly summary using his logs.

## Project layout (target)
```
/index.html  /styles.css  /app.js  /manifest.json  /sw.js  /icons/
/prototype/index.html      ← reference only, don't edit
/CLAUDE.md
```

## Working rules
- Explain steps clearly when something technical comes up (terminal commands, deploying,
  git). He's still learning. Say what a command does before running it.
- Small, working steps. After each change, test at 375px wide (phone) and on desktop.
- Before saying something is done: open it in a browser, try the changed flow, check the
  console for errors, and confirm existing data still loads.
- Don't add libraries without a reason. If you do, say why in one line.
- Ask before choosing a hosting/database service that costs money (or locks data in).
- Keep this file up to date when scope, rules, or insights change.
