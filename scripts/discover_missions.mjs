#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { chromium } from "playwright";

import {
  DEFAULT_ACTION_KEYWORDS,
  discoverMissionsFromMainPointLinks,
  ensureLoggedIn,
  getBoolArg,
  getNumberArg,
  getStringArg,
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
  --headless <true|false>      Run headless browser (default: false)
  --login-timeout-sec <num>    Login wait timeout in seconds (default: 240)
`);
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
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

  const context = await chromium.launchPersistentContext(stateDir, {
    headless,
    viewport: { width: 1440, height: 960 },
  });

  try {
    const page = context.pages()[0] ?? (await context.newPage());

    console.log("[discover] opening NaverPay main page for login");
    console.log("[discover] complete login in the browser window if redirected");
    await ensureLoggedIn(page, loginTimeoutSec);

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

main().catch((error) => {
  console.error(`[discover] failed: ${error.message}`);
  process.exit(1);
});
