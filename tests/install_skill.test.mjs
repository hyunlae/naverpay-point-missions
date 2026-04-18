import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readlink, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  DEFAULT_INSTALL_MODE,
  INSTALL_ITEMS,
  SKILL_NAME,
  main as installSkillMain,
  normalizeTargets,
  resolveCodexBaseDir,
  resolveInstallBaseDir,
  resolveInstallMode,
} from "../scripts/install_skill.mjs";

test("install_skill defaults to link mode", () => {
  assert.equal(resolveInstallMode(), DEFAULT_INSTALL_MODE);
});

test("install_skill maps openai target to codex", () => {
  assert.deepEqual(normalizeTargets("openai"), ["codex"]);
});

test("install_skill resolves codex path to ~/.codex/skills by default", () => {
  const resolved = resolveCodexBaseDir({ HOME: "/tmp/example-home" });
  assert.equal(resolved, path.resolve("/tmp/example-home", ".codex", "skills"));
});

test("install_skill respects CODEX_HOME when provided", () => {
  const resolved = resolveInstallBaseDir("codex", "", {
    HOME: "/tmp/example-home",
    CODEX_HOME: "/tmp/custom-codex",
  });
  assert.equal(resolved, path.resolve("/tmp/custom-codex", "skills"));
});

test("copy mode includes package metadata", () => {
  assert.ok(INSTALL_ITEMS.includes("package.json"));
  assert.ok(INSTALL_ITEMS.includes("package-lock.json"));
});

test("install_skill copy mode performs a real smoke install", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "naverpay-copy-install-"));
  await installSkillMain([
    "--target",
    "custom",
    "--dest",
    tempRoot,
    "--mode",
    "copy",
  ]);

  const installDir = path.join(tempRoot, SKILL_NAME);
  const packageStat = await stat(path.join(installDir, "package.json"));
  const scriptStat = await stat(path.join(installDir, "scripts", "run_missions.mjs"));

  assert.equal(packageStat.isFile(), true);
  assert.equal(scriptStat.isFile(), true);
});

test("install_skill link mode creates a repo-backed link", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "naverpay-link-install-"));
  await installSkillMain([
    "--target",
    "custom",
    "--dest",
    tempRoot,
    "--mode",
    "link",
  ]);

  const installDir = path.join(tempRoot, SKILL_NAME);
  const linkedTarget = await readlink(installDir);

  assert.ok(linkedTarget.length > 0);
});
