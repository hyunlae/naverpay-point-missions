# naverpay-point-missions

> 최초 로그인만 화면에서 처리하고, 이후에는 같은 세션을 헤드리스로 재사용하면서 네이버페이 포인트 미션을 즉시 수집/실행하는 Playwright 자동화 도구입니다.

이 도구는 `https://point.pay.naver.com/pc/main`의 네이버페이 포인트 미션을 저장된 세션으로 열고, 기본적으로 실시간 후보 수집 후 바로 실행합니다.
사전 검토가 필요하면 별도로 후보 JSON을 만들고 `--missions <path>`를 넘기는 흐름을 사용할 수 있습니다.

이 도구가 특히 적합한 경우:

- 네이버페이 미션을 반복 실행하되 저장된 세션으로 자연스럽게 headless 재실행하고 싶을 때
- 최초 로그인만 화면에서 수동으로 처리하고, 이후에는 같은 `--state-dir`를 헤드리스로 재사용하고 싶을 때
- Codex, Claude Code, Gemini CLI에서 하나의 저장소 연결형 실행 환경을 공용으로 쓰고 싶을 때

핵심 원칙:

- `run-by-default`: `run_missions.mjs`는 `--missions`가 없으면 실시간 수집 후 바로 실행
- `review-when-needed`: 검토가 필요할 때만 `discover -> JSON 검토 -> run --missions`
- `manual-first login`: 저장된 세션이 없으면 화면 브라우저를 한 번 열어 로그인한 뒤 헤드리스로 재개
- `repo-backed install`: AI 런타임에는 얇은 링크만 두고, 실제 코드와 의존성은 이 저장소에 유지

## 언어 정책

이 저장소는 한국어 우선 문서를 기본으로 합니다.

- `README.md`, `SKILL.md`, 주요 CLI 도움말은 한국어 우선으로 유지
- 공개 검색성과 호환성을 위해 `package.json`의 키워드 같은 일부 메타데이터는 영어를 함께 유지
- 런타임 로그에는 기술적인 맥락상 영어 키워드가 일부 남을 수 있지만, 처음 쓰는 사용자가 보는 진입 문서는 한국어 기준으로 맞춤

## 3분 빠른 시작

### 1) 저장소 준비 + Codex 연결

```bash
git clone https://github.com/hyunlae/naverpay-point-missions.git
cd naverpay-point-missions
npm install
npx playwright install chromium
node scripts/install_skill.mjs --target codex --mode link
```

이 경로가 Codex 기준의 공식 권장 설치 경로입니다.
`skills.sh` 설치는 발견용 채널로는 유효하지만, 실제 Codex 런타임 연결은 이 저장소를 `link`하는 방식이 가장 안정적입니다.

에이전트/자동화에서 실행할 때는 미션 수집 또는 실행 전에 아래 사전점검을 먼저 호출하면 누락된 로컬 런타임을 자동 복구합니다.

```bash
node scripts/ensure_runtime.mjs
```

### 2) 런타임 점검

```bash
node scripts/ensure_runtime.mjs
```

자동화 환경에서 `npm`이 PATH에 없으면 Node 설치 경로를 PATH에 추가한 뒤 실행하세요.

```bash
export PATH="/Users/danny/.nvm/versions/node/v20.19.2/bin:$PATH"
/Users/danny/.nvm/versions/node/v20.19.2/bin/node scripts/ensure_runtime.mjs
```

### 3) 즉시 실행

```bash
node scripts/run_missions.mjs \
  --state-dir ./.state/naverpay-profile \
  --headless true \
  --max 200
```

처음 실행이면 저장된 세션이 없기 때문에 화면 브라우저가 잠깐 열립니다.
그 창에서 네이버 로그인만 완료하면, 같은 `--state-dir`에 세션이 저장되고 이후 실행은 headless로 이어집니다.

### 4) 선택: JSON 검토 + `dry-run`

```bash
node scripts/discover_missions.mjs \
  --state-dir ./.state/naverpay-profile \
  --out /tmp/naverpay-missions.json \
  --headless true

node scripts/run_missions.mjs \
  --state-dir ./.state/naverpay-profile \
  --missions /tmp/naverpay-missions.json \
  --headless true \
  --max 5 \
  --dry-run true
```

실행 후에는 네이버페이 내역 페이지에서 실제 적립 결과를 한 번 수동 확인하는 것을 권장합니다.

## 제품 모델

이 도구는 "클론한 저장소 자체"가 실행 루트입니다.

- 추천 설치 방식: 저장소를 클론하고 의존성을 설치한 뒤, 각 AI 런타임에 이 저장소를 `link` 방식으로 등록
- 기본 실행 방식: `run_missions.mjs`로 실시간 수집 후 즉시 실행
- 검토 실행 방식: `discover -> JSON 검토 -> run --missions`

즉, 반복 자동화에서는 즉시 실행을 기본으로 두고, 검토가 필요한 상황에서만 JSON 흐름을 사용합니다.

## 로그인 동작

`discover`와 `run`은 모두 같은 로그인 규칙을 따릅니다.

1. `--headless true`로 시작
2. 해당 `--state-dir`에 저장된 로그인 세션이 있으면 바로 headless 실행
3. 저장된 세션이 없으면 화면 브라우저가 한 번 열림
4. 그 창에서 네이버 로그인을 수동으로 완료
5. 세션이 저장되면 같은 실행이 다시 headless로 이어짐

즉, "최초 로그인만 화면, 이후에는 같은 `--state-dir`로 headless 재사용"이 기본 흐름입니다.

## 주요 기능

- 메인 페이지와 미션 상세 페이지에서 클릭 가능한 캠페인 후보 수집
- `N클릭 X원` 형태 캠페인 필터링 실행
- 팝업 `포인트 받기` 우선 클릭, 실패 시 시각적 폴백 시도
- `이미 수행(캠페인 당 1회)` 팝업 감지 후 `확인` 처리
- 캠페인 완료 이력 저장(`completed-campaigns.json`)으로 재수행 방지
- 다중 계정 프로필(`--state-dir`) 분리 실행 지원
- Codex/Claude/Gemini/Antigravity용 등록 스크립트 제공

## 기본 모드: live discovery 즉시 실행

```bash
node scripts/run_missions.mjs \
  --state-dir ./.state/naverpay-profile \
  --headless true \
  --max 200
```

검토된 JSON만 실행하고 싶다면 `--missions <path>`를 넘기거나, 실시간 수집을 막기 위해 `--live-discovery false`를 함께 사용합니다.

## 다중 계정 실행

계정마다 `--state-dir`를 다르게 주면 독립적으로 실행할 수 있습니다.

```bash
# 계정 A
node scripts/discover_missions.mjs --state-dir ./.state/naverpay-profile --out /tmp/naverpay-a.json --headless true
node scripts/run_missions.mjs --state-dir ./.state/naverpay-profile --missions /tmp/naverpay-a.json --headless true --max 200

# 계정 B
node scripts/discover_missions.mjs --state-dir ./.state/naverpay-profile-b --out /tmp/naverpay-b.json --headless true
node scripts/run_missions.mjs --state-dir ./.state/naverpay-profile-b --missions /tmp/naverpay-b.json --headless true --max 200
```

각 계정의 첫 실행에서는 해당 `--state-dir` 기준으로 화면 브라우저가 한 번 열릴 수 있습니다.

## `run_missions.mjs` 주요 옵션

- `--missions <path>`: 검토된 미션 JSON 경로
- `--live-discovery <bool>`: 검토용 JSON 없이 즉시 수집/실행할지 여부(기본 `true`)
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
- `--max <num>`: 최대 수행 개수(기본 `200`)
- `--headless <true|false>`: 헤드리스 실행 여부
- `--headless true`인데 세션이 없으면, 화면 브라우저가 자동으로 한 번 열려 수동 로그인 후 다시 headless로 재개
- `--dry-run <true|false>`: 실제 클릭 없이 타깃 매칭만 수행
- `--login-timeout-sec <num>`: 로그인 대기 제한 시간

도움말:

```bash
node scripts/run_missions.mjs --help
```

## `discover_missions.mjs` 주요 옵션

- `--out <path>`: 수집 결과 JSON 저장 경로
- `--state-dir <path>`: Playwright 프로필 경로 (기본: `./.state/naverpay-profile`)
- `--keywords <csv>`: 수집 대상 액션 키워드 필터
- `--default-wait-seconds <n>`: 대기 시간 미검출 시 수집 결과에 넣을 기본값(기본 `7`)
- `--headless <true|false>`: 헤드리스 실행 여부
- `--headless true`인데 세션이 없으면, 화면 브라우저가 자동으로 한 번 열려 수동 로그인 후 다시 headless로 재개
- `--login-timeout-sec <num>`: 로그인 대기 제한 시간

도움말:

```bash
node scripts/discover_missions.mjs --help
```

## 완료 이력(중복 방지)

기본 저장 위치:

- `<state-dir>/completed-campaigns.json`

의미:

- 이미 완료된 캠페인은 다음 실행에서 자동 스킵
- 팝업 완료 감지/클레임 성공 시 이력에 기록

초기화하고 다시 돌리고 싶다면:

- 해당 JSON 파일 삭제
- 또는 `--ignore-completed true` 사용

## 자동화 예시

무인 실행은 기본 즉시 실행 경로를 사용합니다. 로그 파일이 필요하면 셸 리다이렉션으로 남깁니다.

```cron
0 9 * * * cd /path/to/naverpay-point-missions && node scripts/ensure_runtime.mjs && node scripts/run_missions.mjs --state-dir ./.state/naverpay-profile --headless true --max 200 >> /tmp/naverpay-profile.log 2>&1
```

검토 기반 자동화가 필요하면, 먼저 `discover` 산출물을 갱신하는 별도 단계가 있어야 합니다.

## 트러블슈팅

- 로그인 타임아웃: `--login-timeout-sec` 증가. `--headless true`였다면 화면 로그인 유도 창에서 먼저 로그인 완료
- `run_missions`가 `--missions` 없이 바로 실패: 설치된 스킬/스크립트가 구버전일 수 있음. 현재 기본값은 즉시 실행
- Chromium이 `MachPortRendezvousServer`, `Crashpad`, `Permission denied (1100)`, `Operation not permitted`, `kill EPERM`로 죽음: 로컬 실행 권한 문제이므로 샌드박스 밖 실행 권한으로 한 번 재시도
- `포인트 받기` 버튼 미탐지: UI 변경 가능성 높음, `discover` 재실행 후 JSON 검토
- 일부 캠페인 누락: 페이지 로딩/스크롤 지연 가능성, `--max`를 줄여 재시도
- 이미 참여한 캠페인 반복: `completed-campaigns.json` 경로가 프로필별로 분리됐는지 확인
- 특정 캠페인만 테스트: `--max 1 --dry-run true`로 먼저 매칭 결과 확인

## 운영 권장사항

- 처음에는 소량(`--max 5~10`)으로 검증 후 배치 확장
- 계정별 상태 폴더를 반드시 분리
- 실행 후 네이버페이 내역 페이지에서 적립 결과를 수동 검증
- 무인 실행 전 `scripts/ensure_runtime.mjs`로 로컬 런타임을 확인
- 서비스 정책/약관 변경 시 즉시 중단 후 로직 점검

## 멀티 AI 스킬 등록

기본 추천 방식은 `link` 모드입니다. AI 런타임 디렉터리에는 이 저장소를 가리키는 skill 엔트리만 만들고, 실제 스크립트/의존성은 이 저장소에서 관리합니다.

기본 등록:

```bash
node scripts/install_skill.mjs --target all --mode link
```

타겟별 기본 경로:

- `codex`/`openai`: `$CODEX_HOME/skills` 또는 `~/.codex/skills`
- `claude`: `~/.claude/skills`
- `gemini`: `~/.gemini/skills`
- `antigravity`: `~/.antigravity/skills`

특정 타겟만 등록:

```bash
node scripts/install_skill.mjs --target codex --mode link
node scripts/install_skill.mjs --target claude --mode link
node scripts/install_skill.mjs --target gemini --mode link
node scripts/install_skill.mjs --target antigravity --mode link
```

경로만 확인:

```bash
node scripts/install_skill.mjs --target all --mode link --dry-run true
```

### `copy` 모드

`copy` 모드는 대체 설치 방식입니다.

```bash
node scripts/install_skill.mjs --target custom --dest ~/.my-agent/skills --mode copy
```

주의:

- `copy` 모드는 설치된 skill 디렉터리 안에도 의존성 설치가 필요할 수 있습니다.
- 특별한 이유가 없으면 `link` 모드를 사용하세요.

## 요구사항

- Node.js 18 이상
- Playwright
- Chromium 브라우저 바이너리

```bash
npm install
npx playwright install chromium
```

## skills.sh

이 저장소는 `skills` CLI가 인식하는 공개 스킬 저장소 형식도 함께 만족합니다.

공개 설치/탐색 커맨드:

```bash
npx skills add hyunlae/naverpay-point-missions --skill naverpay-point-missions
```

용도:

- `skills.sh`/`skills` 생태계에서 이 스킬을 발견하고 설치하기
- 리더보드 집계 경로를 타기
- GitHub 저장소만으로 스킬 저장소 형식을 검증하기

주의:

- `skills` CLI로는 이 저장소가 정상 인식됩니다.
- 다만 현재 확인된 동작 기준으로는 Codex 전용 글로벌 설치 경로(`~/.codex/skills`)보다 기준 복사본(`~/.agents/skills/...`) 중심으로 배치될 수 있습니다.
- 그래서 실제 Codex 런타임에는 이 README 상단의 `repo-backed link` 설치를 계속 권장합니다.

## 배포 우선순위

현재 기준으로는 아래 순서로 노출을 챙기는 것이 가장 효율적입니다.

1. `skills.sh`: 공개 스킬 인덱스이자 설치 집계의 기준 원천
2. `SkillsGate`: `skills.sh` 공개 스킬을 브라우징/설치하는 UI 계층
3. `AgentSkills`: 별도 탐색 트래픽과 카테고리 노출을 기대할 수 있는 독립 디렉터리
4. `ClawHub` / Claude 전용 마켓플레이스: OpenClaw 또는 Claude 전용 패키징이 추가될 때 검토

## 릴리스

현재 첫 릴리스 버전은 `1.0.0`입니다.

관련 파일:

- `VERSION`
- `CHANGELOG.md`
- `package.json`

1단계, 릴리스 파일 준비:

```bash
node scripts/release.mjs --version 1.0.0 --notes "첫 릴리스"
```

또는 npm script:

```bash
npm run release -- --version 1.0.0 --notes "첫 릴리스"
```

이 명령은 다음 파일을 함께 갱신합니다.

- `VERSION`
- `package.json`의 `version`
- `package-lock.json`의 `version`
- `CHANGELOG.md`

GitHub 릴리스 노트는 `CHANGELOG.md`의 해당 버전 섹션을 바탕으로 다음 형식으로 정리됩니다.

```md
# 1.0.0

배포일: 2026-04-18

## 주요 내용
- 첫 릴리스
```

2단계, 커밋과 push 이후 GitHub 릴리스 발행:

```bash
node scripts/release.mjs --version 1.0.0 --publish-github true --skip-prepare true
```

이 단계는 다음을 전제로 합니다.

- 릴리스 관련 파일이 이미 커밋되어 있을 것
- 현재 브랜치 HEAD가 upstream에 push되어 있을 것
- 워킹트리가 깨끗할 것

GitHub 릴리스를 발행할 때는 저장소의 project-local GitHub 인증 파일이 있으면 그 설정을 우선 사용하고, 없으면 현재 `gh` CLI 인증을 사용합니다.

### GitHub Actions 자동 발행

이 저장소에는 `.github/workflows/release.yml`이 포함되어 있습니다.

- 트리거: `v*` 형식 tag push
- 권한: `contents: write`
- 동작: 저장소를 체크아웃한 뒤 `node scripts/release.mjs --version "${{ github.ref_name }}" --publish-github true --skip-prepare true` 실행

즉, 릴리스 파일을 준비해서 커밋/푸시한 뒤 아래처럼 tag를 올리면 GitHub 릴리스가 자동으로 발행됩니다.

```bash
git tag v1.0.0
git push origin v1.0.0
```

## 저장소 구성

- `SKILL.md`: 공통 스킬 설명
- `scripts/ensure_runtime.mjs`: Playwright 패키지와 Chromium 캐시 자동 점검/복구 스크립트
- `scripts/run_missions.mjs`: 미션 실행 스크립트
- `scripts/discover_missions.mjs`: 미션 후보 수집 스크립트
- `scripts/naverpay_helpers.mjs`: URL/셀렉터/클릭/대기 계산 유틸
- `scripts/install_skill.mjs`: AI별 skill 등록 스크립트
- `references/prerequisites.md`: 사전 준비 사항
- `references/execution-checklist.md`: 실행 체크리스트
- `agents/*.yaml`: AI별 매니페스트(`openai`, `claude`, `gemini`, `antigravity`)
- `docs/plans/`: 제품/운영 계획 문서
