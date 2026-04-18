#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  DEFAULT_AUTH_FILE,
  loadGitHubAuthFile,
  parseGitHubRemote,
} from "./project_github_auth.mjs";

const execFileAsync = promisify(execFile);
const RELEASE_TITLE = "# Changelog\n\n";

export function isSemver(version) {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(String(version ?? "").trim());
}

export function formatChangelogEntry({ version, date, notes }) {
  const normalizedNotes = Array.isArray(notes)
    ? notes.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const lines = [`## ${version} - ${date}`];
  if (normalizedNotes.length === 0) {
    lines.push("- Release prepared");
  } else {
    lines.push(...normalizedNotes.map((note) => `- ${note}`));
  }
  return `${lines.join("\n")}\n`;
}

function splitChangelogSections(body) {
  const normalizedBody = String(body ?? "").trimStart();
  if (!normalizedBody) {
    return [];
  }

  const lines = normalizedBody.split("\n");
  const sections = [];
  let currentSection = [];

  for (const line of lines) {
    if (line.startsWith("## ") && currentSection.length > 0) {
      sections.push(currentSection.join("\n").trimEnd());
      currentSection = [line];
      continue;
    }

    currentSection.push(line);
  }

  if (currentSection.length > 0) {
    sections.push(currentSection.join("\n").trimEnd());
  }

  return sections;
}

function removeVersionSections(body, version) {
  return splitChangelogSections(body)
    .filter((section) => !section.startsWith(`## ${version} - `))
    .join("\n\n")
    .trimStart();
}

function normalizeChangelogBody(content) {
  return String(content ?? "").startsWith("# Changelog\n")
    ? String(content).slice("# Changelog\n".length).replace(/^\n*/, "")
    : String(content ?? "");
}

function parseCliArgs(argv) {
  const args = { _: [] };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      args._.push(token);
      continue;
    }

    const eqPos = token.indexOf("=");
    if (eqPos >= 0) {
      const key = token.slice(2, eqPos);
      args[key] = token.slice(eqPos + 1);
      continue;
    }

    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = "true";
    }
  }

  return args;
}

function getStringArg(args, key, defaultValue = "") {
  const value = args[key];
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }
  return String(value);
}

function getBooleanArg(args, key, defaultValue = false) {
  const value = args[key];
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y", "on"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "n", "off"].includes(normalized)) {
    return false;
  }

  throw new Error(`--${key} expects true/false`);
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeNotes(notes) {
  return Array.isArray(notes)
    ? notes.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function formatReleaseNotesBody(notes) {
  const normalizedNotes = normalizeNotes(notes);
  if (normalizedNotes.length === 0) {
    return "- Release prepared";
  }
  return normalizedNotes
    .map((note) => (note.startsWith("- ") ? note : `- ${note}`))
    .join("\n");
}

function normalizeRepoSlug(remotePath) {
  return String(remotePath || "").replace(/^\/+/, "").replace(/\.git$/, "");
}

async function updatePackageJson(packageJsonPath, version) {
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  packageJson.version = version;
  await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
}

async function updatePackageLockJson(packageLockPath, version) {
  let packageLock;
  try {
    packageLock = JSON.parse(await readFile(packageLockPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }

  packageLock.version = version;
  if (packageLock.packages?.[""]) {
    packageLock.packages[""].version = version;
  }

  await writeFile(packageLockPath, `${JSON.stringify(packageLock, null, 2)}\n`, "utf8");
  return true;
}

async function updateVersionFile(versionFilePath, version) {
  await writeFile(versionFilePath, `${version}\n`, "utf8");
}

async function updateChangelog(changelogPath, version, date, notes) {
  let existing = "";
  try {
    existing = await readFile(changelogPath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  const body = normalizeChangelogBody(existing);
  const entry = formatChangelogEntry({ version, date, notes });
  const normalizedBody = removeVersionSections(body, version);
  const next = `${RELEASE_TITLE}${entry}\n${normalizedBody}`.replace(/\n{3,}/g, "\n\n");
  await writeFile(changelogPath, next.endsWith("\n") ? next : `${next}\n`, "utf8");
}

export function extractReleaseNotes(changelogContent, version) {
  const body = normalizeChangelogBody(changelogContent);
  const section = splitChangelogSections(body).find((item) =>
    item.startsWith(`## ${version} - `),
  );

  if (!section) {
    throw new Error(`Release notes for version ${version} were not found in CHANGELOG.md`);
  }

  return section
    .split("\n")
    .slice(1)
    .join("\n")
    .trim();
}

async function execGit(repoDir, args) {
  const { stdout } = await execFileAsync("git", args, {
    cwd: repoDir,
    encoding: "utf8",
  });
  return stdout;
}

async function execGh({ cwd, args, env, input }) {
  const { stdout } = await execFileAsync("gh", args, {
    cwd,
    encoding: "utf8",
    env,
    input,
  });
  return stdout;
}

async function loadOptionalProjectAuth(authFile, authLoader) {
  try {
    return await authLoader(authFile);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function buildGitHubEnv(baseEnv, authConfig) {
  const env = { ...baseEnv };
  if (authConfig?.githubToken) {
    env.GH_TOKEN = authConfig.githubToken;
  }
  if (authConfig?.host) {
    env.GH_HOST = authConfig.host;
  }
  return env;
}

function normalizeTagName(version, tagName) {
  return String(tagName || `v${version}`).trim();
}

export async function prepareRelease(options = {}) {
  const repoDir = path.resolve(options.repoDir || process.cwd());
  const version = String(options.version || "").trim();
  const date = String(options.date || todayIsoDate()).trim();
  const notes = normalizeNotes(options.notes);

  if (!isSemver(version)) {
    throw new Error(`Invalid semver version: ${version}`);
  }

  const packageJsonPath = path.join(repoDir, "package.json");
  const packageLockPath = path.join(repoDir, "package-lock.json");
  const versionFilePath = path.join(repoDir, "VERSION");
  const changelogPath = path.join(repoDir, "CHANGELOG.md");

  await updatePackageJson(packageJsonPath, version);
  await updatePackageLockJson(packageLockPath, version);
  await updateVersionFile(versionFilePath, version);
  await updateChangelog(changelogPath, version, date, notes);

  return {
    version,
    date,
    changelogPath,
    packageJsonPath,
    packageLockPath,
    versionFilePath,
  };
}

export async function publishGitHubRelease(options = {}) {
  const repoDir = path.resolve(options.repoDir || process.cwd());
  const version = String(options.version || "").trim();
  const gitRunner = options.gitRunner || execGit;
  const ghRunner = options.ghRunner || execGh;
  const authLoader = options.authLoader || loadGitHubAuthFile;
  const remoteName = String(options.remoteName || "origin").trim();
  const authFile = path.resolve(repoDir, options.authFile || DEFAULT_AUTH_FILE);

  if (!isSemver(version)) {
    throw new Error(`Invalid semver version: ${version}`);
  }

  const gitStatus = String(await gitRunner(repoDir, ["status", "--porcelain"])).trim();
  if (gitStatus) {
    throw new Error(
      "GitHub release publish requires a clean worktree. Commit and push the release files first.",
    );
  }

  const headSha = String(await gitRunner(repoDir, ["rev-parse", "HEAD"])).trim();
  let upstreamSha = "";
  try {
    upstreamSha = String(await gitRunner(repoDir, ["rev-parse", "@{u}"])).trim();
  } catch (error) {
    throw new Error(
      "Current branch has no upstream. Push the release commit before publishing GitHub release.",
    );
  }

  if (headSha !== upstreamSha) {
    throw new Error(
      "Current HEAD is not pushed to the upstream branch. Push before publishing GitHub release.",
    );
  }

  const remoteUrl = String(
    options.remoteUrl || (await gitRunner(repoDir, ["remote", "get-url", remoteName])),
  ).trim();
  const remote = parseGitHubRemote(remoteUrl);
  const authConfig =
    options.authConfig || (await loadOptionalProjectAuth(authFile, authLoader));
  const repo = normalizeRepoSlug(options.repo || authConfig?.path || remote.path);
  const env = buildGitHubEnv(options.env || process.env, authConfig);
  const tagName = normalizeTagName(version, options.tagName);
  const changelogPath = path.join(repoDir, "CHANGELOG.md");
  const changelogContent =
    options.changelogContent || (await readFile(changelogPath, "utf8"));
  const notesBody = normalizeNotes(options.notes).length
    ? formatReleaseNotesBody(options.notes)
    : extractReleaseNotes(changelogContent, version);

  let releaseExists = false;
  try {
    await ghRunner({
      cwd: repoDir,
      args: ["release", "view", tagName, "--repo", repo],
      env,
    });
    releaseExists = true;
  } catch (error) {
    if (error?.exitCode !== 1 && error?.code !== 1) {
      throw error;
    }
  }

  const releaseArgs = releaseExists
    ? [
        "release",
        "edit",
        tagName,
        "--repo",
        repo,
        "--title",
        version,
        "--notes",
        notesBody,
        "--latest",
      ]
    : [
        "release",
        "create",
        tagName,
        "--repo",
        repo,
        "--title",
        version,
        "--target",
        headSha,
        "--notes",
        notesBody,
        "--latest",
      ];

  await ghRunner({
    cwd: repoDir,
    args: releaseArgs,
    env,
  });

  return {
    version,
    repo,
    tagName,
    notesBody,
    releaseExists,
  };
}

function printUsage() {
  console.log(`Usage:
  node scripts/release.mjs --version <semver> [options]

Modes:
  default                                 Prepare VERSION, package metadata, and CHANGELOG
  --publish-github true --skip-prepare true
                                          Publish an existing release commit to GitHub Release

Options:
  --version <semver>                      Release version to prepare or publish
  --date <YYYY-MM-DD>                     Release date (default: today)
  --notes <text>                          Release note line (semicolon-separated)
  --publish-github <bool>                 Publish to GitHub Release (default: false)
  --skip-prepare <bool>                   Skip local file updates and publish only
  --help                                  Show this help
`);
}

async function main(rawArgs = process.argv.slice(2)) {
  const args = parseCliArgs(rawArgs);
  if (args.help) {
    printUsage();
    return;
  }

  const version = getStringArg(args, "version", "");
  const notes = getStringArg(args, "notes", "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
  const publishGithub = getBooleanArg(args, "publish-github", false);
  const skipPrepare = getBooleanArg(args, "skip-prepare", false);

  if (publishGithub && !skipPrepare) {
    throw new Error(
      "GitHub release publish is a second step. Commit and push the prepared release, then rerun with --publish-github true --skip-prepare true.",
    );
  }

  if (!skipPrepare) {
    const prepared = await prepareRelease({
      version,
      date: getStringArg(args, "date", todayIsoDate()),
      notes,
    });

    console.log(`[release] version=${prepared.version}`);
    console.log(`[release] date=${prepared.date}`);
    console.log("[release] mode=prepare");
    console.log("[release] status=ok");
    return;
  }

  if (publishGithub) {
    const published = await publishGitHubRelease({
      version,
      notes,
    });

    console.log(`[release] version=${published.version}`);
    console.log(`[release] tag=${published.tagName}`);
    console.log(`[release] repo=${published.repo}`);
    console.log("[release] mode=publish-github");
    console.log("[release] status=ok");
    return;
  }

  throw new Error("Nothing to do. Use default prepare mode or --publish-github true.");
}

const isEntrypoint =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  main().catch((error) => {
    console.error(`[release] failed: ${error.message}`);
    process.exit(1);
  });
}
