---
name: naverpay-point-missions
description: Reviewed Playwright automation for NaverPay point-earning missions. Use when users want to discover click-event missions, review a JSON snapshot, keep the first login manual, and then rerun missions headless with the saved session.
---

# NaverPay Point Missions

## Overview

Run repetitive NaverPay mission flows safely with manual login retained.
Use provided scripts to discover mission buttons first, then execute actions with popup-claim and waiting steps.
When `--headless true` is used without a saved session, the same `--state-dir` briefly opens a visible browser for the first manual login and then resumes headless.
Mission collection is fixed to click-event mission list page:
`https://point.pay.naver.com/pc/mission-detail?dataType=placement&pageKey=benefit_group_pp&rankType=RANDOM_DAILY&sortCompletedAdToLast=true&mssCode=pp`.

Why this skill is different:

- reviewed-by-default flow instead of immediate blind execution
- first login stays manual, then the saved session can be reused headlessly
- completed-store tracking reduces repeat clicks across runs
- works as a repo-backed skill for Codex, Claude Code, Gemini CLI, and related runtimes

## Workflow

1. Confirm prerequisites in `references/prerequisites.md`.
2. Discover mission actions and save a reviewed snapshot:

```bash
node scripts/discover_missions.mjs \
  --state-dir ./.state/naverpay-profile \
  --out /tmp/naverpay-missions.json \
  --headless true
```

If there is no saved session for that `--state-dir`, a visible browser opens once so you can complete the first login manually.

3. Review discovered missions in the JSON file and remove lines that should not be automated.
4. Run mission execution from the reviewed JSON:

```bash
node scripts/run_missions.mjs \
  --state-dir ./.state/naverpay-profile \
  --missions /tmp/naverpay-missions.json \
  --headless true \
  --default-wait-seconds 7 \
  --min-wait-seconds 3 \
  --max 10
```

5. Verify earned points on the NaverPay page after the run.

Advanced mode:

```bash
node scripts/run_missions.mjs \
  --state-dir ./.state/naverpay-profile \
  --live-discovery true \
  --headless true \
  --max 10
```

## Runtime Rules

- Keep login manual. Do not script credential entry.
- Reuse the same `--state-dir` so the saved session can be reused across runs.
- If `--headless true` is used without a saved session, open a visible browser once for manual login, then resume headless with the same `--state-dir`.
- Default to reviewed execution. `run_missions.mjs` requires `--missions <path>` unless `--live-discovery true` is explicitly provided.
- Use mission-specific dwell time from discovered JSON (`waitSeconds`) and enforce a minimum wait (`--min-wait-seconds`, default 3).
- Follow mission popup flow: click mission link -> click popup `포인트 받기` first, then fallback to `받기/적립`.
- Collect and execute only from click-event mission list page (`mssCode=pp`).
- Skip campaigns that were already completed in previous runs using completed-store tracking.
- Re-run discovery if UI labels or layout change.
- Stop and return control to the user if CAPTCHA, additional consent, or unexpected popups appear.

## Scripts

- `scripts/discover_missions.mjs`: Open NaverPay main page, bootstrap visible login only when the session is missing, extract clickable mission candidates, save JSON.
- `scripts/run_missions.mjs`: Match discovered/current actions, bootstrap visible login only when needed, click mission links, click popup claim (`포인트 받기` first), wait dwell time after moving, and continue sequentially.
- `scripts/naverpay_helpers.mjs`: Shared utilities for login bootstrap, action discovery, matching, and click execution.

### Completed-Store Options

- `--completed-store <path>`: Persist completed campaign keys (default: `<state-dir>/completed-campaigns.json`).
- `--ignore-completed true`: Ignore completed store and retry all campaigns in current run.

## Troubleshooting

- If no actions are discovered, scroll/load page manually in the opened browser and re-run discovery.
- If login timeout occurs, increase `--login-timeout-sec`. If you started with `--headless true`, finish login in the temporary visible browser window first.
- If `run_missions` refuses to start, supply a reviewed snapshot with `--missions <path>` or explicitly opt into `--live-discovery true`.
- If wrong button is clicked, reduce `--max`, edit `--missions` list, and re-run.
- If mission card text changed, run discovery again to refresh labels/hrefs/card summaries.
