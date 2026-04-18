# Prerequisites

## Required

- A valid Naver account that can access `https://point.pay.naver.com/pc/main`.
- Access to click-event mission list page:
  `https://point.pay.naver.com/pc/mission-detail?dataType=placement&pageKey=benefit_group_pp&rankType=RANDOM_DAILY&sortCompletedAdToLast=true&mssCode=pp`.
- Manual login capability (including OTP/CAPTCHA handling in browser).
- Node.js 18+.
- Playwright package and browser binaries:

```bash
npm install -D playwright
npx playwright install chromium
```

- Stable network and pop-up allowance in Chromium.

## Recommended

- Register the skill with `node scripts/install_skill.mjs --target <ai> --mode link` so the cloned repo stays the runtime root.
- Reuse one persistent profile via `--state-dir` so frequent re-login is avoided.
- Start with `--dry-run true` and `--max 2` to validate selectors before full run.
- Keep mission batch size small and verify point history after each batch.
- Treat reviewed JSON as the default execution input. Live discovery should be an explicit decision.

## Data Inputs

- Optional mission snapshot JSON from `discover_missions.mjs`.
- `run_missions.mjs` defaults to reviewed execution and requires `--missions <path>` unless `--live-discovery true` is supplied.
- Optional custom keywords:
  - Mission actions: `--keywords 링크,적립,참여,받기`
  - Claim buttons (recommended strict): `--claim-keywords 포인트 받기,포인트 쉽게 받기`
- Optional wait tuning:
  - Default wait when mission text has no time: `--default-wait-seconds 7`
  - Minimum wait clamp: `--min-wait-seconds 3`
  - Maximum wait clamp: `--max-wait-seconds 120`
- Optional completed-campaign tracking:
  - Store path: `--completed-store ./.state/naverpay-profile/completed-campaigns.json`
  - Retry all (ignore history): `--ignore-completed true`

## Failure Cases To Expect

- Login expiration or CAPTCHA.
- Changed UI labels/DOM structure that breaks button matching.
- Mission-specific conditions not satisfied (daily limit, eligibility, cooldown).

When these occur, stop automation, inspect manually in the open browser, and refresh mission discovery.
