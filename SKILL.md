---
name: naverpay-point-missions
description: 네이버페이 포인트 미션을 즉시 실행 기본값으로 처리하는 Playwright 자동화 스킬입니다. 최초 로그인은 수동으로 처리하고, 이후에는 저장된 세션으로 headless 재실행을 이어갈 때 사용합니다.
---

# 네이버페이 포인트 미션

## 개요

이 스킬은 네이버페이 포인트 미션을 저장된 세션으로 headless에서 바로 수집하고 실행하는 흐름을 기본값으로 둡니다.
`--headless true`로 시작했는데 저장된 세션이 없다면, 같은 `--state-dir`로 화면 브라우저를 잠깐 열어 최초 로그인을 수동으로 끝낸 뒤 다시 headless로 이어집니다.

핵심 차별점:

- `run_missions.mjs`는 `--missions`가 없으면 실시간 수집 후 바로 실행함
- 검토가 필요할 때만 `discover_missions.mjs`와 `--missions <path>` 흐름을 사용함
- 최초 로그인만 수동으로 두고, 이후에는 저장된 세션을 headless로 재사용함
- 완료 이력 저장으로 이미 처리한 캠페인의 반복 클릭을 줄임
- Codex, Claude Code, Gemini CLI 같은 저장소 연결형 런타임에 그대로 연결 가능함

## 권장 워크플로

0. 자동화 실행이라면 먼저 자동화 메모를 확인합니다. 예: `$CODEX_HOME/automations/naverpay-morning-run/memory.md`. 최근 blocker, 로그인 상태, 직전 완료 이력 개수를 반복 확인하지 않도록 참고합니다.

1. 실행 전에 런타임 사전점검을 먼저 수행합니다. 에이전트/자동화가 이 스킬을 사용할 때는 `run_missions.mjs` 또는 `discover_missions.mjs`를 바로 실행하지 말고, 저장소 루트에서 아래 명령을 먼저 실행해 누락된 로컬 의존성을 자동 복구합니다. Codex 자동화에서는 `npm`이 PATH에 없을 수 있으므로 Node 설치 경로를 PATH에 넣고 실행합니다.

```bash
export PATH="/Users/danny/.nvm/versions/node/v20.19.2/bin:$PATH"
/Users/danny/.nvm/versions/node/v20.19.2/bin/node scripts/ensure_runtime.mjs
```

`playwright` 패키지가 없으면 `npm install`을 자동 실행하고, Chromium 캐시가 없으면 `npx playwright install chromium`을 실행합니다. 설치 명령이 제한 시간 안에 끝나지 않으면 네이버 로그인/CAPTCHA 문제가 아니라 로컬 런타임 설치 blocker로 보고합니다.

2. 기본 자동화 실행은 별도 discovery JSON 없이 바로 실행합니다. 사용자가 max 값을 지정하면 그대로 따르고, 지정이 없으면 기본값 200을 사용합니다.

```bash
export PATH="/Users/danny/.nvm/versions/node/v20.19.2/bin:$PATH"
/Users/danny/.nvm/versions/node/v20.19.2/bin/node scripts/run_missions.mjs \
  --state-dir ./.state/naverpay-profile \
  --headless true \
  --max 200
```

3. Codex 샌드박스 안에서 Chromium이 macOS 권한 문제로 뜨지 않을 수 있습니다. 에러에 `MachPortRendezvousServer`, `Permission denied (1100)`, `Crashpad`, `Operation not permitted`, `kill EPERM` 같은 문구가 있고 페이지가 열리기 전 실패했다면 사이트 blocker가 아닙니다. 같은 명령을 샌드박스 밖 실행 권한으로 한 번 재실행합니다. 무한 재시도하지 말고, 샌드박스 밖에서도 실패하면 브라우저 런치 blocker로 보고합니다.

4. 저장된 세션이 없으면 visible 로그인 bootstrap으로 전환될 수 있습니다. 자동화/백그라운드 실행 중 이 상태에서 장시간 대기하면 로그인 필요 blocker로 보고하고 멈춥니다. 사용자가 직접 실행을 요청한 대화형 세션이면 열린 브라우저에서 수동 로그인을 마친 뒤 재개합니다.

5. 검토 기반 실행이 필요할 때만 미션 후보를 수집하고 검토용 JSON을 저장합니다.

```bash
node scripts/discover_missions.mjs \
  --state-dir ./.state/naverpay-profile \
  --out /tmp/naverpay-missions.json \
  --headless true
```

검토 후 실행:

```bash
node scripts/run_missions.mjs \
  --state-dir ./.state/naverpay-profile \
  --missions /tmp/naverpay-missions.json \
  --headless true \
  --max 200
```

6. 실행 후 네이버페이 적립 결과를 수동 확인합니다.

## 집계 보고

실행 완료 또는 blocker 보고 시 아래 항목을 요약합니다.

- Main link count: `[run] main page point links found: N`에서 확인
- Discovered candidate count: `[run] discovered N mission candidate(s) from main page links`에서 확인
- Filtered target count: `[run] filtered to N클릭 X원 campaigns: A/B`의 `A`
- Completed-store count: 실행 후 `<state-dir>/completed-campaigns.json`의 `completedKeys.length`
- Final completed target count: `[run] completed N target(s)`에서 확인
- Log path: 기본 실행은 별도 로그 파일을 만들지 않으므로 `별도 로그 파일 없음`으로 보고. 사용자가 리다이렉션이나 로그 옵션을 지정한 경우 그 경로를 보고

필요하면 실행 전 completed-store count도 함께 적어 증가량을 알려줍니다.

## 수동 사전 준비

`references/prerequisites.md`를 먼저 확인하고, 새 환경이라면 의존성을 설치합니다. 수동으로 처리해야 하는 경우 아래 명령을 사용합니다.

```bash
npm install
npx playwright install chromium
```

`run_missions.mjs` 또는 `discover_missions.mjs` 실행 시 `Cannot find package 'playwright'`가 나오면 브라우저/로그인 이슈가 아니라 로컬 의존성 누락이므로, 위 명령으로 먼저 복구한 뒤 다시 실행합니다.

실제 클릭 전에 검토 JSON으로 타깃 매칭만 확인하려면 `dry-run`을 사용합니다.

```bash
node scripts/run_missions.mjs \
  --state-dir ./.state/naverpay-profile \
  --missions /tmp/naverpay-missions.json \
  --headless true \
  --max 5 \
  --dry-run true
```

## 실행 규칙

- 로그인 입력 자체는 자동화하지 않습니다.
- 같은 `--state-dir`를 재사용해서 저장된 세션을 계속 활용합니다.
- `--headless true`인데 저장된 세션이 없으면, 화면 브라우저를 한 번 열어 최초 로그인을 완료한 뒤 다시 headless로 재개합니다.
- 기본 경로는 즉시 실행입니다. `run_missions.mjs`는 `--missions <path>`가 없으면 실시간 수집 후 바로 실행하고, 검토된 스냅샷만 강제하려면 `--live-discovery false`를 함께 사용합니다.
- 미션별 `waitSeconds`를 우선 사용하고, 최소 대기 시간(`--min-wait-seconds`, 기본값 3초)을 적용합니다.
- 팝업에서는 `포인트 받기`를 1순위로 누르고, 실패 시 `받기/적립` 계열로 폴백합니다.
- 수집과 실행은 클릭형 포인트 미션 목록(`mssCode=pp`)을 기준으로 합니다.
- 이전 실행에서 완료된 캠페인은 완료 이력 저장소를 이용해 기본적으로 건너뜁니다.
- UI 라벨이나 카드 구조가 바뀌면 discovery를 다시 돌립니다.
- CAPTCHA, 추가 동의, 예상하지 못한 팝업이 나오면 즉시 사용자에게 제어를 돌려줍니다.
- 실행 전 `node scripts/ensure_runtime.mjs`로 `playwright` 패키지와 Chromium 캐시를 확인합니다. 누락된 런타임은 자동 설치하고, 설치 실패/타임아웃은 명확한 blocker로 보고합니다.
- 브라우저 런치가 macOS 권한 오류로 페이지 열기 전 실패하면 샌드박스 밖 실행 권한으로 한 번 재시도합니다.

## 주요 스크립트

- `scripts/ensure_runtime.mjs`: 실행 전 `npm install`과 Chromium 캐시 상태를 점검하고, 누락된 런타임을 자동 복구합니다.
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
- `run_missions`가 `--missions` 없이 실패한다면 설치된 스킬/스크립트가 구버전일 수 있습니다. 현재 기본값은 즉시 실행이므로 스킬과 저장소를 최신화한 뒤 재실행합니다.
- Chromium이 `MachPortRendezvousServer`, `Crashpad`, `Permission denied (1100)`, `Operation not permitted`, `kill EPERM`로 죽으면 네이버 문제가 아니라 로컬 실행 권한 문제입니다. 샌드박스 밖 실행 권한으로 한 번 재시도하고, 그래도 실패하면 브라우저 런치 blocker로 보고합니다.
- 잘못된 버튼이 선택되면 `--max`를 줄이고, `--missions` 목록을 편집한 뒤 다시 실행합니다.
- 카드 문구가 바뀌었으면 discovery를 다시 실행해 라벨, 링크, 카드 요약을 갱신합니다.
