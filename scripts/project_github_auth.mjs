#!/usr/bin/env node

import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_AUTH_FILE = ".project-local/github-auth.env";
export const DEFAULT_REMOTE_NAME = "origin";
export const DEFAULT_GITHUB_HOST = "github.com";
export const HELPER_SCRIPT_PATH = path.resolve(SCRIPT_DIR, "git-credential-project-github.mjs");

function shellEscape(value) {
  return `'${String(value ?? "").replace(/'/g, `'\\''`)}'`;
}

export function parseGitHubRemote(remoteUrl) {
  const raw = String(remoteUrl ?? "").trim();
  if (!raw) {
    throw new Error("Remote URL is required.");
  }

  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    const parsed = new URL(raw);
    return {
      host: parsed.host,
      path: parsed.pathname.replace(/^\/+/, ""),
    };
  }

  const gitSshMatch = raw.match(/^git@([^:]+):(.+)$/);
  if (gitSshMatch) {
    return {
      host: gitSshMatch[1],
      path: gitSshMatch[2].replace(/^\/+/, ""),
    };
  }

  const sshMatch = raw.match(/^ssh:\/\/git@([^/]+)\/(.+)$/);
  if (sshMatch) {
    return {
      host: sshMatch[1],
      path: sshMatch[2].replace(/^\/+/, ""),
    };
  }

  throw new Error(`Unsupported GitHub remote URL: ${remoteUrl}`);
}

export function parseCredentialRequest(stdinPayload) {
  const request = {};
  const lines = String(stdinPayload ?? "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd());

  for (const line of lines) {
    if (!line) {
      continue;
    }
    const separatorIndex = line.indexOf("=");
    if (separatorIndex < 0) {
      continue;
    }
    const key = line.slice(0, separatorIndex);
    const value = line.slice(separatorIndex + 1);
    request[key] = value;
  }

  return request;
}

export function resolveCredentialResponse(request, authConfig) {
  if (!request || !authConfig) {
    return null;
  }
  if (String(request.protocol || "").trim() !== "https") {
    return null;
  }
  if (String(request.host || "").trim() !== String(authConfig.host || "").trim()) {
    return null;
  }
  if (String(request.path || "").trim() !== String(authConfig.path || "").trim()) {
    return null;
  }
  if (!authConfig.githubUsername || !authConfig.githubToken) {
    return null;
  }

  return {
    username: authConfig.githubUsername,
    password: authConfig.githubToken,
  };
}

export function renderGitHubAuthFile(authConfig) {
  return [
    `GITHUB_HOST=${authConfig.host}`,
    `GITHUB_PATH=${authConfig.path}`,
    `GITHUB_USERNAME=${authConfig.githubUsername}`,
    `GITHUB_TOKEN=${authConfig.githubToken}`,
    "",
  ].join("\n");
}

export function buildCredentialHelperCommand(options) {
  const {
    nodePath = process.execPath,
    helperScriptPath = HELPER_SCRIPT_PATH,
    authFile,
    host,
    path: remotePath,
  } = options;

  if (!authFile || !host || !remotePath) {
    throw new Error("authFile, host, and path are required to build the credential helper.");
  }

  return `!f() { ${shellEscape(nodePath)} ${shellEscape(helperScriptPath)} --auth-file ${shellEscape(authFile)} --host ${shellEscape(host)} --path ${shellEscape(remotePath)} "$@"; }; f`;
}

export function resolveGitHubTokenInput(tokenEnvInput, env = process.env) {
  const raw = String(tokenEnvInput ?? "").trim();
  if (!raw) {
    return "";
  }
  if (raw === "true") {
    throw new Error(
      "--github-token-env did not receive a value. If you used $VARNAME, pass the env var name without $ or use --github-token \"$VARNAME\".",
    );
  }

  const envValue = String(env[raw] || "").trim();
  if (envValue) {
    return envValue;
  }

  return raw;
}

async function git(repoDir, args) {
  return execFileAsync("git", args, { cwd: repoDir, encoding: "utf8" });
}

async function readRemoteUrl(repoDir, remoteName) {
  const { stdout } = await git(repoDir, ["remote", "get-url", remoteName]);
  return stdout.trim();
}

async function setLocalGitConfig(repoDir, key, value, mode = "set") {
  const args = ["config", "--local"];
  if (mode === "replace-all") {
    args.push("--replace-all");
  } else if (mode === "add") {
    args.push("--add");
  }
  args.push(key, value);
  await git(repoDir, args);
}

export async function loadGitHubAuthFile(authFile) {
  const raw = await readFile(authFile, "utf8");
  const parsed = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) {
      continue;
    }
    const separatorIndex = line.indexOf("=");
    if (separatorIndex < 0) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    parsed[key] = value;
  }

  return {
    host: parsed.GITHUB_HOST || "",
    path: parsed.GITHUB_PATH || "",
    githubUsername: parsed.GITHUB_USERNAME || "",
    githubToken: parsed.GITHUB_TOKEN || "",
  };
}

export async function setupProjectGitHubAuth(options = {}) {
  const repoDir = path.resolve(options.repoDir || process.cwd());
  const remoteName = String(options.remoteName || DEFAULT_REMOTE_NAME);
  const remoteUrl = options.remoteUrl || (await readRemoteUrl(repoDir, remoteName));
  const remote = parseGitHubRemote(remoteUrl);
  const githubHost = options.githubHost || remote.host || DEFAULT_GITHUB_HOST;
  const githubPath = options.githubPath || remote.path;
  const githubUsername = String(options.githubUsername || "").trim();
  const githubToken = String(options.githubToken || "").trim();
  const gitUserName = String(options.gitUserName || "").trim();
  const gitUserEmail = String(options.gitUserEmail || "").trim();

  if (!githubUsername) {
    throw new Error("--github-username is required.");
  }
  if (!githubToken) {
    throw new Error("A GitHub token is required.");
  }

  const authFile = path.resolve(repoDir, options.authFile || DEFAULT_AUTH_FILE);
  await mkdir(path.dirname(authFile), { recursive: true });
  await writeFile(
    authFile,
    renderGitHubAuthFile({
      host: githubHost,
      path: githubPath,
      githubUsername,
      githubToken,
    }),
    "utf8",
  );
  try {
    await chmod(authFile, 0o600);
  } catch {
    // Best-effort only on platforms that support chmod semantics.
  }

  const helperCommand = buildCredentialHelperCommand({
    authFile,
    host: githubHost,
    path: githubPath,
  });

  await setLocalGitConfig(repoDir, "credential.useHttpPath", "true");
  await setLocalGitConfig(repoDir, "credential.helper", "", "replace-all");
  await setLocalGitConfig(repoDir, "credential.helper", helperCommand, "add");

  if (gitUserName) {
    await setLocalGitConfig(repoDir, "user.name", gitUserName);
  }
  if (gitUserEmail) {
    await setLocalGitConfig(repoDir, "user.email", gitUserEmail);
  }

  return {
    authFile,
    helperCommand,
    host: githubHost,
    path: githubPath,
    remoteName,
    remoteUrl,
  };
}
