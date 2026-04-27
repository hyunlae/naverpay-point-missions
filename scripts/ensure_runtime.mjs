#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { access } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_TIMEOUT_MS = 120_000;

export const ENSURE_USAGE_TEXT = `사용법:
  node scripts/ensure_runtime.mjs [옵션]

옵션:
  --install-package <true|false>   playwright 패키지 누락 시 npm install 실행 (기본값: true)
  --install-browsers <true|false>  Chromium 캐시 누락 시 npx playwright install chromium 실행 (기본값: true)
  --timeout-ms <num>               설치 명령별 제한 시간 (기본값: ${DEFAULT_TIMEOUT_MS})
  --dry-run <true|false>           필요한 작업만 출력하고 실행하지 않음 (기본값: false)
  --help                           이 도움말 출력

권장:
  run_missions/discover_missions 실행 전에 먼저 호출하면 로컬 의존성 누락을 자동 복구합니다.
`;

function printUsage() {
  console.log(ENSURE_USAGE_TEXT);
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
      args[token.slice(2, eqPos)] = token.slice(eqPos + 1);
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

  throw new Error(`--${key} expects true/false (received: ${value})`);
}

function getNumberArg(args, key, defaultValue) {
  const value = args[key];
  if (value === undefined || value === "") {
    return defaultValue;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`--${key} expects a positive number`);
  }
  return parsed;
}

export function resolveEnsureOptions(rawArgs = process.argv.slice(2)) {
  const args = parseCliArgs(rawArgs);
  if (args.help) {
    return { help: true };
  }

  return {
    dryRun: getBoolArg(args, "dry-run", false),
    installBrowsers: getBoolArg(args, "install-browsers", true),
    installPackage: getBoolArg(args, "install-package", true),
    timeoutMs: getNumberArg(args, "timeout-ms", DEFAULT_TIMEOUT_MS),
  };
}

export function parseInstallLocations(output) {
  return String(output)
    .split(/\r?\n/)
    .map((line) => line.match(/Install location:\s+(.+)$/)?.[1]?.trim())
    .filter(Boolean);
}

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function hasPlaywrightPackage(rootDir = PROJECT_ROOT) {
  const requireFromRoot = createRequire(path.join(rootDir, "package.json"));
  try {
    requireFromRoot.resolve("playwright");
    return true;
  } catch (error) {
    if (error?.code === "MODULE_NOT_FOUND") {
      return false;
    }
    throw error;
  }
}

function runCommand(command, args, options = {}) {
  const cwd = options.cwd ?? PROJECT_ROOT;
  const echo = options.echo ?? true;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill("SIGTERM");
      reject(new Error(`${command} ${args.join(" ")} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      if (echo) {
        process.stdout.write(chunk);
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (echo) {
        process.stderr.write(chunk);
      }
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}`));
      }
    });
  });
}

async function ensurePlaywrightPackage(options) {
  if (await hasPlaywrightPackage()) {
    console.log("[ensure] playwright package=ok");
    return;
  }

  if (!options.installPackage) {
    throw new Error("playwright package is missing. Run npm install or pass --install-package true.");
  }

  console.log("[ensure] playwright package=missing; running npm install");
  if (options.dryRun) {
    console.log("[ensure] dry-run=true (skipped npm install)");
    return;
  }

  await runCommand("npm", ["install"], { timeoutMs: options.timeoutMs });
  if (!(await hasPlaywrightPackage())) {
    throw new Error("playwright package is still missing after npm install.");
  }
}

async function chromiumInstallLocations(options) {
  const result = await runCommand("npx", ["playwright", "install", "chromium", "--dry-run"], {
    echo: false,
    timeoutMs: options.timeoutMs,
  });
  return parseInstallLocations(result.stdout);
}

async function ensureChromium(options) {
  if (!options.installBrowsers) {
    console.log("[ensure] chromium install check=skipped");
    return;
  }

  const locations = await chromiumInstallLocations(options);
  const uniqueLocations = [...new Set(locations)];
  const missingLocations = [];

  for (const location of uniqueLocations) {
    if (!(await pathExists(location))) {
      missingLocations.push(location);
    }
  }

  if (uniqueLocations.length > 0 && missingLocations.length === 0) {
    console.log("[ensure] chromium cache=ok");
    return;
  }

  console.log("[ensure] chromium cache=missing; running playwright install chromium");
  if (options.dryRun) {
    console.log("[ensure] dry-run=true (skipped playwright browser install)");
    return;
  }

  await runCommand("npx", ["playwright", "install", "chromium"], {
    timeoutMs: options.timeoutMs,
  });
}

export async function main(rawArgs = process.argv.slice(2)) {
  const options = resolveEnsureOptions(rawArgs);
  if (options.help) {
    printUsage();
    return;
  }

  await ensurePlaywrightPackage(options);
  await ensureChromium(options);
  console.log("[ensure] status=ok");
}

const isEntrypoint =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  main().catch((error) => {
    console.error(`[ensure] failed: ${error.message}`);
    process.exit(1);
  });
}
