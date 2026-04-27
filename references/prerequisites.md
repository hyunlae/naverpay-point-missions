# 사전 준비 사항

## 필수

- `https://point.pay.naver.com/pc/main`에 접근 가능한 네이버 계정
- 클릭형 포인트 미션 목록 페이지 접근 권한
  - `https://point.pay.naver.com/pc/mission-detail?dataType=placement&pageKey=benefit_group_pp&rankType=RANDOM_DAILY&sortCompletedAdToLast=true&mssCode=pp`
- 브라우저에서 직접 로그인할 수 있는 환경
  - OTP, CAPTCHA, 추가 인증은 수동으로 처리해야 합니다.
- Node.js 18 이상
- Playwright 패키지와 Chromium 브라우저 바이너리

자동 점검/복구:

```bash
node scripts/ensure_runtime.mjs
```

이 명령은 `playwright` 패키지가 없으면 `npm install`을 실행하고, Chromium 캐시가 없으면 `npx playwright install chromium`을 실행합니다. 에이전트나 자동화는 미션 수집/실행 전에 이 명령을 먼저 실행해야 합니다.

수동 설치:

```bash
npm install
npx playwright install chromium
```

- `Cannot find package 'playwright'`가 뜨면 로그인이나 세션 문제가 아니라 의존성 누락입니다.
  - 저장소 루트에서 `node scripts/ensure_runtime.mjs`를 먼저 실행한 뒤 같은 명령을 재시도합니다.

- 안정적인 네트워크와 Chromium 팝업 허용

## 권장

- `node scripts/install_skill.mjs --target <ai> --mode link`로 스킬을 등록해, 클론한 저장소 자체를 런타임 루트로 유지
- 하나의 영속 프로필을 `--state-dir`로 재사용해서 잦은 재로그인을 피하기
- `discover_missions.mjs`와 `run_missions.mjs` 모두 `--headless true`를 지원하지만, 첫 실행에서는 visible 로그인 bootstrap이 잠깐 열릴 수 있다는 점을 이해하기
- 같은 `--state-dir`를 계속 사용하기
  - 첫 실행에는 화면 브라우저가 잠깐 열려 최초 로그인을 마치고, 이후에는 다시 headless로 이어집니다.
- 전체 실행 전에 `--dry-run true`와 `--max 2`로 셀렉터와 매칭 결과를 먼저 검증하기
- 배치 크기는 작게 시작하고, 각 배치 후 적립 내역을 확인하기
- 검토된 JSON을 기본 실행 입력으로 보고, live discovery는 명시적으로 결정하기

## 입력 데이터

- `discover_missions.mjs`가 생성한 미션 스냅샷 JSON
- `run_missions.mjs`는 기본적으로 검토 기반 실행이며, `--missions <path>`가 필요합니다.
  - 검토 없이 즉시 수집/실행하려면 `--live-discovery true`를 명시해야 합니다.
- 선택적 커스텀 키워드
  - 미션 액션: `--keywords 링크,적립,참여,받기`
  - 적립 버튼: `--claim-keywords 포인트 받기,포인트 쉽게 받기`
- 선택적 대기 시간 조정
  - 기본 대기 시간: `--default-wait-seconds 7`
  - 최소 대기 시간: `--min-wait-seconds 3`
  - 최대 대기 시간: `--max-wait-seconds 120`
- 선택적 완료 이력 추적
  - 저장 경로: `--completed-store ./.state/naverpay-profile/completed-campaigns.json`
  - 완료 이력 무시: `--ignore-completed true`

## 예상해야 할 실패 상황

- 로그인 세션 만료 또는 CAPTCHA 발생
- 선택한 `--state-dir`에 저장된 세션이 없어서 `--headless true` 실행 시 1회 visible 로그인 bootstrap이 열리는 경우
- UI 라벨이나 DOM 구조가 바뀌어 버튼 매칭이 깨지는 경우
- 미션별 제한 조건 미충족
  - 일일 한도, 참여 자격, 쿨다운 등

이런 상황이 생기면 자동화를 멈추고, 열린 브라우저에서 먼저 수동으로 확인한 뒤 discovery를 다시 갱신하는 것이 맞습니다.

추가로, 실행이 브라우저 시작 전 `ERR_MODULE_NOT_FOUND`로 종료되면 사이트 이슈를 의심하기보다 로컬 의존성 설치 상태부터 확인하는 것이 맞습니다.
