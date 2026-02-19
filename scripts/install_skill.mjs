#!/usr/bin/env node

import { cp, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SKILL_NAME = "naverpay-point-missions";
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_TARGETS = ["codex", "claude", "gemini", "antigravity"];
const CUSTOM_TARGETS = ["custom", "other"];
const INSTALL_ITEMS = ["SKILL.md", "README.md", "scripts", "references", "agents"];

function printUsage() {
  console.log(`Usage:
  node scripts/install_skill.mjs [options]

Options:
  --target <name|csv>         codex|openai|claude|gemini|antigravity|custom|all (default: all)
  --dest <path>               Override destination base directory (single target only)
  --skill-name <name>         Override installed folder name (default: ${SKILL_NAME})
  --dry-run <true|false>      Print destination only, do not copy files (default: false)
  --help                      Show this help

Examples:
  node scripts/install_skill.mjs --target all
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

function requireHomeDir() {
  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) {
    throw new Error("HOME (or USERPROFILE) is required to resolve default install paths.");
  }
  return home;
}

function resolveCodexBaseDir() {
  if (process.env.CODEX_HOME) {
    return path.resolve(process.env.CODEX_HOME, "skills");
  }
  return path.resolve(requireHomeDir(), ".agents", "skills");
}

function resolveDefaultBaseDir(target) {
  const home = requireHomeDir();
  switch (target) {
    case "codex":
      return resolveCodexBaseDir();
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

function normalizeTargets(targetArgRaw) {
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

function resolveInstallBaseDir(target, customDest) {
  if (target === "custom") {
    if (!customDest) {
      throw new Error('Use --target custom with --dest.');
    }
    return path.resolve(customDest);
  }
  return path.resolve(resolveDefaultBaseDir(target));
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  const targets = normalizeTargets(getStringArg(args, "target", "all"));
  const dryRun = getBoolArg(args, "dry-run", false);
  const skillName = getStringArg(args, "skill-name", SKILL_NAME);
  const customDest = getStringArg(args, "dest", "");

  if (customDest && targets.length !== 1) {
    throw new Error("--dest can only be used with a single --target.");
  }

  for (const target of targets) {
    const baseDir = resolveInstallBaseDir(target, customDest);
    const installDir = path.resolve(baseDir, skillName);

    console.log(`[install] target=${target}`);
    console.log(`[install] path=${installDir}`);

    if (dryRun) {
      console.log("[install] dry-run=true (skipped copy)");
      continue;
    }

    await copyInstallItems(installDir);
    console.log("[install] status=ok");
  }
}

main().catch((error) => {
  console.error(`[install] failed: ${error.message}`);
  process.exit(1);
});
