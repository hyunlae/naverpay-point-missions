# Agent Manifests

This folder keeps lightweight metadata per AI runtime.

- `openai.yaml`: Codex/OpenAI-oriented manifest
- `claude.yaml`: Claude-compatible metadata
- `gemini.yaml`: Gemini-compatible metadata
- `antigravity.yaml`: Antigravity-compatible metadata

Runtime behavior is shared across all targets through:

- `SKILL.md`
- `scripts/*.mjs`
- `references/*.md`

Recommended install model:

- Register the cloned repo with `node scripts/install_skill.mjs --target <ai> --mode link`
- Keep the repository as the runtime root
- Prefer reviewed mission snapshots over unattended live discovery
