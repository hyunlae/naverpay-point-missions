---
name: naverpay-point-missions
description: 네이버페이 포인트 미션을 검토 기반으로 실행하는 Playwright 자동화 스킬입니다. 최초 로그인은 수동으로 처리하고, 이후에는 저장된 세션으로 headless 재실행을 이어갈 때 사용합니다.
---

# 네이버페이 포인트 미션

## 개요

이 스킬은 네이버페이 포인트 미션을 무작정 클릭하지 않고, 먼저 수집하고 검토한 뒤 실행하는 흐름을 기본값으로 둡니다.
`--headless true`로 시작했는데 저장된 세션이 없다면, 같은 `--state-dir`로 화면 브라우저를 잠깐 열어 최초 로그인을 수동으로 끝낸 뒤 다시 headless로 이어집니다.

핵심 차별점:

- 즉시 실행보다 `reviewed-by-default` 흐름을 우선함
- 최초 로그인만 수동으로 두고, 이후에는 저장된 세션을 headless로 재사용함
- 완료 이력 저장으로 이미 처리한 캠페인의 반복 클릭을 줄임
- Codex, Claude Code, Gemini CLI 같은 저장소 연결형 런타임에 그대로 연결 가능함

## 권장 워크플로

1. `references/prerequisites.md`를 먼저 확인하고, 새 환경이라면 의존성을 설치합니다.

```bash
npm install
npx playwright install chromium
```

`run_missions.mjs` 또는 `discover_missions.mjs` 실행 시 `Cannot find package 'playwright'`가 나오면 브라우저/로그인 이슈가 아니라 로컬 의존성 누락이므로, 위 명령으로 먼저 복구한 뒤 다시 실행합니다.

2. 미션 후보를 수집하고 검토용 JSON을 저장합니다.

```bash
node scripts/discover_missions.mjs \
  --state-dir ./.state/naverpay-profile \
  --out /tmp/naverpay-missions.json \
  --headless true
```

해당 `--state-dir`에 저장된 세션이 없다면, 화면 브라우저가 한 번 열려 최초 로그인을 수동으로 완료하게 됩니다.

3. `/tmp/naverpay-missions.json`에서 자동화하면 안 되는 항목을 제거합니다.
4. 실제 클릭 전에 `dry-run`으로 먼저 타깃 매칭을 확인합니다.

```bash
node scripts/run_missions.mjs \
  --state-dir ./.state/naverpay-profile \
  --missions /tmp/naverpay-missions.json \
  --headless true \
  --max 5 \
  --dry-run true
```

5. 검토가 끝난 JSON으로 실제 실행합니다.

```bash
node scripts/run_missions.mjs \
  --state-dir ./.state/naverpay-profile \
  --missions /tmp/naverpay-missions.json \
  --headless true \
  --default-wait-seconds 7 \
  --min-wait-seconds 3 \
  --max 10
```

6. 실행 후 네이버페이 적립 결과를 수동 확인합니다.

고급 모드:

```bash
node scripts/run_missions.mjs \
  --state-dir ./.state/naverpay-profile \
  --live-discovery true \
  --headless true \
  --max 10
```

## 실행 규칙

- 로그인 입력 자체는 자동화하지 않습니다.
- 같은 `--state-dir`를 재사용해서 저장된 세션을 계속 활용합니다.
- `--headless true`인데 저장된 세션이 없으면, 화면 브라우저를 한 번 열어 최초 로그인을 완료한 뒤 다시 headless로 재개합니다.
- 기본 경로는 검토 기반 실행입니다. `run_missions.mjs`는 `--missions <path>`가 없으면 실패하고, 예전 동작은 `--live-discovery true`일 때만 허용됩니다.
- 미션별 `waitSeconds`를 우선 사용하고, 최소 대기 시간(`--min-wait-seconds`, 기본값 3초)을 적용합니다.
- 팝업에서는 `포인트 받기`를 1순위로 누르고, 실패 시 `받기/적립` 계열로 폴백합니다.
- 수집과 실행은 클릭형 포인트 미션 목록(`mssCode=pp`)을 기준으로 합니다.
- 이전 실행에서 완료된 캠페인은 완료 이력 저장소를 이용해 기본적으로 건너뜁니다.
- UI 라벨이나 카드 구조가 바뀌면 discovery를 다시 돌립니다.
- CAPTCHA, 추가 동의, 예상하지 못한 팝업이 나오면 즉시 사용자에게 제어를 돌려줍니다.

## 주요 스크립트

- `scripts/discover_missions.mjs`: 네이버페이 메인 페이지를 열고, 필요하면 visible 로그인 bootstrap을 수행한 뒤, 클릭 가능한 미션 후보를 수집해서 JSON으로 저장합니다.
- `scripts/run_missions.mjs`: 검토된 JSON 또는 명시적 live discovery 결과를 바탕으로 미션을 매칭하고, 미션 링크 클릭과 팝업 적립까지 순차 실행합니다.
- `scripts/naverpay_helpers.mjs`: 로그인 bootstrap, 미션 수집, 매칭, 클릭 실행 공용 유틸입니다.
- `scripts/install_skill.mjs`: 저장소 연결형 `link` 설치를 기본으로 각 AI 런타임에 스킬을 등록합니다.

## 완료 이력 옵션

- `--completed-store <path>`: 완료 캠페인 키 저장 경로 (기본값: `<state-dir>/completed-campaigns.json`)
- `--ignore-completed true`: 완료 이력을 무시하고 현재 실행에서 모든 캠페인을 다시 시도

## 트러블슈팅

- 수집 결과가 비어 있으면, 열린 브라우저에서 페이지를 조금 더 로딩/스크롤한 뒤 discovery를 다시 실행합니다.
- 로그인 타임아웃이 나면 `--login-timeout-sec`를 늘립니다. `--headless true`였다면 임시로 열린 visible 브라우저에서 먼저 로그인을 완료합니다.
- `Cannot find package 'playwright'` 또는 비슷한 모듈 로드 에러가 나면 `npm install`과 `npx playwright install chromium`로 로컬 의존성을 먼저 복구한 뒤 같은 명령을 다시 실행합니다.
- `run_missions`가 시작조차 안 되면 `--missions <path>`를 넘겼는지, 또는 정말 `--live-discovery true`가 필요한지 먼저 확인합니다.
- 잘못된 버튼이 선택되면 `--max`를 줄이고, `--missions` 목록을 편집한 뒤 다시 실행합니다.
- 카드 문구가 바뀌었으면 discovery를 다시 실행해 라벨, 링크, 카드 요약을 갱신합니다.
