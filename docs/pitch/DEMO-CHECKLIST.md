# Demo checklist

## 30 minutes before

1. Needs `uv`, Node.js 20+ and npm on PATH. First run needs internet (installs packages and downloads the COMPAS file).
2. From the repo root run:

   ```powershell
   .\run-dev.ps1
   ```

   It installs, migrates, seeds demo data and starts the API (port 8000), the audit worker and the web app (port 3000). Logs go to `.run\*.log`. Stop with Ctrl+C. Useful switches: `-SkipSeed` (keep existing data), `-Offline` (use the synthetic HireLens set instead of downloading COMPAS), `-Production` (build and start instead of the dev server).
3. Open http://localhost:3000.
4. Log in. Password for all: `Demo-Pass-2026`.

   | Login | Role | Use for |
   |---|---|---|
   | `admin@hirelens.example` | Tenant admin | Setup, reassigning owners |
   | `founder@hirelens.example` | Risk owner (Asha Rao, ML lead) | Owns the systems, submits fixes |
   | `advisor@hirelens.example` | Compliance officer (Vikram Shah) | Reviews and resolves |

   Only mention `priya.nair@`, `rohan.mehta@` or `ananya.iyer@hirelens.example` if they appear in the app. They were not present in this branch.
5. Use two browser windows (or one normal and one private) so you can switch between founder and advisor without logging out.
6. Check AI Systems shows both systems: COMPAS (real data) and FinSum (sample). If a system is missing, use its Load button on the AI Systems page.

## Rehearse once (do not skip)

- Run one COMPAS audit with model `v1` to completion. Note the run time and the numbers on the Bias tab. This document does not quote numbers because they were not captured before writing. Write them on a card.
- Run `v2` with the same settings. Open Reports and use Compare.
- Note that a fresh seed has no findings until an audit has run. Do the rehearsal on a throw-away database or accept that it leaves findings in place.
- Check the findings step: submit as founder, resolve as advisor.

## What to open first

1. Overview
2. AI Systems, COMPAS
3. Audits, New audit
4. Keep the Reports tab ready in a second tab.

## If something fails

| Problem | Fallback |
|---|---|
| COMPAS download fails (no internet) | The seed falls back to the synthetic HireLens set. Start with `.\run-dev.ps1 -Offline` and say the data is synthetic. Or download `compas-scores-two-years.csv` from ProPublica's GitHub repo and run the seed with `--compas-file`. |
| Audit run is slow or stuck on "queued" | The worker is not running. Check `.run\worker.log`. Restart `run-dev.ps1`. Meanwhile show a previously completed run from the Audits list. |
| Login fails | Re-run the seed: `cd backend; uv run python manage.py seed_ai_demo --password "Demo-Pass-2026"` |
| A page shows an error | Refresh once. Check `.run\api.log`. Move on and describe the page from `PITCH.md`. |
| Cloud Security or Packet Traversal is empty | Use the page's demo-data button (admin only). If it is disabled, skip and say these two pages are simulations. |
| Port in use | Run with other ports, for example `.\run-dev.ps1 -ApiPort 8100 -WebPort 3100`. |
| Everything is down | Open `PITCH.md` and talk through Part 6. Judges respond well to a clear story and honest limits. |

## Say out loud, early

- "COMPAS is real. FinSum and HireLens are synthetic and labelled."
- "Cloud Security is a simulation. The network tracer runs on a sample network."
- "The thresholds are screening limits, not legal tests."
