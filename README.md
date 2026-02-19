# naverpay-point-missions

네이버페이 포인트 페이지(`https://point.pay.naver.com/pc/main`)의 클릭/방문 미션을 Playwright로 반복 실행하는 자동화 스킬입니다.

핵심 목표:
- `포인트 받기` 링크/버튼 경로를 따라 미션 페이지 진입
- 캠페인별 대기 시간(최소 3초 이상) 반영
- 팝업 `포인트 받기` 우선 클릭
- 이미 수행된 캠페인 재시도 방지

## 주요 기능

- 메인 페이지의 `포인트 받기` 링크를 스캔해 미션 목록 자동 수집
- `N클릭 X원` 형태 캠페인만 필터링 실행(기본값: 활성화)
- 팝업 `포인트 받기` 버튼 탐지/클릭 + 시각적 폴백 클릭
- `이미 수행(캠페인 당 1회)` 팝업 감지 후 `확인` 처리
- 캠페인 완료 이력 저장(`completed-campaigns.json`)으로 재수행 방지
- 다중 계정 프로필(`--state-dir`) 분리 실행 지원
- `headless=true` 모드 지원

## 동작 흐름

1. 브라우저 프로필(`--state-dir`)로 네이버 로그인 상태 확인
2. 메인 페이지/미션 상세 페이지에서 클릭 가능한 캠페인 수집
3. 조건에 맞는 캠페인 선택(`N클릭` 필터 등)
4. 캠페인 클릭 -> 팝업 `포인트 받기` 시도
5. 이동 페이지 체류(`waitSeconds`) 후 복귀
6. 필요 시 후속 `포인트 받기/확인` 클릭
7. 성공/완료된 캠페인 키를 저장해 다음 실행에서 스킵

## 저장소 구성

- `SKILL.md`: 공통 스킬 설명(멀티 에이전트 공용)
- `scripts/run_missions.mjs`: 미션 실행 스크립트
- `scripts/discover_missions.mjs`: 미션 후보 수집 스크립트
- `scripts/naverpay_helpers.mjs`: URL/셀렉터/클릭/대기 계산 유틸
- `scripts/install_skill.mjs`: AI별 스킬 경로에 설치하는 헬퍼
- `references/prerequisites.md`: 사전 준비 사항
- `references/execution-checklist.md`: 실행 체크리스트
- `agents/*.yaml`: AI별 매니페스트(`openai`, `claude`, `gemini`, `antigravity`)

## 요구사항

- Node.js 18 이상
- Playwright
- Chromium 브라우저 바이너리

```bash
npm install -D playwright
npx playwright install chromium
```

## 멀티 AI 스킬 설치

이 프로젝트는 `SKILL.md + scripts + references`를 공통 엔진으로 사용하고,
`agents/*.yaml`로 AI별 메타데이터만 분리했습니다.

기본 설치(모든 타겟):

```bash
node scripts/install_skill.mjs --target all
```

타겟별 기본 설치 경로:

- `codex`/`openai`: `$CODEX_HOME/skills` (없으면 `~/.agents/skills`)
- `claude`: `~/.claude/skills`
- `gemini`: `~/.gemini/skills`
- `antigravity`: `~/.antigravity/skills`

특정 타겟만 설치:

```bash
node scripts/install_skill.mjs --target claude
node scripts/install_skill.mjs --target gemini
node scripts/install_skill.mjs --target antigravity
```

기타 AI 에이전트용(직접 skill 루트 지정):

```bash
node scripts/install_skill.mjs --target custom --dest ~/.my-agent/skills
```

커스텀 경로 설치(단일 타겟):

```bash
node scripts/install_skill.mjs --target gemini --dest ~/.config/gemini/skills
```

설치 전 경로만 확인:

```bash
node scripts/install_skill.mjs --target all --dry-run true
```

## 빠른 시작

### 1) 첫 실행(로그인 세션 생성)

처음에는 headful 모드로 실행해 로그인 상태를 먼저 저장하는 것을 권장합니다.

```bash
node scripts/run_missions.mjs \
  --state-dir ./.state/naverpay-profile \
  --max 5 \
  --min-wait-seconds 3 \
  --default-wait-seconds 7 \
  --headless false
```

로그인/인증이 끝나면 `--state-dir` 아래에 세션이 저장됩니다.

### 2) 일반 실행(headless)

```bash
node scripts/run_missions.mjs \
  --state-dir ./.state/naverpay-profile \
  --headless true \
  --max 100 \
  --min-wait-seconds 3 \
  --default-wait-seconds 7
```

## 다중 계정 실행

계정마다 `--state-dir`를 다르게 주면 독립적으로 실행할 수 있습니다.

```bash
# 계정 A
node scripts/run_missions.mjs --state-dir ./.state/naverpay-profile --headless true --max 100

# 계정 B
node scripts/run_missions.mjs --state-dir ./.state/naverpay-profile-new --headless true --max 100
```

## 미션 수집 전용 실행(discover)

실행 전 후보 목록을 JSON으로 점검하고 싶을 때 사용합니다.

```bash
node scripts/discover_missions.mjs \
  --state-dir ./.state/naverpay-profile \
  --out /tmp/naverpay-missions.json \
  --headless true
```

생성된 JSON을 `run_missions.mjs --missions`에 넘겨 고정 목록으로 실행할 수 있습니다.

```bash
node scripts/run_missions.mjs \
  --state-dir ./.state/naverpay-profile \
  --missions /tmp/naverpay-missions.json \
  --max 30 \
  --headless true
```

## `run_missions.mjs` 주요 옵션

- `--state-dir <path>`: Playwright 프로필 경로 (기본: `./.state/naverpay-profile`)
- `--completed-store <path>`: 완료 캠페인 저장 파일 경로
- `--ignore-completed <bool>`: 완료 이력 무시하고 재시도할지 여부
- `--scan-main-point-links <bool>`: 메인 페이지 `포인트 받기` 링크 우선 스캔 여부
- `--only-nclick-campaigns <bool>`: `N클릭 X원` 캠페인만 실행할지 여부(기본 `true`)
- `--keywords <csv>`: 미션 액션 키워드 필터
- `--claim-keywords <csv>`: 후속 적립 버튼 탐색 키워드
- `--popup-primary-label <txt>`: 팝업 1순위 버튼 라벨(기본 `포인트 받기`)
- `--default-wait-seconds <n>`: 대기 시간 미검출 시 기본값(기본 `7`)
- `--min-wait-seconds <n>`: 최소 대기 시간(기본 `3`)
- `--max-wait-seconds <n>`: 최대 대기 시간(기본 `120`)
- `--max <num>`: 최대 수행 개수(기본 `100`)
- `--headless <true|false>`: 헤드리스 실행 여부
- `--dry-run <true|false>`: 실제 클릭 없이 타겟 매칭만 수행
- `--login-timeout-sec <num>`: 로그인 대기 제한 시간

도움말:

```bash
node scripts/run_missions.mjs --help
```

## 완료 이력(중복 방지)

기본 저장 위치:

- `<state-dir>/completed-campaigns.json`

의미:
- 이미 완료된 캠페인은 다음 실행에서 자동 스킵
- 팝업 완료 감지/클레임 성공 시 이력에 기록

초기화하고 다시 돌리고 싶다면:
- 해당 JSON 파일 삭제 또는 `--ignore-completed true` 사용

## 크론 예시(매일 오전 9시, 2개 프로필)

```cron
0 9 * * * cd /path/to/naverpay-point-missions && node scripts/run_missions.mjs --state-dir ./.state/naverpay-profile --headless true --max 100 --min-wait-seconds 3 --default-wait-seconds 7 >> /tmp/naverpay-profile.log 2>&1
0 9 * * * cd /path/to/naverpay-point-missions && node scripts/run_missions.mjs --state-dir ./.state/naverpay-profile-new --headless true --max 100 --min-wait-seconds 3 --default-wait-seconds 7 >> /tmp/naverpay-profile-new.log 2>&1
```

## 트러블슈팅

- 로그인 타임아웃: `--login-timeout-sec` 증가, 먼저 headful로 로그인 세션 생성
- `포인트 받기` 버튼 미탐지: UI 변경 가능성 높음, `discover` 재실행 후 확인
- 일부 캠페인 누락: 페이지 로딩/스크롤 지연 가능성, `--max` 줄여 재시도
- 이미 참여한 캠페인 반복: `completed-campaigns.json` 경로가 프로필별로 분리됐는지 확인
- 특정 캠페인만 테스트: `--max 1 --dry-run true`로 매칭 결과 먼저 확인

## 운영 권장사항

- 처음에는 소량(`--max 5~10`)으로 검증 후 배치 확장
- 계정별 상태 폴더를 반드시 분리
- 실행 후 네이버페이 내역 페이지에서 적립 결과 수동 검증
- 서비스 정책/약관 변경 시 즉시 중단 후 로직 점검
