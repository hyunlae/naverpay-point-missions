#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { chromium } from "playwright";

import {
  DEFAULT_ACTION_KEYWORDS,
  discoverMissionsFromMainPointLinks,
  getBoolArg,
  getNumberArg,
  getStringArg,
  launchContextWithLoginBootstrap,
  parseCliArgs,
  parseCsvArg,
} from "./naverpay_helpers.mjs";

function printUsage() {
  console.log(`Usage:
  node scripts/discover_missions.mjs [options]

Options:
  --out <path>                 Output JSON path (default: ./missions.json)
  --state-dir <path>           Playwright persistent profile path (default: ./.state/naverpay-profile)
  --keywords <csv>             Action keywords filter
  --default-wait-seconds <n>   Fallback waitSeconds in output when no time text exists (default: 7)
  --headless <true|false>      Run headless browser (default: false, auto-opens visible login if session missing)
  --login-timeout-sec <num>    Login wait timeout in seconds (default: 240)
`);
}

export async function main(rawArgs = process.argv.slice(2), deps = {}) {
  const args = parseCliArgs(rawArgs);
  if (args.help) {
    printUsage();
    return;
  }

  const outPath = getStringArg(args, "out", "./missions.json");
  const stateDir = getStringArg(args, "state-dir", "./.state/naverpay-profile");
  const headless = getBoolArg(args, "headless", false);
  const loginTimeoutSec = getNumberArg(args, "login-timeout-sec", 240);
  const defaultWaitSeconds = getNumberArg(args, "default-wait-seconds", 7);
  const keywords = parseCsvArg(args.keywords, DEFAULT_ACTION_KEYWORDS);

  await mkdir(stateDir, { recursive: true });
  await mkdir(path.dirname(outPath), { recursive: true });

  const browserType = deps.browserType ?? chromium;
  const { context, page } = await launchContextWithLoginBootstrap({
    browserType,
    stateDir,
    headless,
    loginTimeoutSec,
    logPrefix: "[discover]",
  });

  try {
    console.log("[discover] opening NaverPay main page for login");

    const missions = await discoverMissionsFromMainPointLinks(
      page,
      context,
      keywords,
      defaultWaitSeconds,
      { requireNClickMainLink: false, logPrefix: "[discover]" },
    );

    const payload = {
      generatedAt: new Date().toISOString(),
      source: "main-page-scan",
      keywordFilter: keywords,
      defaultWaitSeconds,
      missions,
    };

    await writeFile(outPath, JSON.stringify(payload, null, 2), "utf8");

    console.log(`[discover] found ${missions.length} mission candidates`);
    missions.slice(0, 30).forEach((mission, idx) => {
      const label = mission.label.slice(0, 48);
      const href = mission.href ? ` | ${mission.href.slice(0, 70)}` : "";
      console.log(
        `${String(idx + 1).padStart(2, "0")}. ${label} | wait=${mission.waitSeconds}s${href}`,
      );
    });
    console.log(`[discover] saved: ${outPath}`);
  } finally {
    await context.close();
  }
}

const isEntrypoint =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  main().catch((error) => {
    console.error(`[discover] failed: ${error.message}`);
    process.exit(1);
  });
}
