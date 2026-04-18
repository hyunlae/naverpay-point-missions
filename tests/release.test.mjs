import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  extractReleaseNotes,
  formatChangelogEntry,
  isSemver,
  publishGitHubRelease,
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
  await writeFile(
    path.join(repoDir, "package-lock.json"),
    JSON.stringify(
      {
        name: "naverpay-point-missions",
        version: "0.0.0",
        lockfileVersion: 3,
        packages: {
          "": {
            version: "0.0.0",
          },
        },
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
  const packageLock = JSON.parse(await readFile(path.join(repoDir, "package-lock.json"), "utf8"));

  assert.equal(versionFile.trim(), "1.0.0");
  assert.equal(packageJson.version, "1.0.0");
  assert.equal(packageLock.version, "1.0.0");
  assert.equal(packageLock.packages[""].version, "1.0.0");
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

test("extractReleaseNotes returns the notes for one changelog section", () => {
  const notes = extractReleaseNotes(
    "# Changelog\n\n## 1.0.0 - 2026-04-18\n- Initial release\n- Login bootstrap\n\n## 0.9.0 - 2026-04-10\n- Preview\n",
    "1.0.0",
  );

  assert.equal(notes, "- Initial release\n- Login bootstrap");
});

test("publishGitHubRelease creates a GitHub release using repo-local auth when available", async () => {
  const repoDir = await mkdtemp(path.join(os.tmpdir(), "naverpay-release-"));
  await writeFile(
    path.join(repoDir, "CHANGELOG.md"),
    "# Changelog\n\n## 1.0.0 - 2026-04-18\n- Initial release\n",
    "utf8",
  );

  const gitCalls = [];
  const ghCalls = [];
  const result = await publishGitHubRelease({
    repoDir,
    version: "1.0.0",
    gitRunner: async (cwd, args) => {
      gitCalls.push({ cwd, args });
      if (args.join(" ") === "status --porcelain") {
        return "";
      }
      if (args.join(" ") === "remote get-url origin") {
        return "https://github.com/hyunlae/naverpay-point-missions.git\n";
      }
      if (args.join(" ") === "rev-parse HEAD") {
        return "abc123\n";
      }
      if (args.join(" ") === "rev-parse @{u}") {
        return "abc123\n";
      }
      throw new Error(`Unexpected git args: ${args.join(" ")}`);
    },
    ghRunner: async ({ args, env, input }) => {
      ghCalls.push({ args, env, input });
      if (args[0] === "release" && args[1] === "view") {
        const error = new Error("not found");
        error.exitCode = 1;
        throw error;
      }
      return "";
    },
    authLoader: async () => ({
      host: "github.com",
      path: "hyunlae/naverpay-point-missions.git",
      githubUsername: "hyunlae",
      githubToken: "token-123",
    }),
  });

  assert.equal(result.tagName, "v1.0.0");
  assert.equal(result.repo, "hyunlae/naverpay-point-missions");
  assert.equal(ghCalls.length, 2);
  assert.deepEqual(ghCalls[0].args, [
    "release",
    "view",
    "v1.0.0",
    "--repo",
    "hyunlae/naverpay-point-missions",
  ]);
  assert.deepEqual(ghCalls[1].args, [
    "release",
    "create",
    "v1.0.0",
    "--repo",
    "hyunlae/naverpay-point-missions",
    "--title",
    "1.0.0",
    "--target",
    "abc123",
    "--notes-file",
    "-",
    "--latest",
  ]);
  assert.equal(ghCalls[1].env.GH_TOKEN, "token-123");
  assert.equal(ghCalls[1].env.GH_HOST, "github.com");
  assert.equal(ghCalls[1].input, "- Initial release");
});
