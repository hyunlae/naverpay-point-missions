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
  collectMissionActions,
  collectMissionActionsWithScroll,
  detectAlreadyCompletedPopup,
  discoverMissionsFromMainPointLinks,
  ensureLoggedIn,
  findBestAction,
  gotoClickMissionList,
  getBoolArg,
  getNumberArg,
  getStringArg,
  hasNClickBadgeSignal,
  hasNClickBadgeText,
  isMissionDetailUrl,
  isPlacementMissionListUrl,
  loadMissionArray,
  missionKey,
  parseCliArgs,
  parseCsvArg,
  resolveMissionWaitSeconds,
  scrollDownOnce,
  scrollToTop,
  waitForNewPage,
  waitForPageByPredicate,
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
  --max <num>                  Maximum missions to execute (default: 200)
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
  const maxCount = getNumberArg(args, "max", 200);
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
          { requireNClickMainLink: onlyNClickCampaigns, logPrefix: "[run]" },
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
