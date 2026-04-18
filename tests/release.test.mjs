import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  formatChangelogEntry,
  isSemver,
  prepareRelease,
} from "../scripts/release.mjs";

test("isSemver accepts stable semver versions", () => {
  assert.equal(isSemver("1.0.0"), true);
  assert.equal(isSemver("1.2.3-beta.1"), true);
});

test("isSemver rejects invalid versions", () => {
  assert.equal(isSemver("1.0"), false);
  assert.equal(isSemver("v1.0.0"), false);
});

test("formatChangelogEntry creates an initial release section", () => {
  const entry = formatChangelogEntry({
    version: "1.0.0",
    date: "2026-04-18",
    notes: ["Initial release"],
  });

  assert.match(entry, /## 1\.0\.0 - 2026-04-18/);
  assert.match(entry, /- Initial release/);
});

test("prepareRelease writes VERSION, package.json, and CHANGELOG for the first release", async () => {
  const repoDir = await mkdtemp(path.join(os.tmpdir(), "naverpay-release-"));
  await writeFile(
    path.join(repoDir, "package.json"),
    JSON.stringify(
      {
        name: "naverpay-point-missions",
        scripts: { test: "node --test" },
      },
      null,
      2,
    ),
    "utf8",
  );

  const result = await prepareRelease({
    repoDir,
    version: "1.0.0",
    date: "2026-04-18",
    notes: ["Initial release"],
  });

  const versionFile = await readFile(path.join(repoDir, "VERSION"), "utf8");
  const changelog = await readFile(path.join(repoDir, "CHANGELOG.md"), "utf8");
  const packageJson = JSON.parse(await readFile(path.join(repoDir, "package.json"), "utf8"));

  assert.equal(versionFile.trim(), "1.0.0");
  assert.equal(packageJson.version, "1.0.0");
  assert.match(changelog, /## 1\.0\.0 - 2026-04-18/);
  assert.match(changelog, /- Initial release/);
  assert.equal(result.version, "1.0.0");
});

test("prepareRelease replaces an existing changelog entry for the same version", async () => {
  const repoDir = await mkdtemp(path.join(os.tmpdir(), "naverpay-release-"));
  await writeFile(
    path.join(repoDir, "package.json"),
    JSON.stringify(
      {
        name: "naverpay-point-missions",
        version: "1.0.0",
        scripts: { test: "node --test" },
      },
      null,
      2,
    ),
    "utf8",
  );
  await writeFile(
    path.join(repoDir, "CHANGELOG.md"),
    "# Changelog\n\n## 1.0.0 - 2026-04-17\n- Old note\n",
    "utf8",
  );

  await prepareRelease({
    repoDir,
    version: "1.0.0",
    date: "2026-04-18",
    notes: ["Initial release"],
  });

  const changelog = await readFile(path.join(repoDir, "CHANGELOG.md"), "utf8");
  assert.equal((changelog.match(/## 1\.0\.0 - /g) || []).length, 1);
  assert.match(changelog, /## 1\.0\.0 - 2026-04-18/);
  assert.doesNotMatch(changelog, /- Old note/);
});
