#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { chromium } from "playwright";

import {
  CLICK_MISSION_URL,
  DEFAULT_ACTION_KEYWORDS,
  DEFAULT_POPUP_PRIMARY_LABEL,
  DEFAULT_STRICT_CLAIM_LABELS,
  MAIN_URL,
  clickActionByIndex,
  clickClaimButton,
  clickPopupClaimByVisualPosition,
  clickPopupClaimButton,
  collectMainPointReceiveLinks,
  collectMissionActions,
  detectAlreadyCompletedPopup,
  ensureLoggedIn,
  findBestAction,
  gotoClickMissionList,
  getBoolArg,
  getNumberArg,
  getStringArg,
  hasNClickBadgeSignal,
  isMissionDetailUrl,
  isPlacementMissionListUrl,
  loadMissionArray,
  missionKey,
  parseCliArgs,
  parseCsvArg,
  resolveMissionWaitSeconds,
} from "./naverpay_helpers.mjs";

function printUsage() {
  console.log(`Usage:
  node scripts/run_missions.mjs [options]

Options:
  --missions <path>            Optional JSON from discover_missions.mjs
  --state-dir <path>           Playwright persistent profile path (default: ./.state/naverpay-profile)
  --completed-store <path>     Completed campaign store JSON path (default: <state-dir>/completed-campaigns.json)
  --ignore-completed <bool>    Ignore completed store and retry all targets (default: false)
  --scan-main-point-links <b>  Scan /pc/main '포인트 받기' links first (default: true)
  --only-nclick-campaigns <b>  Only run campaigns labeled as "N클릭 X원" (default: true)
  --keywords <csv>             Mission action keywords filter
  --claim-keywords <csv>       Claim keywords (default: 포인트 받기,포인트 쉽게 받기)
  --popup-primary-label <txt>  Popup primary claim label (default: 포인트 받기)
  --default-wait-seconds <n>   Fallback dwell time when mission wait is unknown (default: 7)
  --min-wait-seconds <n>       Minimum dwell time clamp (default: 3)
  --max-wait-seconds <n>       Maximum dwell time clamp (default: 120)
  --wait-seconds <n>           Legacy alias of --default-wait-seconds
  --max <num>                  Maximum missions to execute (default: 10)
  --headless <true|false>      Run headless browser (default: false)
  --dry-run <true|false>       Print selected targets only (default: false)
  --login-timeout-sec <num>    Login wait timeout in seconds (default: 240)
`);
}

async function loadPlannedMissions(pathOrEmpty) {
  if (!pathOrEmpty) {
    return [];
  }

  const raw = await readFile(pathOrEmpty, "utf8");
  const payload = JSON.parse(raw);
  return loadMissionArray(payload);
}

async function loadCompletedCampaignKeys(storePath) {
  try {
    const raw = await readFile(storePath, "utf8");
    const payload = JSON.parse(raw);

    let keys = [];
    if (Array.isArray(payload)) {
      keys = payload;
    } else if (Array.isArray(payload?.completedKeys)) {
      keys = payload.completedKeys;
    }

    const normalized = keys
      .map((item) => String(item ?? "").trim())
      .filter(Boolean);
    return new Set(normalized);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return new Set();
    }
    throw new Error(`Failed to load completed store: ${error.message}`);
  }
}

async function saveCompletedCampaignKeys(storePath, keySet) {
  const payload = {
    updatedAt: new Date().toISOString(),
    completedKeys: [...keySet].sort(),
  };
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(payload, null, 2), "utf8");
}

async function waitForNewPage(context, baselineCount, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const pages = context.pages();
    if (pages.length > baselineCount) {
      return pages[pages.length - 1];
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return null;
}

async function tryPopupClaimWithRetry(page, options = {}) {
  const attempts = Math.max(1, Math.floor(Number(options.attempts ?? 4)));
  const intervalMs = Math.max(120, Math.floor(Number(options.intervalMs ?? 450)));
  const claimOptions = { ...options };
  delete claimOptions.attempts;
  delete claimOptions.intervalMs;

  let lastResult = {
    clicked: false,
    label: "",
    inPopup: false,
    score: 0,
  };

  for (let i = 0; i < attempts; i += 1) {
    try {
      const result = await clickPopupClaimButton(page, claimOptions);
      if (result.clicked) {
        return result;
      }
      lastResult = result;
    } catch {
      // Ignore transient DOM timing errors and retry.
    }
    if (i < attempts - 1) {
      await page.waitForTimeout(intervalMs);
    }
  }

  return lastResult;
}

function missionSourceUrl(mission) {
  const raw = String(mission?.sourceListUrl ?? "").trim();
  return raw || CLICK_MISSION_URL;
}

async function openMissionSource(page, sourceUrl) {
  const targetUrl = String(sourceUrl || "").trim() || CLICK_MISSION_URL;
  if (page.url() === targetUrl) {
    return;
  }

  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
}

async function waitForPageByPredicate(candidates, timeoutMs, predicate) {
  const matchUrl = typeof predicate === "function" ? predicate : () => false;
  const pages = [...new Set((Array.isArray(candidates) ? candidates : []).filter(Boolean))];
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    for (const candidate of pages) {
      try {
        if (!candidate || candidate.isClosed()) {
          continue;
        }
        if (matchUrl(candidate.url())) {
          return candidate;
        }
      } catch {
        // Ignore closed/transient page states.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 180));
  }
  return null;
}

function hasNClickBadgeText(item) {
  if (hasNClickBadgeSignal(item)) {
    return true;
  }
  return /N\s*클릭/i.test(String(item?.label ?? ""));
}

function pickBestMissionMatch(sourceMissions, currentActions, done, completedKeys) {
  let chosenMission = null;
  let chosenAction = null;
  let chosenScore = -1;

  for (const mission of sourceMissions) {
    const key = missionKey(mission);
    if (done.has(key)) {
      continue;
    }
    if (completedKeys.has(key)) {
      continue;
    }

    const matched = findBestAction(currentActions, mission);
    if (!matched) {
      continue;
    }

    if (matched.score > chosenScore) {
      chosenMission = mission;
      chosenAction = matched.action;
      chosenScore = matched.score;
    }
  }

  if (!chosenMission || !chosenAction) {
    return null;
  }

  return {
    mission: chosenMission,
    action: chosenAction,
    score: chosenScore,
  };
}

async function scrollDownOnce(page, ratio = 0.85) {
  return page.evaluate(({ scrollRatio }) => {
    const step = Math.max(220, Math.floor(window.innerHeight * scrollRatio));
    const before = window.scrollY;
    const root = document.scrollingElement || document.documentElement || document.body;
    const maxY = Math.max(0, (root?.scrollHeight ?? 0) - window.innerHeight);
    if (before >= maxY - 2) {
      return false;
    }
    window.scrollBy({ top: step, left: 0, behavior: "auto" });
    return window.scrollY > before + 1;
  }, { scrollRatio: ratio });
}

async function scrollToTop(page) {
  await page.evaluate(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  });
}

async function collectMainPointReceiveLinksWithScroll(page, requireNClickMainLink) {
  const seen = new Map();
  let previousCount = -1;
  let stagnantPasses = 0;
  const maxPasses = 14;

  for (let pass = 0; pass < maxPasses; pass += 1) {
    const rawEntries = await collectMainPointReceiveLinks(page);
    const entries = requireNClickMainLink
      ? rawEntries.filter((item) => hasNClickBadgeText(item))
      : rawEntries;
    for (const item of entries) {
      const key = missionKey(item);
      if (!seen.has(key)) {
        seen.set(key, item);
      }
    }

    const currentCount = seen.size;
    const moved = await scrollDownOnce(page);
    if (!moved) {
      break;
    }
    if (currentCount === previousCount) {
      stagnantPasses += 1;
    } else {
      stagnantPasses = 0;
    }
    previousCount = currentCount;
    if (stagnantPasses >= 2) {
      break;
    }
    await page.waitForTimeout(280);
  }

  await scrollToTop(page);
  await page.waitForTimeout(120);
  return [...seen.values()];
}

async function collectMissionActionsWithScroll(page, actionKeywords, options = {}) {
  const seen = new Map();
  const onlyNClick = Boolean(options.onlyNClick);
  const maxPasses = Math.max(1, Math.floor(Number(options.maxPasses ?? 18)));
  let previousCount = -1;
  let stagnantPasses = 0;

  for (let pass = 0; pass < maxPasses; pass += 1) {
    const rawActions = await collectMissionActions(page, actionKeywords);
    const actions = onlyNClick ? rawActions.filter((item) => hasNClickBadgeSignal(item)) : rawActions;
    for (const action of actions) {
      const key = missionKey(action);
      if (!seen.has(key)) {
        seen.set(key, action);
      }
    }

    const currentCount = seen.size;
    const moved = await scrollDownOnce(page);
    if (!moved) {
      break;
    }
    if (currentCount === previousCount) {
      stagnantPasses += 1;
    } else {
      stagnantPasses = 0;
    }
    previousCount = currentCount;
    if (stagnantPasses >= 3) {
      break;
    }
    await page.waitForTimeout(300);
  }

  await scrollToTop(page);
  await page.waitForTimeout(120);
  return [...seen.values()];
}

async function discoverMissionsFromMainPointLinks(
  page,
  context,
  actionKeywords,
  defaultWaitSeconds,
  options = {},
) {
  const requireNClickMainLink = Boolean(options.requireNClickMainLink);
  const discoveredMap = new Map();
  const visitedMainLinkKeys = new Set();

  await page.goto(MAIN_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const entries = await collectMainPointReceiveLinksWithScroll(page, requireNClickMainLink);
  console.log(
    `[run] main page point links found: ${entries.length}${requireNClickMainLink ? " (N클릭 mode)" : ""}`,
  );

  for (let idx = 0; idx < entries.length; idx += 1) {
    await page.goto(MAIN_URL, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);

    const latestEntries = await collectMainPointReceiveLinksWithScroll(page, requireNClickMainLink);
    const seed = entries[idx];
    const seedKey = `${seed.label}|${seed.href}`;
    if (visitedMainLinkKeys.has(seedKey)) {
      continue;
    }

    const target =
      latestEntries.find((item) => `${item.label}|${item.href}` === seedKey) ?? latestEntries[idx] ?? null;
    if (!target) {
      continue;
    }

    const targetKey = `${target.label}|${target.href}`;
    if (visitedMainLinkKeys.has(targetKey)) {
      continue;
    }
    visitedMainLinkKeys.add(targetKey);

    console.log(
      `[run] checking main link ${idx + 1}/${entries.length}: ${target.label.slice(0, 60)}`,
    );

    const baselineCount = context.pages().length;
    const clickResult = await clickActionByIndex(page, target.actionIndex);
    if (!clickResult.clicked) {
      console.log("[run] main link click failed; skip");
      continue;
    }

    await page.waitForTimeout(700);
    const openedPage = await waitForNewPage(context, baselineCount, 2800);
    const detailPage = await waitForPageByPredicate(
      [page, openedPage && openedPage !== page ? openedPage : null],
      9000,
      (url) => isMissionDetailUrl(url),
    );

    if (!detailPage) {
      if (openedPage && openedPage !== page && !openedPage.isClosed()) {
        await openedPage.close().catch(() => {});
      }
      continue;
    }

    await detailPage.bringToFront().catch(() => {});
    await detailPage.waitForLoadState("domcontentloaded", { timeout: 9000 }).catch(() => {});
    await detailPage.waitForTimeout(1200);

    const seenPlacementUrls = new Set();
    const collectFromPlacementPage = async (placementPage) => {
      const sourceUrl = placementPage.url();
      if (!isPlacementMissionListUrl(sourceUrl)) {
        return 0;
      }
      if (seenPlacementUrls.has(sourceUrl)) {
        return 0;
      }
      seenPlacementUrls.add(sourceUrl);

      const actions = await collectMissionActionsWithScroll(placementPage, actionKeywords);
      actions.forEach((action) => {
        const mission = {
          ...action,
          waitSeconds: action.waitSeconds ?? defaultWaitSeconds,
          waitSource: action.waitSource || "default-wait-seconds",
          sourceListUrl: sourceUrl,
        };
        const key = missionKey(mission);
        if (!discoveredMap.has(key)) {
          discoveredMap.set(key, mission);
        }
      });
      console.log(
        `[run] mission list detected (${sourceUrl}) -> ${actions.length} candidate(s)`,
      );
      return actions.length;
    };

    let collectedCount = 0;
    if (isPlacementMissionListUrl(detailPage.url())) {
      collectedCount += await collectFromPlacementPage(detailPage);
    } else {
      const categoryUrl = detailPage.url();
      const categoryActions = await collectMissionActionsWithScroll(detailPage, actionKeywords);
      categoryActions.forEach((action) => {
        const mission = {
          ...action,
          waitSeconds: action.waitSeconds ?? defaultWaitSeconds,
          waitSource: action.waitSource || "default-wait-seconds",
          sourceListUrl: categoryUrl,
        };
        const key = missionKey(mission);
        if (!discoveredMap.has(key)) {
          discoveredMap.set(key, mission);
        }
      });
      if (categoryActions.length > 0) {
        console.log(
          `[run] category mission actions detected (${categoryUrl}) -> ${categoryActions.length} candidate(s)`,
        );
        collectedCount += categoryActions.length;
      }

      const placementTargetsRaw = categoryActions.filter((action) =>
        isPlacementMissionListUrl(action?.href),
      );
      const placementTargets = (requireNClickMainLink
        ? placementTargetsRaw.filter((action) => hasNClickBadgeText(action))
        : placementTargetsRaw
      ).filter(Boolean);
      const uniquePlacementTargets = [
        ...new Map(placementTargets.map((action) => [String(action.href), action])).values(),
      ];

      console.log(
        `[run] category list detected (${categoryUrl}) -> placement links ${uniquePlacementTargets.length}`,
      );

      for (const targetPlacement of uniquePlacementTargets) {
        try {
          await detailPage.goto(targetPlacement.href, { waitUntil: "domcontentloaded" });
          await detailPage.waitForTimeout(1200);
        } catch {
          continue;
        }
        collectedCount += await collectFromPlacementPage(detailPage);
      }
    }

    if (collectedCount === 0) {
      console.log(`[run] no mission candidates harvested from ${detailPage.url()}`);
    }

    if (detailPage !== page && !detailPage.isClosed()) {
      await detailPage.close().catch(() => {});
    }
  }

  await page.goto(MAIN_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  return [...discoveredMap.values()];
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  const stateDir = getStringArg(args, "state-dir", "./.state/naverpay-profile");
  const completedStorePath = getStringArg(
    args,
    "completed-store",
    path.join(stateDir, "completed-campaigns.json"),
  );
  const ignoreCompleted = getBoolArg(args, "ignore-completed", false);
  const scanMainPointLinks = getBoolArg(args, "scan-main-point-links", true);
  const onlyNClickCampaigns = getBoolArg(args, "only-nclick-campaigns", true);
  const missionsPath = getStringArg(args, "missions", "");
  const headless = getBoolArg(args, "headless", false);
  const dryRun = getBoolArg(args, "dry-run", false);
  const loginTimeoutSec = getNumberArg(args, "login-timeout-sec", 240);
  const legacyWaitArg = args["wait-seconds"];
  const defaultWaitArg = args["default-wait-seconds"];
  const waitFallbackRaw = defaultWaitArg ?? legacyWaitArg;
  const defaultWaitSeconds =
    waitFallbackRaw === undefined
      ? 7
      : (() => {
          const parsed = Number(waitFallbackRaw);
          if (Number.isNaN(parsed)) {
            throw new Error("--default-wait-seconds expects a number");
          }
          return parsed;
        })();
  const minWaitSeconds = getNumberArg(args, "min-wait-seconds", 3);
  const maxWaitSeconds = getNumberArg(args, "max-wait-seconds", 120);
  const maxCount = getNumberArg(args, "max", 10);
  const actionKeywords = parseCsvArg(args.keywords, DEFAULT_ACTION_KEYWORDS);
  const claimKeywords = parseCsvArg(args["claim-keywords"], DEFAULT_STRICT_CLAIM_LABELS);
  const popupPrimaryLabel = getStringArg(
    args,
    "popup-primary-label",
    DEFAULT_POPUP_PRIMARY_LABEL,
  );
  const popupExactLabels = [
    ...new Set([popupPrimaryLabel, ...claimKeywords].map((item) => String(item).trim()).filter(Boolean)),
  ];

  await mkdir(stateDir, { recursive: true });

  const context = await chromium.launchPersistentContext(stateDir, {
    headless,
    viewport: { width: 1440, height: 960 },
  });

  try {
    const page = context.pages()[0] ?? (await context.newPage());

    console.log("[run] opening NaverPay main page");
    console.log("[run] complete login in browser if redirected");
    await ensureLoggedIn(page, loginTimeoutSec);

    let plannedMissions = await loadPlannedMissions(missionsPath);
    if (plannedMissions.length === 0) {
      if (scanMainPointLinks) {
        plannedMissions = await discoverMissionsFromMainPointLinks(
          page,
          context,
          actionKeywords,
          defaultWaitSeconds,
          { requireNClickMainLink: onlyNClickCampaigns },
        );
        console.log(
          `[run] discovered ${plannedMissions.length} mission candidate(s) from main page links`,
        );
      }

      if (plannedMissions.length === 0) {
        if (scanMainPointLinks && onlyNClickCampaigns) {
          console.log(
            "[run] no mission candidate from N클릭 main links; fallback disabled in N클릭 mode",
          );
          return;
        }
        await gotoClickMissionList(page);
        const discovered = await collectMissionActions(page, actionKeywords);
        plannedMissions = discovered.map((mission) => ({
          ...mission,
          waitSeconds: mission.waitSeconds ?? defaultWaitSeconds,
          waitSource: mission.waitSource || "default-wait-seconds",
          sourceListUrl: CLICK_MISSION_URL,
        }));
        console.log(
          `[run] using ${plannedMissions.length} auto-discovered missions from click mission page`,
        );
      }
    } else {
      plannedMissions = plannedMissions.map((mission) => ({
        ...mission,
        sourceListUrl: missionSourceUrl(mission),
      }));
      console.log(`[run] loaded ${plannedMissions.length} missions from ${missionsPath}`);
    }

    if (onlyNClickCampaigns) {
      const beforeCount = plannedMissions.length;
      plannedMissions = plannedMissions.filter((mission) => hasNClickBadgeSignal(mission));
      console.log(
        `[run] filtered to N클릭 X원 campaigns: ${plannedMissions.length}/${beforeCount}`,
      );
    }
    if (plannedMissions.length === 0) {
      console.log("[run] no campaign matched current filters");
      return;
    }

    const completedKeys = ignoreCompleted
      ? new Set()
      : await loadCompletedCampaignKeys(completedStorePath);
    if (ignoreCompleted) {
      console.log("[run] ignore-completed=true, completed store skipped");
    } else {
      console.log(
        `[run] loaded ${completedKeys.size} completed campaign key(s) from ${completedStorePath}`,
      );
    }

    const executed = [];
    const done = new Set();
    const limit = Math.max(0, Math.floor(maxCount));
    const missionsBySource = new Map();
    plannedMissions.forEach((mission) => {
      const sourceUrl = missionSourceUrl(mission);
      if (!missionsBySource.has(sourceUrl)) {
        missionsBySource.set(sourceUrl, []);
      }
      missionsBySource.get(sourceUrl).push({
        ...mission,
        sourceListUrl: sourceUrl,
      });
    });

    for (const [sourceUrl, sourceMissions] of missionsBySource.entries()) {
      if (executed.length >= limit) {
        break;
      }
      if (sourceMissions.length === 0) {
        continue;
      }

      console.log(`[run] source: ${sourceUrl} | candidates=${sourceMissions.length}`);

      while (executed.length < limit) {
        try {
          await openMissionSource(page, sourceUrl);
        } catch {
          console.log(`[run] failed to open source page: ${sourceUrl}`);
          break;
        }

        if (!isMissionDetailUrl(page.url())) {
          console.log("[run] source page is not a mission-detail page; skip source");
          break;
        }

        let chosenMission = null;
        let chosenAction = null;
        let chosenScore = -1;

        const maxScrollPasses = 18;
        for (let pass = 0; pass < maxScrollPasses; pass += 1) {
          const currentRaw = await collectMissionActions(page, actionKeywords);
          const current = onlyNClickCampaigns
            ? currentRaw.filter((action) => hasNClickBadgeSignal(action))
            : currentRaw;
          const matched = pickBestMissionMatch(sourceMissions, current, done, completedKeys);
          if (matched) {
            chosenMission = matched.mission;
            chosenAction = matched.action;
            chosenScore = matched.score;
            break;
          }
          const moved = await scrollDownOnce(page);
          if (!moved) {
            break;
          }
          await page.waitForTimeout(280);
        }

        if (!chosenMission || !chosenAction) {
          console.log("[run] no remaining matched targets");
          break;
        }

        const key = missionKey(chosenMission);
        done.add(key);

        console.log(
          `[run] target ${executed.length + 1}/${limit}: ${chosenAction.label} (score=${chosenScore})`,
        );
        const waitPlan = resolveMissionWaitSeconds(chosenMission, chosenAction, {
          defaultWaitSeconds,
          minWaitSeconds,
          maxWaitSeconds,
        });
        console.log(`[run] dwell ${waitPlan.waitSeconds}s (${waitPlan.source})`);

        if (dryRun) {
          executed.push({
            label: chosenAction.label,
            href: chosenAction.href,
            sourceListUrl: sourceUrl,
            claimed: false,
            alreadyCompletedPopup: false,
            alreadyCompletedConfirmClicked: false,
            waitSeconds: waitPlan.waitSeconds,
            waitSource: waitPlan.source,
            popupClaimClicked: false,
            popupClaimLabel: "",
            dryRun: true,
          });
          continue;
        }

        const actionPageBaseline = context.pages().length;
        const beforeUrl = page.url();

        const clickResult = await clickActionByIndex(page, chosenAction.actionIndex);
        if (!clickResult.clicked) {
          console.log("[run] click failed, skipping target");
          executed.push({
            label: chosenAction.label,
            href: chosenAction.href,
            sourceListUrl: sourceUrl,
            claimed: false,
            waitSeconds: waitPlan.waitSeconds,
            waitSource: waitPlan.source,
            popupClaimClicked: false,
            popupClaimLabel: "",
            skipped: true,
          });
          continue;
        }

        let popupClaimClicked = false;
        let popupClaimLabel = "";
        let alreadyCompletedPopup = false;
        let alreadyCompletedConfirmClicked = false;
        let alreadyCompletedPopupText = "";
        let claim = {
          clicked: false,
          label: "",
        };

        // Determine where popup appears (same tab or a newly opened tab) and probe for a longer window.
        await page.waitForTimeout(900);
        let openedPage = await waitForNewPage(context, actionPageBaseline, 2600);
        let interactionPage = openedPage && openedPage !== page ? openedPage : page;
        if (interactionPage !== page) {
          await interactionPage.bringToFront().catch(() => {});
          await interactionPage.waitForLoadState("domcontentloaded", { timeout: 9000 }).catch(() => {});
        }

        const popupProbeStart = Date.now();
        const popupProbeTimeoutMs = 9500;
        while (
          Date.now() - popupProbeStart < popupProbeTimeoutMs &&
          !popupClaimClicked &&
          !alreadyCompletedPopup
        ) {
          const alreadyCompleted = await detectAlreadyCompletedPopup(interactionPage);
          if (alreadyCompleted.detected) {
            alreadyCompletedPopup = true;
            alreadyCompletedConfirmClicked = alreadyCompleted.clickedConfirm;
            alreadyCompletedPopupText = alreadyCompleted.popupText;
            console.log(
              `[run] already-completed popup detected${alreadyCompleted.clickedConfirm ? `; confirm clicked (${alreadyCompleted.confirmLabel || "확인"})` : "; confirm button not clicked"}${alreadyCompleted.frameUrl ? ` [frame=${alreadyCompleted.frameUrl}]` : ""}${alreadyCompleted.matchedPattern ? ` [match=${alreadyCompleted.matchedPattern}]` : ""}`,
            );
            break;
          }

          const popupClaim = await tryPopupClaimWithRetry(interactionPage, {
            primaryLabel: popupPrimaryLabel,
            exactLabels: popupExactLabels,
            fallbackKeywords: [],
            useFallbackKeywords: false,
            requirePopup: true,
            attempts: 2,
            intervalMs: 420,
          });
          if (popupClaim.clicked) {
            popupClaimClicked = true;
            popupClaimLabel = popupClaim.label;
            console.log(
              `[run] popup claim clicked: ${popupClaim.label}${popupClaim.inPopup ? " (popup)" : ""}${popupClaim.frameUrl ? ` [frame=${popupClaim.frameUrl}]` : ""}${popupClaim.via ? ` [via=${popupClaim.via}]` : ""}`,
            );
            break;
          }

          const visualClaim = await clickPopupClaimByVisualPosition(interactionPage);
          if (visualClaim.clicked) {
            popupClaimClicked = true;
            popupClaimLabel = visualClaim.label || popupPrimaryLabel;
            console.log(
              `[run] popup visual claim clicked: ${popupClaimLabel}${visualClaim.frameUrl ? ` [frame=${visualClaim.frameUrl}]` : ""}${visualClaim.via ? ` [via=${visualClaim.via}]` : ""}`,
            );
            break;
          }

          await interactionPage.waitForTimeout(520);
        }

        if (!popupClaimClicked && !alreadyCompletedPopup) {
          console.log("[run] popup claim not found within probe window; continuing with fallback flow");
        }

        if (!alreadyCompletedPopup) {
          if (!openedPage || openedPage === page) {
            const lateOpenedPage = await waitForNewPage(
              context,
              actionPageBaseline,
              popupClaimClicked ? 5200 : 2600,
            );
            if (lateOpenedPage && lateOpenedPage !== page) {
              openedPage = lateOpenedPage;
            }
          }

          if (openedPage && openedPage !== page) {
            try {
              await openedPage.waitForLoadState("domcontentloaded", { timeout: 10000 });
            } catch {
              // Ignore load timeout and continue dwell wait.
            }
            await openedPage.waitForTimeout(waitPlan.waitSeconds * 1000);
            if (!openedPage.isClosed()) {
              await openedPage.close().catch(() => {});
            }
            await page.bringToFront();
          } else {
            await page.waitForTimeout(waitPlan.waitSeconds * 1000);
            if (page.url() !== beforeUrl && !isMissionDetailUrl(page.url())) {
              await openMissionSource(page, sourceUrl).catch(async () => {
                await gotoClickMissionList(page);
              });
            }
          }

          if (!popupClaimClicked) {
            await page.waitForTimeout(1200);
            claim = await clickClaimButton(page, claimKeywords);
            if (claim.clicked) {
              console.log(`[run] claim clicked: ${claim.label}`);
              await page.waitForTimeout(1200);
            } else {
              console.log("[run] no claim button detected after action");
            }
          } else {
            console.log("[run] popup claim flow used; post-claim step skipped");
          }
        } else {
          console.log("[run] already-completed popup flow used; dwell/claim skipped");
        }

        if (!isMissionDetailUrl(page.url())) {
          await openMissionSource(page, sourceUrl).catch(async () => {
            await gotoClickMissionList(page);
          });
        }
        await page.waitForTimeout(1500);

        executed.push({
          label: chosenAction.label,
          href: chosenAction.href,
          sourceListUrl: sourceUrl,
          claimed: claim.clicked,
          alreadyCompletedPopup,
          alreadyCompletedConfirmClicked,
          alreadyCompletedPopupText,
          waitSeconds: waitPlan.waitSeconds,
          waitSource: waitPlan.source,
          popupClaimClicked,
          popupClaimLabel,
        });

        const completedNow = alreadyCompletedPopup || popupClaimClicked || claim.clicked;
        if (!dryRun && !ignoreCompleted && completedNow) {
          if (!completedKeys.has(key)) {
            completedKeys.add(key);
            await saveCompletedCampaignKeys(completedStorePath, completedKeys);
          }
        }
      }
    }

    console.log(`[run] completed ${executed.length} target(s)`);
    executed.forEach((item, index) => {
      console.log(
        `${String(index + 1).padStart(2, "0")}. ${item.label} | list=${item.sourceListUrl || "-"} | wait=${item.waitSeconds}s | source=${item.waitSource} | popupClaim=${item.popupClaimClicked ? item.popupClaimLabel || "yes" : "no"} | alreadyCompleted=${item.alreadyCompletedPopup ? "yes" : "no"} | claimed=${item.claimed}${item.dryRun ? " | dry-run" : ""}`,
      );
    });
  } finally {
    await context.close();
  }
}

main().catch((error) => {
  console.error(`[run] failed: ${error.message}`);
  process.exit(1);
});
