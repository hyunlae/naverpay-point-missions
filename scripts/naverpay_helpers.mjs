#!/usr/bin/env node

export const MAIN_URL = "https://point.pay.naver.com/pc/main";
export const CLICK_MISSION_URL =
  "https://point.pay.naver.com/pc/mission-detail?dataType=placement&pageKey=benefit_group_pp&rankType=RANDOM_DAILY&sortCompletedAdToLast=true&mssCode=pp";
export const ACTION_SELECTOR = "a, button, [role='button']";

export const DEFAULT_ACTION_KEYWORDS = [
  "링크",
  "적립",
  "받기",
  "참여",
  "미션",
  "바로가기",
  "클릭",
  "방문",
  "출석",
];

export const DEFAULT_CLAIM_KEYWORDS = ["받기", "적립", "확인"];
export const DEFAULT_POPUP_PRIMARY_LABEL = "포인트 받기";
export const DEFAULT_STRICT_CLAIM_LABELS = ["포인트 받기", "포인트 쉽게 받기"];
export const N_CLICK_BADGE_PATH_D =
  "M34.0541 0.5C38.4432 0.5 42 4.08095 42 8.5C42 12.919 38.4432 16.5 34.0541 16.5H7.94595C3.55676 16.5 0 12.919 0 8.5C0 4.08095 3.55676 0.5 7.94595 0.5H34.0541Z";
export const DEFAULT_ALREADY_COMPLETED_PATTERNS = [
  "캠페인 당 1회만 적립",
  "1회만 적립됩니다",
  "이미 참여",
  "이미 적립",
];
export const DEFAULT_ALREADY_COMPLETED_CONFIRM_LABELS = ["확인"];

export function parseCliArgs(argv) {
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

export function getStringArg(args, key, defaultValue) {
  const value = args[key];
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }
  return String(value);
}

export function getNumberArg(args, key, defaultValue) {
  const value = args[key];
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`--${key} expects a number (received: ${value})`);
  }

  return parsed;
}

export function getBoolArg(args, key, defaultValue = false) {
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

export function parseCsvArg(value, fallback) {
  if (!value) {
    return [...fallback];
  }

  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isNClickPointCampaignLabel(value) {
  const label = normalizeText(value);
  if (!label) {
    return false;
  }
  return /(?:N\s*)?클릭\s*\d[\d,]*(?:\.\d+)?\s*원/i.test(label);
}

export function hasNClickBadgeSignal(item) {
  if (!item) {
    return false;
  }
  if (item.hasNClickBadge === true) {
    return true;
  }
  return isNClickPointCampaignLabel(`${item.label ?? ""} ${item.cardText ?? ""}`);
}

function escapeRegExp(value) {
  return String(value ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toFinitePositiveNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  if (parsed <= 0) {
    return null;
  }
  return parsed;
}

export function extractWaitSecondsFromText(text) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return null;
  }

  const matches = [];
  const patterns = [
    { regex: /(?:최소|적어도|이상)\s*(\d{1,3})\s*초/gi, multiplier: 1 },
    { regex: /(\d{1,3})\s*초(?:\s*(?:이상|대기|머물|체류|유지|후|동안|기다리기))?/gi, multiplier: 1 },
    { regex: /(\d{1,3})\s*(?:sec|secs|second|seconds)\b/gi, multiplier: 1 },
    { regex: /(\d{1,2})\s*분(?:\s*(?:이상|대기|머물|체류|후|동안))?/gi, multiplier: 60 },
  ];

  for (const { regex, multiplier } of patterns) {
    let match = regex.exec(normalized);
    while (match) {
      const rawNumber = Number(match[1]);
      if (Number.isFinite(rawNumber)) {
        const seconds = Math.ceil(rawNumber * multiplier);
        if (seconds >= 1 && seconds <= 600) {
          matches.push({
            waitSeconds: seconds,
            matchedText: normalizeText(match[0]),
          });
        }
      }
      match = regex.exec(normalized);
    }
  }

  if (matches.length === 0) {
    return null;
  }

  // Use the largest detected wait to avoid under-waiting missions.
  matches.sort((a, b) => b.waitSeconds - a.waitSeconds);
  return matches[0];
}

export function resolveMissionWaitSeconds(mission, action, options = {}) {
  const minWait = Math.max(1, Math.ceil(toFinitePositiveNumber(options.minWaitSeconds) ?? 3));
  const maxWait = Math.max(minWait, Math.ceil(toFinitePositiveNumber(options.maxWaitSeconds) ?? 120));
  const defaultWait = Math.max(
    minWait,
    Math.min(maxWait, Math.ceil(toFinitePositiveNumber(options.defaultWaitSeconds) ?? 7)),
  );

  const directMissionWait = toFinitePositiveNumber(mission?.waitSeconds);
  if (directMissionWait !== null) {
    return {
      waitSeconds: Math.max(minWait, Math.min(maxWait, Math.ceil(directMissionWait))),
      source: "mission.waitSeconds",
    };
  }

  const estimatedMissionWait = toFinitePositiveNumber(mission?.estimatedWaitSeconds);
  if (estimatedMissionWait !== null) {
    return {
      waitSeconds: Math.max(minWait, Math.min(maxWait, Math.ceil(estimatedMissionWait))),
      source: "mission.estimatedWaitSeconds",
    };
  }

  const liveActionWait = toFinitePositiveNumber(action?.waitSeconds);
  if (liveActionWait !== null) {
    return {
      waitSeconds: Math.max(minWait, Math.min(maxWait, Math.ceil(liveActionWait))),
      source: "liveAction.waitSeconds",
    };
  }

  const missionTextHit = extractWaitSecondsFromText(`${mission?.label ?? ""} ${mission?.cardText ?? ""}`);
  if (missionTextHit) {
    return {
      waitSeconds: Math.max(minWait, Math.min(maxWait, missionTextHit.waitSeconds)),
      source: `mission.text:${missionTextHit.matchedText}`,
    };
  }

  const actionTextHit = extractWaitSecondsFromText(`${action?.label ?? ""} ${action?.cardText ?? ""}`);
  if (actionTextHit) {
    return {
      waitSeconds: Math.max(minWait, Math.min(maxWait, actionTextHit.waitSeconds)),
      source: `liveAction.text:${actionTextHit.matchedText}`,
    };
  }

  return {
    waitSeconds: defaultWait,
    source: "defaultWaitSeconds",
  };
}

export async function ensureLoggedIn(page, timeoutSec) {
  const timeoutMs = timeoutSec * 1000;
  const start = Date.now();

  await page.goto(MAIN_URL, { waitUntil: "domcontentloaded" });

  while (Date.now() - start < timeoutMs) {
    const url = page.url();
    if (url.startsWith(MAIN_URL)) {
      await page.waitForTimeout(1500);
      return;
    }

    await page.waitForTimeout(1000);
  }

  throw new Error(
    `Login did not complete within ${timeoutSec}s. Complete login in the browser window and retry.`,
  );
}

export function isMissionDetailUrl(urlText) {
  try {
    const parsed = new URL(String(urlText ?? ""));
    return (
      parsed.origin === "https://point.pay.naver.com" &&
      parsed.pathname === "/pc/mission-detail"
    );
  } catch {
    return false;
  }
}

export function isPlacementMissionListUrl(urlText) {
  try {
    const parsed = new URL(String(urlText ?? ""));
    if (!isMissionDetailUrl(parsed.toString())) {
      return false;
    }
    return parsed.searchParams.get("dataType") === "placement";
  } catch {
    return false;
  }
}

export function isClickMissionListUrl(urlText) {
  try {
    const parsed = new URL(String(urlText ?? ""));
    if (!isPlacementMissionListUrl(parsed.toString())) {
      return false;
    }

    const params = parsed.searchParams;
    return (
      params.get("dataType") === "placement" &&
      params.get("pageKey") === "benefit_group_pp" &&
      params.get("mssCode") === "pp"
    );
  } catch {
    return false;
  }
}

export async function gotoClickMissionList(page) {
  await page.goto(CLICK_MISSION_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
}

export async function collectMainPointReceiveLinks(page) {
  return page.evaluate(({ selector, nClickPath }) => {
    const normalize = (value) =>
      String(value ?? "")
        .replace(/\s+/g, " ")
        .trim();
    const normalizePath = (value) =>
      String(value ?? "")
        .replace(/\s+/g, " ")
        .trim();

    const isVisible = (el) => {
      if (!(el instanceof HTMLElement)) {
        return false;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4) {
        return false;
      }
      const style = window.getComputedStyle(el);
      if (!style) {
        return false;
      }
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
        return false;
      }
      return true;
    };

    const hasNClickBadge = (root) => {
      if (!(root instanceof Element)) {
        return false;
      }
      const target = normalizePath(nClickPath);
      if (!target) {
        return false;
      }
      const paths = root.querySelectorAll("svg path[d]");
      for (const path of paths) {
        const d = normalizePath(path.getAttribute("d"));
        if (d === target) {
          return true;
        }
      }
      return false;
    };

    const nodes = Array.from(document.querySelectorAll(selector));
    const seen = new Set();
    const links = [];

    nodes.forEach((node, actionIndex) => {
      if (!isVisible(node)) {
        return;
      }

      const disabled =
        (node instanceof HTMLButtonElement && node.disabled) ||
        node.getAttribute("aria-disabled") === "true";
      if (disabled) {
        return;
      }

      const href =
        node instanceof HTMLAnchorElement
          ? normalize(node.href || node.getAttribute("href"))
          : normalize(node.getAttribute("href"));
      const card = node.closest(
        "article, li, section, div[class*='item'], div[class*='card'], div[class*='mission'], div[class*='benefit']",
      );
      const hasBadge = hasNClickBadge(card || node);
      const label = normalize(node.innerText || node.textContent || "");
      const cardText = normalize(card?.innerText || card?.textContent || "");
      const nClickTextSignal = /N\s*클릭/i.test(`${label} ${cardText}`);
      const isMissionDetailHref = href.includes("/pc/mission-detail");
      const isMainPointReceiveLink = label.includes("포인트 받기");
      const isNClickMissionDetail = isMissionDetailHref && (hasBadge || nClickTextSignal);
      if (!label) {
        return;
      }
      if (!isMainPointReceiveLink && !isNClickMissionDetail) {
        return;
      }

      const rect = node.getBoundingClientRect();
      const signature = `${label}|${href}|${hasBadge ? "1" : "0"}`;
      if (seen.has(signature)) {
        return;
      }
      seen.add(signature);

      links.push({
        actionIndex,
        label,
        href,
        cardText: cardText.slice(0, 220),
        hasNClickBadge: hasBadge,
        top: Math.round(rect.top),
        left: Math.round(rect.left),
      });
    });

    links.sort((a, b) => a.top - b.top || a.left - b.left);
    return links.map(({ top, left, ...rest }) => rest);
  }, { selector: ACTION_SELECTOR, nClickPath: N_CLICK_BADGE_PATH_D });
}

export async function collectMissionActions(page, keywords) {
  const actions = await page.evaluate(
    ({ selector, keywords: actionKeywords, nClickPath }) => {
      const normalize = (value) =>
        String(value ?? "")
          .replace(/\s+/g, " ")
          .trim();
      const normalizePath = (value) =>
        String(value ?? "")
          .replace(/\s+/g, " ")
          .trim();

      const isVisible = (el) => {
        if (!(el instanceof HTMLElement)) {
          return false;
        }
        const rect = el.getBoundingClientRect();
        if (rect.width < 4 || rect.height < 4) {
          return false;
        }
        const style = window.getComputedStyle(el);
        if (!style) {
          return false;
        }
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
          return false;
        }
        return true;
      };

      const hasNClickBadge = (root) => {
        if (!(root instanceof Element)) {
          return false;
        }
        const target = normalizePath(nClickPath);
        if (!target) {
          return false;
        }
        const paths = root.querySelectorAll("svg path[d]");
        for (const path of paths) {
          const d = normalizePath(path.getAttribute("d"));
          if (d === target) {
            return true;
          }
        }
        return false;
      };

      const nodes = Array.from(document.querySelectorAll(selector));
      const seen = new Set();
      const actions = [];

      nodes.forEach((node, actionIndex) => {
        if (!isVisible(node)) {
          return;
        }

        const disabled =
          (node instanceof HTMLButtonElement && node.disabled) ||
          node.getAttribute("aria-disabled") === "true";
        if (disabled) {
          return;
        }

        const label = normalize(node.innerText || node.textContent || "");
        if (!label) {
          return;
        }
        if (!actionKeywords.some((keyword) => label.includes(keyword))) {
          return;
        }

        const href =
          node instanceof HTMLAnchorElement
            ? normalize(node.href || node.getAttribute("href"))
            : normalize(node.getAttribute("href"));

        const card = node.closest(
          "article, li, section, div[class*='item'], div[class*='card'], div[class*='mission'], div[class*='benefit']",
        );
        const cardText = normalize(card?.innerText || "").slice(0, 220);
        const hasBadge = hasNClickBadge(card || node);

        const rect = node.getBoundingClientRect();
        const signature = `${label}|${href}|${cardText.slice(0, 80)}|${hasBadge ? "1" : "0"}`;
        if (seen.has(signature)) {
          return;
        }
        seen.add(signature);

        actions.push({
          actionIndex,
          label,
          href,
          cardText,
          hasNClickBadge: hasBadge,
          top: Math.round(rect.top),
          left: Math.round(rect.left),
        });
      });

      actions.sort((a, b) => a.top - b.top || a.left - b.left);
      return actions.map(({ top, left, ...rest }) => rest);
    },
    { selector: ACTION_SELECTOR, keywords, nClickPath: N_CLICK_BADGE_PATH_D },
  );

  return actions.map((action) => {
    const hit = extractWaitSecondsFromText(`${action.label} ${action.cardText}`);
    if (!hit) {
      return {
        ...action,
        waitSeconds: null,
        waitSource: "",
      };
    }

    return {
      ...action,
      waitSeconds: hit.waitSeconds,
      waitSource: hit.matchedText,
    };
  });
}

export function loadMissionArray(payload) {
  if (!payload) {
    return [];
  }
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload.missions)) {
    return payload.missions;
  }
  return [];
}

export function findBestAction(actions, mission) {
  let best = null;
  let bestScore = 0;

  const targetLabel = normalizeText(mission.label);
  const targetHref = normalizeText(mission.href);
  const targetCard = normalizeText(mission.cardText).slice(0, 80);
  const targetIndex = Number.isInteger(mission.actionIndex) ? mission.actionIndex : null;

  for (const action of actions) {
    let score = 0;
    const actionLabel = normalizeText(action.label);
    const actionHref = normalizeText(action.href);
    const actionCard = normalizeText(action.cardText);

    if (targetLabel && actionLabel === targetLabel) {
      score += 7;
    } else if (
      targetLabel &&
      (actionLabel.includes(targetLabel) || targetLabel.includes(actionLabel))
    ) {
      score += 4;
    }

    if (targetHref && actionHref && targetHref === actionHref) {
      score += 5;
    }

    if (targetCard && actionCard && actionCard.includes(targetCard.slice(0, 40))) {
      score += 3;
    }

    if (targetIndex !== null && action.actionIndex === targetIndex) {
      score += 2;
    }

    if (score > bestScore) {
      best = action;
      bestScore = score;
    }
  }

  if (!best) {
    return null;
  }

  return { action: best, score: bestScore };
}

export async function clickActionByIndex(page, actionIndex) {
  return page.evaluate(
    ({ selector, index }) => {
      const nodes = Array.from(document.querySelectorAll(selector));
      const node = nodes[index];
      if (!node) {
        return { clicked: false, label: "", href: "" };
      }

      const label = (node.innerText || node.textContent || "").replace(/\s+/g, " ").trim();
      const href =
        node instanceof HTMLAnchorElement
          ? node.href || node.getAttribute("href") || ""
          : node.getAttribute("href") || "";

      node.scrollIntoView({ block: "center", inline: "center", behavior: "auto" });
      node.click();
      return { clicked: true, label, href };
    },
    { selector: ACTION_SELECTOR, index: actionIndex },
  );
}

export async function clickClaimButton(page, claimKeywords) {
  return page.evaluate(
    ({ selector, keywords }) => {
      const normalize = (value) =>
        String(value ?? "")
          .replace(/\s+/g, " ")
          .trim();

      const isVisible = (el) => {
        if (!(el instanceof HTMLElement)) {
          return false;
        }
        const rect = el.getBoundingClientRect();
        if (rect.width < 4 || rect.height < 4) {
          return false;
        }
        const style = window.getComputedStyle(el);
        if (!style) {
          return false;
        }
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
          return false;
        }
        return true;
      };

      const skipWords = ["더보기", "닫기", "취소", "이전", "다음", "메뉴"];
      const nodes = Array.from(document.querySelectorAll(selector));

      for (const node of nodes) {
        if (!isVisible(node)) {
          continue;
        }

        const disabled =
          (node instanceof HTMLButtonElement && node.disabled) ||
          node.getAttribute("aria-disabled") === "true";
        if (disabled) {
          continue;
        }

        const label = normalize(node.innerText || node.textContent || "");
        if (!label) {
          continue;
        }
        if (!keywords.some((keyword) => label === keyword || label.includes(keyword))) {
          continue;
        }
        if (skipWords.some((word) => label.includes(word))) {
          continue;
        }

        node.scrollIntoView({ block: "center", inline: "center", behavior: "auto" });
        node.click();
        return { clicked: true, label };
      }

      return { clicked: false, label: "" };
    },
    { selector: ACTION_SELECTOR, keywords: claimKeywords },
  );
}

export async function clickPopupClaimButton(page, options = {}) {
  const primaryLabel = normalizeText(options.primaryLabel || DEFAULT_POPUP_PRIMARY_LABEL);
  const exactLabels = Array.isArray(options.exactLabels)
    ? options.exactLabels.map((item) => normalizeText(item)).filter(Boolean)
    : [];
  const fallbackKeywords = Array.isArray(options.fallbackKeywords)
    ? options.fallbackKeywords
    : DEFAULT_CLAIM_KEYWORDS;
  const requirePopup = Boolean(options.requirePopup);
  const strictLabels = [
    ...new Set([primaryLabel, ...exactLabels].map((item) => normalizeText(item)).filter(Boolean)),
  ];
  const allowKeywordFallback = strictLabels.length === 0 || Boolean(options.useFallbackKeywords);
  const frames = page.frames();
  const evalPayload = {
    selector: ACTION_SELECTOR,
    primary: primaryLabel,
    keywords: fallbackKeywords,
    strict: strictLabels,
    allowKeywordFallback,
    requirePopupOnly: requirePopup,
  };

  const scanAndClick = ({
    selector,
    primary,
    keywords,
    strict,
    allowKeywordFallback: allowFallback,
    requirePopupOnly,
  }) => {
    const normalize = (value) =>
      String(value ?? "")
        .replace(/\s+/g, " ")
        .trim();

    const isVisible = (el) => {
      if (!(el instanceof HTMLElement)) {
        return false;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4) {
        return false;
      }
      const style = window.getComputedStyle(el);
      if (!style) {
        return false;
      }
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
        return false;
      }
      return true;
    };

    const popupSelector =
      "[role='dialog'], [aria-modal='true'], div[class*='popup'], div[class*='modal'], div[class*='layer']";
    const skipWords = ["더보기", "닫기", "취소", "이전", "다음", "메뉴"];
    const nodes = Array.from(document.querySelectorAll(selector));
    const strictSet = new Set(
      (Array.isArray(strict) ? strict : [])
        .map((value) => normalize(value))
        .filter(Boolean),
    );

    let best = null;
    let bestScore = 0;

    for (const node of nodes) {
      if (!isVisible(node)) {
        continue;
      }

      const disabled =
        (node instanceof HTMLButtonElement && node.disabled) ||
        node.getAttribute("aria-disabled") === "true";
      if (disabled) {
        continue;
      }

      const label = normalize(node.innerText || node.textContent || "");
      if (!label) {
        continue;
      }
      if (skipWords.some((word) => label.includes(word))) {
        continue;
      }

      const popupRoot = node.closest(popupSelector);
      const inPopup = Boolean(popupRoot && isVisible(popupRoot));
      if (requirePopupOnly && !inPopup) {
        continue;
      }

      const exactPrimary = primary && label === primary;
      const includesPrimary = primary && label.includes(primary);
      const exactLabelMatch = strictSet.has(label);
      const fallbackMatch = keywords.some((keyword) => label === keyword || label.includes(keyword));
      if (strictSet.size > 0) {
        if (!exactPrimary && !exactLabelMatch) {
          continue;
        }
      } else {
        if (!exactPrimary && !includesPrimary && !fallbackMatch) {
          continue;
        }
      }

      let score = 0;
      if (exactPrimary) {
        score += 300;
      } else if (includesPrimary) {
        score += 220;
      }
      if (label.includes("포인트") && label.includes("받기")) {
        score += 120;
      }
      if (exactLabelMatch) {
        score += 220;
      }
      if (fallbackMatch && allowFallback) {
        score += 80;
      }

      if (inPopup) {
        score += 80;
      }

      if (score > bestScore) {
        best = node;
        bestScore = score;
      }
    }

    if (!best) {
      return {
        clicked: false,
        label: "",
        inPopup: false,
        score: 0,
      };
    }

    const clickedLabel = normalize(best.innerText || best.textContent || "");
    const popupRoot = best.closest(popupSelector);
    const inPopup = Boolean(popupRoot && isVisible(popupRoot));
    best.scrollIntoView({ block: "center", inline: "center", behavior: "auto" });
    best.click();
    return {
      clicked: true,
      label: clickedLabel,
      inPopup,
      score: bestScore,
    };
  };

  for (const frame of frames) {
    try {
      const result = await frame.evaluate(scanAndClick, evalPayload);
      if (result?.clicked) {
        return {
          ...result,
          frameUrl: frame.url(),
          via: "dom-scan",
        };
      }
    } catch {
      // Skip frames that cannot be evaluated reliably.
    }
  }

  // Fallback: use Playwright locators for cases where popup DOM/class differs or uses shadow internals.
  const strictRegexEntries = strictLabels.map((label) => ({
    label,
    regex: new RegExp(`^\\s*${escapeRegExp(label)}\\s*$`),
  }));
  for (const frame of frames) {
    try {
      for (const entry of strictRegexEntries) {
        const exactRole = frame.getByRole("button", { name: entry.regex }).first();
        if (await exactRole.isVisible({ timeout: 250 }).catch(() => false)) {
          await exactRole.click({ timeout: 1500 });
          return {
            clicked: true,
            label: entry.label,
            inPopup: false,
            score: 1000,
            frameUrl: frame.url(),
            via: "role-exact",
          };
        }

        const exactText = frame.getByText(entry.regex).first();
        if (await exactText.isVisible({ timeout: 250 }).catch(() => false)) {
          await exactText.click({ timeout: 1500 });
          return {
            clicked: true,
            label: entry.label,
            inPopup: false,
            score: 900,
            frameUrl: frame.url(),
            via: "text-exact",
          };
        }
      }
    } catch {
      // Continue scanning next frame.
    }
  }

  return {
    clicked: false,
    label: "",
    inPopup: false,
    score: 0,
    frameUrl: "",
    via: "",
  };
}

export async function detectAlreadyCompletedPopup(page, options = {}) {
  const patterns = Array.isArray(options.patterns)
    ? options.patterns.map((item) => normalizeText(item)).filter(Boolean)
    : [...DEFAULT_ALREADY_COMPLETED_PATTERNS];
  const confirmLabels = Array.isArray(options.confirmLabels)
    ? options.confirmLabels.map((item) => normalizeText(item)).filter(Boolean)
    : [...DEFAULT_ALREADY_COMPLETED_CONFIRM_LABELS];
  const frames = page.frames();
  const evalPayload = {
    selector: ACTION_SELECTOR,
    popupSelector:
      "[role='dialog'], [aria-modal='true'], div[class*='popup'], div[class*='modal'], div[class*='layer']",
    patterns,
    confirmLabels,
  };

  const scanPopup = ({ selector, popupSelector, patterns: matchPatterns, confirmLabels: okLabels }) => {
    const normalize = (value) =>
      String(value ?? "")
        .replace(/\s+/g, " ")
        .trim();

    const isVisible = (el) => {
      if (!(el instanceof HTMLElement)) {
        return false;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4) {
        return false;
      }
      const style = window.getComputedStyle(el);
      if (!style) {
        return false;
      }
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
        return false;
      }
      return true;
    };

    const visiblePopups = Array.from(document.querySelectorAll(popupSelector))
      .filter((el) => isVisible(el))
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          el,
          rect,
          area: rect.width * rect.height,
          text: normalize(el.innerText || el.textContent || ""),
        };
      })
      .sort((a, b) => b.area - a.area);

    for (const popup of visiblePopups) {
      const matchedPattern = matchPatterns.find((pattern) => popup.text.includes(pattern));
      if (!matchedPattern) {
        continue;
      }

      const candidates = Array.from(popup.el.querySelectorAll(selector))
        .filter((node) => isVisible(node))
        .map((node) => {
          const label = normalize(node.innerText || node.textContent || "");
          const disabled =
            (node instanceof HTMLButtonElement && node.disabled) ||
            node.getAttribute("aria-disabled") === "true";
          if (!label || disabled) {
            return null;
          }

          const rect = node.getBoundingClientRect();
          const exact = okLabels.some((okLabel) => label === okLabel);
          const includes = okLabels.some((okLabel) => label.includes(okLabel));

          let score = 0;
          if (exact) {
            score += 350;
          } else if (includes) {
            score += 240;
          }
          if (rect.width >= 120 && rect.height >= 36) {
            score += 60;
          }
          if (label.length <= 12) {
            score += 20;
          }

          return {
            node,
            label,
            score,
          };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score);

      const confirm = candidates[0];
      if (confirm && confirm.score >= 220) {
        confirm.node.scrollIntoView({ block: "center", inline: "center", behavior: "auto" });
        confirm.node.click();
        return {
          detected: true,
          clickedConfirm: true,
          confirmLabel: confirm.label,
          matchedPattern,
          popupText: popup.text.slice(0, 220),
        };
      }

      return {
        detected: true,
        clickedConfirm: false,
        confirmLabel: "",
        matchedPattern,
        popupText: popup.text.slice(0, 220),
      };
    }

    return {
      detected: false,
      clickedConfirm: false,
      confirmLabel: "",
      matchedPattern: "",
      popupText: "",
    };
  };

  for (const frame of frames) {
    try {
      const result = await frame.evaluate(scanPopup, evalPayload);
      if (result?.detected) {
        return {
          ...result,
          frameUrl: frame.url(),
          via: "popup-text",
        };
      }
    } catch {
      // Skip frames that cannot be evaluated reliably.
    }
  }

  const regexEntries = patterns
    .map((pattern) => normalizeText(pattern))
    .filter(Boolean)
    .map((pattern) => {
      const fragments = pattern
        .split(/\s+/)
        .map((part) => escapeRegExp(part))
        .filter(Boolean);
      if (fragments.length === 0) {
        return null;
      }
      return {
        pattern,
        regex: new RegExp(fragments.join("\\s*"), "i"),
      };
    })
    .filter(Boolean);
  const confirmRegex = new RegExp(
    `^\\s*(?:${confirmLabels.map((label) => escapeRegExp(label)).join("|")})\\s*$`,
  );
  const confirmLooseRegex = new RegExp(
    `${confirmLabels.map((label) => escapeRegExp(label)).join("|")}`,
  );

  for (const frame of frames) {
    try {
      for (const entry of regexEntries) {
        const textHit = frame.getByText(entry.regex).first();
        const visible = await textHit.isVisible({ timeout: 350 }).catch(() => false);
        if (!visible) {
          continue;
        }

        let clickedConfirm = false;
        let confirmLabel = "";
        const roleButton = frame.getByRole("button", { name: confirmRegex }).first();
        if (await roleButton.isVisible({ timeout: 250 }).catch(() => false)) {
          await roleButton.click({ timeout: 1500 }).catch(() => {});
          clickedConfirm = true;
          confirmLabel = normalizeText(await roleButton.innerText().catch(() => "확인"));
        } else {
          const textButton = frame.getByText(confirmRegex).first();
          if (await textButton.isVisible({ timeout: 250 }).catch(() => false)) {
            await textButton.click({ timeout: 1500 }).catch(() => {});
            clickedConfirm = true;
            confirmLabel = normalizeText(await textButton.innerText().catch(() => "확인"));
          } else {
            const looseButton = frame.getByText(confirmLooseRegex).first();
            if (await looseButton.isVisible({ timeout: 250 }).catch(() => false)) {
              await looseButton.click({ timeout: 1500 }).catch(() => {});
              clickedConfirm = true;
              confirmLabel = normalizeText(await looseButton.innerText().catch(() => "확인"));
            }
          }
        }

        return {
          detected: true,
          clickedConfirm,
          confirmLabel,
          matchedPattern: entry.pattern,
          popupText: normalizeText(await textHit.innerText().catch(() => "")).slice(0, 220),
          frameUrl: frame.url(),
          via: "locator-text",
        };
      }
    } catch {
      // Ignore frame locator fallback errors.
    }
  }

  return {
    detected: false,
    clickedConfirm: false,
    confirmLabel: "",
    matchedPattern: "",
    popupText: "",
    frameUrl: "",
    via: "",
  };
}

export async function clickPopupClaimByVisualPosition(page) {
  const frames = page.frames();
  const evalPayload = {
    modalSelector:
      "[role='dialog'], [aria-modal='true'], div[class*='popup'], div[class*='modal'], div[class*='layer']",
    actionSelector: "button, a, [role='button'], div, span",
  };

  const scanAndVisualClick = ({ modalSelector, actionSelector }) => {
    const isVisible = (el) => {
      if (!(el instanceof HTMLElement)) {
        return false;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4) {
        return false;
      }
      const style = window.getComputedStyle(el);
      if (!style) {
        return false;
      }
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
        return false;
      }
      return true;
    };

    const parseRgb = (value) => {
      const matched = String(value ?? "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
      if (!matched) {
        return null;
      }
      return {
        r: Number(matched[1]),
        g: Number(matched[2]),
        b: Number(matched[3]),
      };
    };

    const isGreenish = (el) => {
      const style = window.getComputedStyle(el);
      if (!style) {
        return false;
      }
      const bg = parseRgb(style.backgroundColor);
      if (!bg) {
        return false;
      }
      return bg.g >= 130 && bg.g >= bg.r + 20 && bg.g >= bg.b + 20;
    };

    const normalize = (value) =>
      String(value ?? "")
        .replace(/\s+/g, " ")
        .trim();

    const modals = Array.from(document.querySelectorAll(modalSelector))
      .filter((el) => isVisible(el))
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        const dx = rect.left + rect.width / 2 - cx;
        const dy = rect.top + rect.height / 2 - cy;
        const centerDistance = Math.hypot(dx, dy);
        return {
          el,
          rect,
          centerDistance,
          area: rect.width * rect.height,
        };
      })
      .filter((item) => item.rect.width >= 220 && item.rect.height >= 220)
      .sort((a, b) => a.centerDistance - b.centerDistance || b.area - a.area);

    const modal = modals[0];
    if (!modal) {
      return {
        clicked: false,
        label: "",
        score: 0,
      };
    }

    const modalRect = modal.rect;
    const bottomThreshold = modalRect.top + modalRect.height * 0.55;
    const candidates = Array.from(modal.el.querySelectorAll(actionSelector))
      .filter((el) => isVisible(el))
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const label = normalize(el.innerText || el.textContent || "");
        const area = rect.width * rect.height;
        const inBottom = rect.top >= bottomThreshold;
        const greenish = isGreenish(el);
        let score = 0;
        if (inBottom) {
          score += 120;
        }
        if (greenish) {
          score += 160;
        }
        if (rect.width >= 140 && rect.height >= 36) {
          score += 90;
        }
        if (label.length > 0 && label.length <= 20) {
          score += 40;
        }
        if (label.includes("포인트") || label.includes("받기")) {
          score += 60;
        }
        score += Math.min(80, area / 5000);

        return {
          el,
          rect,
          label,
          score,
        };
      })
      .filter((item) => item.score >= 170)
      .sort((a, b) => b.score - a.score);

    if (candidates.length > 0) {
      const best = candidates[0];
      best.el.scrollIntoView({ block: "center", inline: "center", behavior: "auto" });
      best.el.click();
      return {
        clicked: true,
        label: best.label,
        score: best.score,
      };
    }

    const clickX = modalRect.left + modalRect.width / 2;
    const clickY = modalRect.top + modalRect.height * 0.86;
    const target = document.elementFromPoint(clickX, clickY);
    if (target && target instanceof HTMLElement && isVisible(target)) {
      target.click();
      return {
        clicked: true,
        label: normalize(target.innerText || target.textContent || ""),
        score: 140,
      };
    }

    return {
      clicked: false,
      label: "",
      score: 0,
    };
  };

  for (const frame of frames) {
    try {
      const result = await frame.evaluate(scanAndVisualClick, evalPayload);
      if (result?.clicked) {
        return {
          ...result,
          frameUrl: frame.url(),
          via: "visual-fallback",
        };
      }
    } catch {
      // Skip frames that cannot be evaluated reliably.
    }
  }

  return {
    clicked: false,
    label: "",
    score: 0,
    frameUrl: "",
    via: "",
  };
}

export function missionKey(mission) {
  const label = normalizeText(mission.label);
  const href = normalizeText(mission.href);
  const card = normalizeText(mission.cardText).slice(0, 60);
  return `${label}|${href}|${card}`;
}
