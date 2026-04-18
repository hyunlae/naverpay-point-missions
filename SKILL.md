---
name: naverpay-point-missions
description: Execute NaverPay point-earning missions from https://point.pay.naver.com/pc/main with Playwright-based semi-automation. Use when users ask to discover mission buttons, click mission links, apply mission-specific dwell time (typically 3 seconds or more), and return to claim points while keeping login and verification manual.
---

# NaverPay Point Missions

## Overview

Run repetitive NaverPay mission flows safely with manual login retained.
Use provided scripts to discover mission buttons first, then execute actions with popup-claim and waiting steps.
Mission collection is fixed to click-event mission list page:
`https://point.pay.naver.com/pc/mission-detail?dataType=placement&pageKey=benefit_group_pp&rankType=RANDOM_DAILY&sortCompletedAdToLast=true&mssCode=pp`.

## Workflow

1. Confirm prerequisites in `references/prerequisites.md`.
2. Discover mission actions and save a reviewed snapshot:

```bash
node scripts/discover_missions.mjs \
  --state-dir ./.state/naverpay-profile \
  --out /tmp/naverpay-missions.json
```

3. Review discovered missions in the JSON file and remove lines that should not be automated.
4. Run mission execution from the reviewed JSON:

```bash
node scripts/run_missions.mjs \
  --state-dir ./.state/naverpay-profile \
  --missions /tmp/naverpay-missions.json \
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
- Keep browser headful by default so login, CAPTCHA, and mission completion can be verified.
- Default to reviewed execution. `run_missions.mjs` requires `--missions <path>` unless `--live-discovery true` is explicitly provided.
- Use mission-specific dwell time from discovered JSON (`waitSeconds`) and enforce a minimum wait (`--min-wait-seconds`, default 3).
- Follow mission popup flow: click mission link -> click popup `포인트 받기` first, then fallback to `받기/적립`.
- Collect and execute only from click-event mission list page (`mssCode=pp`).
- Skip campaigns that were already completed in previous runs using completed-store tracking.
- Re-run discovery if UI labels or layout change.
- Stop and return control to the user if CAPTCHA, additional consent, or unexpected popups appear.

## Scripts

- `scripts/discover_missions.mjs`: Open NaverPay main page, wait for login completion, extract clickable mission candidates, save JSON.
- `scripts/run_missions.mjs`: Match discovered/current actions, click mission links, click popup claim (`포인트 받기` first), wait dwell time after moving, and continue sequentially.
- `scripts/naverpay_helpers.mjs`: Shared utilities for login wait, action discovery, matching, and click execution.

### Completed-Store Options

- `--completed-store <path>`: Persist completed campaign keys (default: `<state-dir>/completed-campaigns.json`).
- `--ignore-completed true`: Ignore completed store and retry all campaigns in current run.

## Troubleshooting

- If no actions are discovered, scroll/load page manually in the opened browser and re-run discovery.
- If login timeout occurs, increase `--login-timeout-sec`.
- If `run_missions` refuses to start, supply a reviewed snapshot with `--missions <path>` or explicitly opt into `--live-discovery true`.
- If wrong button is clicked, reduce `--max`, edit `--missions` list, and re-run.
- If mission card text changed, run discovery again to refresh labels/hrefs/card summaries.
