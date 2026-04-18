#!/usr/bin/env node

import { cp, lstat, mkdir, rm, stat, symlink } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const SKILL_NAME = "naverpay-point-missions";
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_TARGETS = ["codex", "claude", "gemini", "antigravity"];
const CUSTOM_TARGETS = ["custom", "other"];
export const DEFAULT_INSTALL_MODE = "link";
export const INSTALL_ITEMS = [
  "SKILL.md",
  "README.md",
  "package.json",
  "package-lock.json",
  "scripts",
  "references",
  "agents",
];

function printUsage() {
  console.log(`Usage:
  node scripts/install_skill.mjs [options]

Options:
  --target <name|csv>         codex|openai|claude|gemini|antigravity|custom|all (default: all)
  --mode <link|copy>          Install mode (default: link)
  --dest <path>               Override destination base directory (single target only)
  --skill-name <name>         Override installed folder name (default: ${SKILL_NAME})
  --dry-run <true|false>      Print destination only, do not copy files (default: false)
  --help                      Show this help

Examples:
  node scripts/install_skill.mjs --target all
  node scripts/install_skill.mjs --target codex --mode link
  node scripts/install_skill.mjs --target claude
  node scripts/install_skill.mjs --target custom --dest ~/.my-agent/skills
  node scripts/install_skill.mjs --target gemini --dest ~/.config/gemini/skills
`);
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

function getBoolArg(args, key, defaultValue = false) {
  const value = args[key];
  if (value === undefined) {
    return defaultValue;
  }

  const lowered = String(value).toLowerCase();
  if (["1", "true", "yes", "y"].includes(lowered)) {
    return true;
  }
  if (["0", "false", "no", "n"].includes(lowered)) {
    return false;
  }

  return defaultValue;
}

function parseCsv(value) {
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function requireHomeDir(env = process.env) {
  const home = env.HOME || env.USERPROFILE;
  if (!home) {
    throw new Error("HOME (or USERPROFILE) is required to resolve default install paths.");
  }
  return home;
}

export function resolveCodexBaseDir(env = process.env) {
  if (env.CODEX_HOME) {
    return path.resolve(env.CODEX_HOME, "skills");
  }
  return path.resolve(requireHomeDir(env), ".codex", "skills");
}

function resolveDefaultBaseDir(target, env = process.env) {
  const home = requireHomeDir(env);
  switch (target) {
    case "codex":
      return resolveCodexBaseDir(env);
    case "claude":
      return path.resolve(home, ".claude", "skills");
    case "gemini":
      return path.resolve(home, ".gemini", "skills");
    case "antigravity":
      return path.resolve(home, ".antigravity", "skills");
    default:
      throw new Error(`Unsupported target: ${target}`);
  }
}

export function normalizeTargets(targetArgRaw) {
  const raw = String(targetArgRaw || "all").toLowerCase().trim();
  const list = raw === "all" ? [...DEFAULT_TARGETS] : parseCsv(raw);
  if (list.length === 0) {
    throw new Error("No install targets were provided.");
  }

  const normalized = [];
  for (const target of list) {
    if (target === "all") {
      normalized.push(...DEFAULT_TARGETS);
      continue;
    }
    if (CUSTOM_TARGETS.includes(target)) {
      normalized.push("custom");
      continue;
    }
    if (target === "openai") {
      normalized.push("codex");
      continue;
    }
    if (!DEFAULT_TARGETS.includes(target)) {
      throw new Error(`Unknown target "${target}". Use codex|openai|claude|gemini|antigravity|custom|all.`);
    }
    normalized.push(target);
  }

  return [...new Set(normalized)];
}

async function copyInstallItems(targetDir) {
  await mkdir(targetDir, { recursive: true });

  for (const relativePath of INSTALL_ITEMS) {
    const src = path.resolve(PROJECT_ROOT, relativePath);
    const dest = path.resolve(targetDir, relativePath);
    const srcStat = await stat(src);
    await cp(src, dest, {
      recursive: srcStat.isDirectory(),
      force: true,
    });
  }
}

export function resolveInstallMode(rawMode = DEFAULT_INSTALL_MODE) {
  const mode = String(rawMode || DEFAULT_INSTALL_MODE).toLowerCase().trim();
  if (!["link", "copy"].includes(mode)) {
    throw new Error(`Unknown install mode "${rawMode}". Use link|copy.`);
  }
  return mode;
}

function assertSafeInstallDir(targetDir) {
  const resolved = path.resolve(targetDir);
  if (resolved === PROJECT_ROOT) {
    throw new Error("Refusing to install over the project root.");
  }
}

async function resetInstallTarget(targetDir) {
  try {
    await lstat(targetDir);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return;
    }
    throw error;
  }

  await rm(targetDir, { recursive: true, force: true });
}

async function linkInstallItems(targetDir) {
  await mkdir(path.dirname(targetDir), { recursive: true });
  await resetInstallTarget(targetDir);
  const linkType = process.platform === "win32" ? "junction" : "dir";
  await symlink(PROJECT_ROOT, targetDir, linkType);
}

export function resolveInstallBaseDir(target, customDest, env = process.env) {
  if (target === "custom") {
    if (!customDest) {
      throw new Error('Use --target custom with --dest.');
    }
    return path.resolve(customDest);
  }
  return path.resolve(resolveDefaultBaseDir(target, env));
}

export async function main(rawArgs = process.argv.slice(2)) {
  const args = parseCliArgs(rawArgs);
  if (args.help) {
    printUsage();
    return;
  }

  const targets = normalizeTargets(getStringArg(args, "target", "all"));
  const installMode = resolveInstallMode(getStringArg(args, "mode", DEFAULT_INSTALL_MODE));
  const dryRun = getBoolArg(args, "dry-run", false);
  const skillName = getStringArg(args, "skill-name", SKILL_NAME);
  const customDest = getStringArg(args, "dest", "");

  if (customDest && targets.length !== 1) {
    throw new Error("--dest can only be used with a single --target.");
  }

  for (const target of targets) {
    const baseDir = resolveInstallBaseDir(target, customDest);
    const installDir = path.resolve(baseDir, skillName);
    assertSafeInstallDir(installDir);

    console.log(`[install] target=${target}`);
    console.log(`[install] mode=${installMode}`);
    console.log(`[install] path=${installDir}`);

    if (dryRun) {
      console.log("[install] dry-run=true (skipped copy)");
      continue;
    }

    if (installMode === "link") {
      await linkInstallItems(installDir);
      console.log(`[install] runtime-root=${PROJECT_ROOT}`);
    } else {
      await resetInstallTarget(installDir);
      await copyInstallItems(installDir);
      console.log("[install] note=copy mode requires dependencies in the installed directory");
    }
    console.log("[install] status=ok");
  }
}

const isEntrypoint =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  main().catch((error) => {
    console.error(`[install] failed: ${error.message}`);
    process.exit(1);
  });
}
