import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import {
  buildCredentialHelperCommand,
  parseCredentialRequest,
  parseGitHubRemote,
  resolveCredentialResponse,
  resolveGitHubTokenInput,
  setupProjectGitHubAuth,
} from "../scripts/project_github_auth.mjs";

const execFileAsync = promisify(execFile);

test("parseGitHubRemote supports https remotes", () => {
  assert.deepEqual(parseGitHubRemote("https://github.com/hyunlae/naverpay-point-missions.git"), {
    host: "github.com",
    path: "hyunlae/naverpay-point-missions.git",
  });
});

test("parseGitHubRemote supports git@ ssh remotes", () => {
  assert.deepEqual(parseGitHubRemote("git@github.com:hyunlae/naverpay-point-missions.git"), {
    host: "github.com",
    path: "hyunlae/naverpay-point-missions.git",
  });
});

test("parseCredentialRequest parses git credential stdin payload", () => {
  assert.deepEqual(
    parseCredentialRequest("protocol=https\nhost=github.com\npath=hyunlae/naverpay-point-missions.git\n\n"),
    {
      protocol: "https",
      host: "github.com",
      path: "hyunlae/naverpay-point-missions.git",
    },
  );
});

test("resolveCredentialResponse only returns credentials for the configured repo path", () => {
  const authConfig = {
    githubUsername: "project-user",
    githubToken: "project-token",
    host: "github.com",
    path: "hyunlae/naverpay-point-missions.git",
  };

  assert.deepEqual(
    resolveCredentialResponse(
      { protocol: "https", host: "github.com", path: "hyunlae/naverpay-point-missions.git" },
      authConfig,
    ),
    { username: "project-user", password: "project-token" },
  );

  assert.equal(
    resolveCredentialResponse(
      { protocol: "https", host: "github.com", path: "someone-else/other-repo.git" },
      authConfig,
    ),
    null,
  );
});

test("buildCredentialHelperCommand wires the repo-local auth file and helper script", () => {
  const helperCommand = buildCredentialHelperCommand({
    nodePath: "/usr/local/bin/node",
    helperScriptPath: "/repo/scripts/git-credential-project-github.mjs",
    authFile: "/repo/.project-local/github-auth.env",
    host: "github.com",
    path: "hyunlae/naverpay-point-missions.git",
  });

  assert.match(helperCommand, /git-credential-project-github\.mjs/);
  assert.match(helperCommand, /github-auth\.env/);
  assert.match(helperCommand, /hyunlae\/naverpay-point-missions\.git/);
  assert.match(helperCommand, /^!f\(\)/);
});

test("resolveGitHubTokenInput accepts an env var name", () => {
  assert.equal(
    resolveGitHubTokenInput("NAVERPAY_PROJECT_GITHUB_TOKEN", {
      NAVERPAY_PROJECT_GITHUB_TOKEN: "ghp_from_env_name",
    }),
    "ghp_from_env_name",
  );
});

test("resolveGitHubTokenInput accepts an already-expanded token value", () => {
  assert.equal(
    resolveGitHubTokenInput("ghp_from_shell_expansion", {}),
    "ghp_from_shell_expansion",
  );
});

test("resolveGitHubTokenInput rejects missing env expansions with a helpful error", () => {
  assert.throws(
    () => resolveGitHubTokenInput("true", {}),
    /env var name without \$|use --github-token/i,
  );
});

test("setupProjectGitHubAuth writes ignored auth file and repo-local git config", async () => {
  const repoDir = await mkdtemp(path.join(os.tmpdir(), "naverpay-github-auth-"));
  await execFileAsync("git", ["init"], { cwd: repoDir });
  await execFileAsync("git", ["remote", "add", "origin", "https://github.com/hyunlae/naverpay-point-missions.git"], {
    cwd: repoDir,
  });

  const result = await setupProjectGitHubAuth({
    repoDir,
    githubUsername: "project-user",
    githubToken: "project-token",
    gitUserName: "Project User",
    gitUserEmail: "project@example.com",
  });

  const authFile = await readFile(result.authFile, "utf8");
  assert.match(authFile, /GITHUB_USERNAME=project-user/);
  assert.match(authFile, /GITHUB_TOKEN=project-token/);

  const { stdout: useHttpPath } = await execFileAsync("git", ["config", "--local", "--get", "credential.useHttpPath"], {
    cwd: repoDir,
  });
  assert.equal(useHttpPath.trim(), "true");

  const { stdout: helperValues } = await execFileAsync("git", ["config", "--local", "--get-all", "credential.helper"], {
    cwd: repoDir,
  });
  assert.match(helperValues, /git-credential-project-github\.mjs/);

  const { stdout: localUserName } = await execFileAsync("git", ["config", "--local", "--get", "user.name"], {
    cwd: repoDir,
  });
  assert.equal(localUserName.trim(), "Project User");
});
