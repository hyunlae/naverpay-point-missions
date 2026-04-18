# 에이전트 매니페스트

이 폴더는 각 AI 런타임별 경량 메타데이터를 보관합니다.

- `openai.yaml`: Codex/OpenAI 계열 메타데이터
- `claude.yaml`: Claude 호환 메타데이터
- `gemini.yaml`: Gemini 호환 메타데이터
- `antigravity.yaml`: Antigravity 호환 메타데이터

실제 런타임 동작은 모든 타깃에서 아래 파일을 공통으로 사용합니다.

- `SKILL.md`
- `scripts/*.mjs`
- `references/*.md`

권장 설치 모델:

- 클론한 저장소를 `node scripts/install_skill.mjs --target <ai> --mode link`로 등록
- 저장소 자체를 런타임 루트로 유지
- 실시간 무인 실행보다 검토된 미션 스냅샷 실행을 우선
- 같은 `--state-dir`를 재사용해서 저장된 로그인 세션을 유지
- `--headless true`인데 저장된 세션이 없으면, 1회 visible 로그인 bootstrap 후 다시 headless로 재개됨을 전제로 운영
