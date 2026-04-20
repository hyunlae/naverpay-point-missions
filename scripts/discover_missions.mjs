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
  normalizeMissionCatalog,
  parseCliArgs,
  parseCsvArg,
} from "./naverpay_helpers.mjs";

export const DISCOVER_USAGE_TEXT = `사용법:
  node scripts/discover_missions.mjs [옵션]

옵션:
  --out <path>                 결과 JSON 저장 경로 (기본값: ./missions.json)
  --state-dir <path>           Playwright 프로필 경로 (기본값: ./.state/naverpay-profile)
  --keywords <csv>             수집 대상 액션 키워드 필터
  --default-wait-seconds <n>   대기 시간 미검출 시 결과에 넣을 기본값 (기본값: 7)
  --headless <true|false>      헤드리스 실행 여부 (기본값: false, 세션이 없으면 화면 로그인 후 재개)
  --login-timeout-sec <num>    로그인 대기 제한 시간(초) (기본값: 240)

예시:
  node scripts/discover_missions.mjs --state-dir ./.state/naverpay-profile --out /tmp/naverpay-missions.json --headless true
`;

function printUsage() {
  console.log(DISCOVER_USAGE_TEXT);
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

    const discovered = await discoverMissionsFromMainPointLinks(
      page,
      context,
      keywords,
      defaultWaitSeconds,
      { requireNClickMainLink: false, logPrefix: "[discover]" },
    );
    const missions = normalizeMissionCatalog(discovered);

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
