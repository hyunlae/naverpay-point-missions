# naverpay-point-missions

Naver Pay 포인트 클릭/방문 미션 자동화용 Codex skill.

## 구성
- `SKILL.md`: 스킬 설명 및 실행 옵션
- `scripts/run_missions.mjs`: 미션 실행
- `scripts/discover_missions.mjs`: 미션 탐색
- `scripts/naverpay_helpers.mjs`: 공통 브라우저 유틸
- `references/`: 실행 체크리스트 및 사전 준비

## 실행 예시
```bash
node scripts/run_missions.mjs \
  --state-dir ./.state/naverpay-profile \
  --headless true \
  --max 100 \
  --min-wait-seconds 3 \
  --default-wait-seconds 7
```

## 요구사항
- Node.js 18+
- Playwright (`npm i -D playwright` 및 `npx playwright install chromium`)
