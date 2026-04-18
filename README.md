# naverpay-point-missions

> **설치 요약**: `git clone https://github.com/hyunlae/naverpay-point-missions.git && cd naverpay-point-missions && npm install && npx playwright install chromium && node scripts/install_skill.mjs --target codex --mode link`

네이버페이 포인트 페이지(`https://point.pay.naver.com/pc/main`)의 클릭/방문 미션을 Playwright로 반복 실행하는 자동화 스킬입니다.

이 프로젝트는 이제 다음 원칙을 기본으로 합니다.

- `reviewed-by-default`: 먼저 미션을 수집하고, 사람이 JSON을 검토한 뒤 실행합니다.
- `repo-backed install`: AI 런타임에는 이 저장소를 기본적으로 `link` 방식으로 등록합니다.
- `live discovery is advanced`: 실시간 수집 후 즉시 실행은 가능하지만, 명시적 opt-in 이 있어야 합니다.
- `headless login bootstrap`: `--headless true`인데 저장된 로그인 세션이 없으면, 같은 `--state-dir`로 화면 브라우저를 잠깐 띄워 최초 로그인 후 다시 headless로 이어집니다.

## 제품 모델

이 스킬은 "클론한 저장소 자체"가 실행 루트입니다.

- 추천 설치 방식: 저장소를 클론하고 의존성을 설치한 뒤, 각 AI 런타임에 이 저장소를 `link` 방식으로 등록
- 기본 실행 방식: `discover -> JSON 검토 -> run --missions`
- 고급 실행 방식: `--live-discovery true`를 줘서 기존처럼 즉시 수집/즉시 실행

즉, 편의보다 안전한 기본값을 우선합니다.

## 주요 기능

- 메인 페이지와 미션 상세 페이지에서 클릭 가능한 캠페인 후보 수집
- `N클릭 X원` 형태 캠페인 필터링 실행
- 팝업 `포인트 받기` 우선 클릭, 실패 시 시각적 폴백 시도
- `이미 수행(캠페인 당 1회)` 팝업 감지 후 `확인` 처리
- 캠페인 완료 이력 저장(`completed-campaigns.json`)으로 재수행 방지
- 다중 계정 프로필(`--state-dir`) 분리 실행 지원
- Codex/Claude/Gemini/Antigravity용 등록 스크립트 제공

## 로그인 동작

이제 `discover`와 `run`은 모두 같은 로그인 규칙을 따릅니다.

1. `--headless true`로 시작
2. 해당 `--state-dir`에 저장된 로그인 세션이 있으면 바로 headless 실행
3. 저장된 세션이 없으면 화면 브라우저가 한 번 열림
4. 그 창에서 네이버 로그인을 수동으로 완료
5. 세션이 저장되면 같은 실행이 다시 headless로 이어짐

즉, "최초 로그인만 화면, 이후에는 같은 `--state-dir`로 headless 재사용"이 기본 흐름입니다.

## 저장소 구성

- `SKILL.md`: 공통 스킬 설명
- `scripts/run_missions.mjs`: 미션 실행 스크립트
- `scripts/discover_missions.mjs`: 미션 후보 수집 스크립트
- `scripts/naverpay_helpers.mjs`: URL/셀렉터/클릭/대기 계산 유틸
- `scripts/install_skill.mjs`: AI별 skill 등록 스크립트
- `references/prerequisites.md`: 사전 준비 사항
- `references/execution-checklist.md`: 실행 체크리스트
- `agents/*.yaml`: AI별 매니페스트(`openai`, `claude`, `gemini`, `antigravity`)
- `docs/plans/`: 제품/운영 계획 문서

## 요구사항

- Node.js 18 이상
- Playwright
- Chromium 브라우저 바이너리

```bash
npm install
npx playwright install chromium
```

## GitHub에서 설치하기

GitHub 저장소를 클론한 뒤, 이 저장소를 실행 루트로 사용하세요.

```bash
git clone https://github.com/hyunlae/naverpay-point-missions.git
cd naverpay-point-missions
npm install
npx playwright install chromium
```

## Release

현재 첫 release 버전은 `1.0.0`입니다.

관련 파일:

- `VERSION`
- `CHANGELOG.md`
- `package.json`

1단계, release 파일 준비:

```bash
node scripts/release.mjs --version 1.0.0 --notes "Initial release"
```

또는 npm script:

```bash
npm run release -- --version 1.0.0 --notes "Initial release"
```

이 명령은 다음을 함께 갱신합니다.

- `VERSION`
- `package.json`의 `version`
- `package-lock.json`의 `version`
- `CHANGELOG.md`

GitHub Release notes는 `CHANGELOG.md`의 해당 버전 섹션을 바탕으로 다음 형식으로 정리됩니다.

```md
# 1.0.0

Released: 2026-04-18

## Highlights
- Initial release
```

2단계, 커밋과 push 이후 GitHub Release publish:

```bash
node scripts/release.mjs --version 1.0.0 --publish-github true --skip-prepare true
```

이 단계는 다음을 전제로 합니다.

- release 관련 파일이 이미 커밋되어 있을 것
- 현재 브랜치 HEAD가 upstream에 push되어 있을 것
- 워킹트리가 깨끗할 것

GitHub Release publish 시에는 저장소의 project-local GitHub 인증 파일이 있으면 그 설정을 우선 사용하고, 없으면 현재 `gh` CLI 인증을 사용합니다.

### GitHub Actions 자동 publish

이 저장소에는 `.github/workflows/release.yml`이 포함되어 있습니다.

- 트리거: `v*` 형식 tag push
- 권한: `contents: write`
- 동작: checkout 후 `node scripts/release.mjs --version "${{ github.ref_name }}" --publish-github true --skip-prepare true` 실행

즉, release 파일을 준비해서 커밋/푸시한 뒤 아래처럼 tag를 올리면 GitHub Release가 자동으로 발행됩니다.

```bash
git tag v1.0.0
git push origin v1.0.0
```

기존처럼 수동 publish도 가능하지만, 앞으로 기본 운영 경로는 `release commit -> push -> tag push -> GitHub Actions publish`입니다.

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

`copy` 모드는 대체 경로입니다.

```bash
node scripts/install_skill.mjs --target custom --dest ~/.my-agent/skills --mode copy
```

주의:

- `copy` 모드는 설치된 skill 디렉터리 안에도 의존성 설치가 필요할 수 있습니다.
- 특별한 이유가 없으면 `link` 모드를 사용하세요.

## 빠른 시작

### 1) 로그인 세션 생성 + 미션 후보 수집

```bash
node scripts/discover_missions.mjs \
  --state-dir ./.state/naverpay-profile \
  --out /tmp/naverpay-missions.json \
  --headless true
```

처음 실행이라면 로그인 세션이 없기 때문에 화면 브라우저가 잠깐 열립니다.
그 창에서 로그인만 완료하면, 같은 `--state-dir`에 세션이 저장되고 이후 단계는 headless로 이어집니다.

### 2) JSON 검토

`/tmp/naverpay-missions.json`에서 다음을 확인하세요.

- 자동 클릭하면 안 되는 항목 제거
- `waitSeconds`가 비정상적으로 크거나 작은 항목 제거
- 원하는 카테고리만 남기기

### 3) 검토된 스냅샷 실행

```bash
node scripts/run_missions.mjs \
  --state-dir ./.state/naverpay-profile \
  --missions /tmp/naverpay-missions.json \
  --headless true \
  --max 200 \
  --min-wait-seconds 3 \
  --default-wait-seconds 7
```

## 고급 모드: live discovery 즉시 실행

예전처럼 실시간 수집 후 바로 실행하려면 명시적으로 opt-in 해야 합니다.

```bash
node scripts/run_missions.mjs \
  --state-dir ./.state/naverpay-profile \
  --live-discovery true \
  --headless true \
  --max 200
```

이 모드는 편리하지만, 사람이 검토하지 않은 신규 캠페인도 바로 실행될 수 있습니다.

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
- `--live-discovery <bool>`: reviewed JSON 없이 즉시 수집/실행할지 여부(기본 `false`)
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

무인 실행은 고급 모드입니다. 자동화가 꼭 필요하다면 `--live-discovery true`를 명시해 의도를 드러내세요.

```cron
0 9 * * * cd /path/to/naverpay-point-missions && node scripts/run_missions.mjs --state-dir ./.state/naverpay-profile --live-discovery true --headless true --max 200 >> /tmp/naverpay-profile.log 2>&1
```

검토 기반 자동화가 필요하면, 먼저 `discover` 산출물을 갱신하는 별도 단계가 있어야 합니다.

## 트러블슈팅

- 로그인 타임아웃: `--login-timeout-sec` 증가. `--headless true`였다면 화면 로그인 bootstrap 창에서 먼저 로그인 완료
- `run_missions`가 바로 실패: 기본값이 reviewed mode 이므로 `--missions` 또는 `--live-discovery true` 확인
- `포인트 받기` 버튼 미탐지: UI 변경 가능성 높음, `discover` 재실행 후 JSON 검토
- 일부 캠페인 누락: 페이지 로딩/스크롤 지연 가능성, `--max`를 줄여 재시도
- 이미 참여한 캠페인 반복: `completed-campaigns.json` 경로가 프로필별로 분리됐는지 확인
- 특정 캠페인만 테스트: `--max 1 --dry-run true`로 먼저 매칭 결과 확인

## 운영 권장사항

- 처음에는 소량(`--max 5~10`)으로 검증 후 배치 확장
- 계정별 상태 폴더를 반드시 분리
- 실행 후 네이버페이 내역 페이지에서 적립 결과를 수동 검증
- unattended 실행은 반드시 명시적 opt-in(`--live-discovery true`)으로만 사용
- 서비스 정책/약관 변경 시 즉시 중단 후 로직 점검
