import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { DISCOVER_USAGE_TEXT } from "../scripts/discover_missions.mjs";
import { INSTALL_USAGE_TEXT } from "../scripts/install_skill.mjs";
import { RELEASE_USAGE_TEXT } from "../scripts/release.mjs";
import { REVIEWED_EXECUTION_REQUIRED_MESSAGE, RUN_USAGE_TEXT } from "../scripts/run_missions.mjs";

async function readUtf8(filePath) {
  return readFile(new URL(`../${filePath}`, import.meta.url), "utf8");
}

test("README promotes the Codex quick-start path before ecosystem and release docs", async () => {
  const readme = await readUtf8("README.md");
  const quickStartIndex = readme.indexOf("## 3분 빠른 시작");
  const codexInstallIndex = readme.indexOf("node scripts/install_skill.mjs --target codex --mode link");
  const skillsIndex = readme.indexOf("## skills.sh");
  const releaseIndex = readme.indexOf("## 릴리스");

  assert.ok(quickStartIndex >= 0, "README should expose a dedicated quick-start section");
  assert.ok(codexInstallIndex >= 0, "README should recommend the repo-backed Codex install path");
  assert.ok(skillsIndex >= 0, "README should still describe the skills.sh ecosystem");
  assert.ok(releaseIndex >= 0, "README should still document releases");
  assert.ok(quickStartIndex < skillsIndex, "Quick start should appear before marketplace guidance");
  assert.ok(quickStartIndex < releaseIndex, "Quick start should appear before release engineering details");
  assert.ok(codexInstallIndex < skillsIndex, "Codex install guidance should appear before skills.sh guidance");
});

test("README includes a dry-run smoke path before real mission execution", async () => {
  const readme = await readUtf8("README.md");
  const smokeIndex = readme.indexOf("--dry-run true");
  const realRunIndex = readme.indexOf("### 4) 실제 실행");

  assert.ok(smokeIndex >= 0, "README should show a dry-run command for first verification");
  assert.ok(realRunIndex >= 0, "README should split dry-run from real execution");
  assert.ok(smokeIndex < realRunIndex, "Dry-run guidance should come before the real run command");
});

test("public docs and package metadata are Korean-first", async () => {
  const skillDoc = await readUtf8("SKILL.md");
  const prerequisites = await readUtf8("references/prerequisites.md");
  const agentReadme = await readUtf8("agents/README.md");
  const openaiManifest = await readUtf8("agents/openai.yaml");
  const packageJson = JSON.parse(await readUtf8("package.json"));

  assert.match(skillDoc, /네이버페이 포인트 미션/);
  assert.match(skillDoc, /최초 로그인/);
  assert.match(prerequisites, /사전 준비 사항/);
  assert.match(agentReadme, /에이전트 매니페스트/);
  assert.match(openaiManifest, /네이버페이 포인트 미션/);
  assert.match(openaiManifest, /검토 기반 실행/);
  assert.match(packageJson.description, /네이버페이/);
});

test("CLI usage text is Korean-first across the main entry points", () => {
  for (const usageText of [
    DISCOVER_USAGE_TEXT,
    RUN_USAGE_TEXT,
    INSTALL_USAGE_TEXT,
    RELEASE_USAGE_TEXT,
  ]) {
    assert.match(usageText, /사용법/);
    assert.match(usageText, /옵션/);
  }

  assert.match(RUN_USAGE_TEXT, /--dry-run <true\|false>\s+실제 클릭 없이/);
  assert.match(REVIEWED_EXECUTION_REQUIRED_MESSAGE, /검토된 JSON/);
});
