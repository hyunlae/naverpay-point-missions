# Skill Product Hardening Plan

Date: 2026-04-18

## Goal

Turn `naverpay-point-missions` from a useful script bundle into a safer, clearer skill product.

## Priority Order

1. Safety first
   - Default to reviewed execution.
   - Require `discover -> inspect -> run --missions` unless the operator explicitly opts into live discovery.
2. Installation that actually works
   - Treat the cloned repo as the runtime root.
   - Register the skill into each AI runtime via repo-backed linking by default.
   - Keep copy mode as an explicit fallback, not the default.
3. One product story
   - Align `README.md`, `SKILL.md`, and setup docs around the same contract:
     reviewed-by-default, live discovery is advanced, repo-backed install is recommended.

## Scope

- Add an execution guard to `scripts/run_missions.mjs`.
- Redesign `scripts/install_skill.mjs` around `link` mode by default.
- Fix Codex default install path to `~/.codex/skills`.
- Add tests for the new runtime and install policy.
- Rewrite docs to reflect the new operating model.

## Acceptance Criteria

- Running `node scripts/run_missions.mjs` without `--missions` fails with a clear safety message.
- Running with `--live-discovery true` still works for advanced unattended flows.
- `node scripts/install_skill.mjs --target codex --dry-run true` resolves to a Codex-native path.
- Default install mode is repo-backed linking.
- Documentation no longer presents unattended live discovery as the primary workflow.
