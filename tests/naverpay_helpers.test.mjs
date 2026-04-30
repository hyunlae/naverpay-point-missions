import test from "node:test";
import assert from "node:assert/strict";

import {
  extractWaitSecondsFromText,
  findBestAction,
  hasNClickBadgeSignal,
  HEADLESS_CHANNEL_FALLBACK,
  isLowQualityMissionLabel,
  isHeadlessShellLaunchFailure,
  launchContextWithLoginBootstrap,
  normalizeMissionCatalog,
  resolveMissionWaitSeconds,
} from "../scripts/naverpay_helpers.mjs";

test("extractWaitSecondsFromText prefers the largest detected wait", () => {
  const hit = extractWaitSecondsFromText("최소 3초 머물고, 보너스로 2분 동안 유지");

  assert.deepEqual(hit, {
    waitSeconds: 120,
    matchedText: "2분 동안",
  });
});

test("resolveMissionWaitSeconds clamps oversized waits from mission text", () => {
  const resolved = resolveMissionWaitSeconds(
    { label: "5분 동안 머물기", cardText: "" },
    {},
    { defaultWaitSeconds: 7, minWaitSeconds: 3, maxWaitSeconds: 120 },
  );

  assert.deepEqual(resolved, {
    waitSeconds: 120,
    source: "mission.text:5분 동안",
  });
});

test("findBestAction prefers the exact href match over partial label match", () => {
  const mission = {
    label: "오늘의집",
    href: "https://example.com/exact",
    cardText: "오늘의집 3초 머물기",
    actionIndex: 7,
  };

  const best = findBestAction(
    [
      {
        label: "오늘의집 이벤트",
        href: "https://example.com/partial",
        cardText: "오늘의집 3초 머물기",
        actionIndex: 1,
      },
      {
        label: "오늘의집",
        href: "https://example.com/exact",
        cardText: "오늘의집 3초 머물기",
        actionIndex: 7,
      },
    ],
    mission,
  );

  assert.equal(best?.action.href, "https://example.com/exact");
  assert.ok((best?.score ?? 0) >= 10);
});

test("hasNClickBadgeSignal falls back to visible badge text heuristics", () => {
  assert.equal(
    hasNClickBadgeSignal({
      hasNClickBadge: false,
      label: "지금 클릭 10원 받기",
      cardText: "",
    }),
    true,
  );
});

test("isLowQualityMissionLabel rejects isolated jamo noise", () => {
  assert.equal(isLowQualityMissionLabel("클릭 10원 ㅁ ㅁ"), true);
  assert.equal(isLowQualityMissionLabel("메디큐브 클릭 10원"), false);
});

test("isHeadlessShellLaunchFailure detects mach port headless shell crashes", () => {
  assert.equal(
    isHeadlessShellLaunchFailure(
      new Error(
        "browserType.launchPersistentContext: Target page, context or browser has been closed\nchrome-headless-shell\nPermission denied (1100)",
      ),
    ),
    true,
  );
  assert.equal(isHeadlessShellLaunchFailure(new Error("network timeout")), false);
});

test("normalizeMissionCatalog collapses duplicate campaigns and drops low-quality labels", () => {
  const normalized = normalizeMissionCatalog([
    {
      label: "메디큐브",
      href: "https://brand.example/offer?utm_source=benefit_a",
      cardText: "메디큐브 클릭 15원",
      sourceListUrl: "https://point.pay.naver.com/source/a",
      waitSeconds: 7,
    },
    {
      label: "메디큐브",
      href: "https://brand.example/offer?utm_source=benefit_b",
      cardText: "메디큐브 클릭 15원 랜덤딜",
      sourceListUrl: "https://point.pay.naver.com/source/b",
      waitSeconds: 7,
    },
    {
      label: "클릭 10원 ㅁ ㅁ",
      href: "https://brand.example/noisy",
      cardText: "클릭 10원 ㅁ ㅁ",
      sourceListUrl: "https://point.pay.naver.com/source/c",
      waitSeconds: 7,
    },
  ]);

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].label, "메디큐브");
});

test("launchContextWithLoginBootstrap reuses an existing headless session when already logged in", async () => {
  const launches = [];
  const browserType = {
    async launchPersistentContext(_stateDir, options) {
      launches.push(options.headless);
      const page = { id: `page-${launches.length}` };
      return {
        pages() {
          return [page];
        },
        async newPage() {
          return page;
        },
        async close() {},
      };
    },
  };
  const loginCalls = [];

  const result = await launchContextWithLoginBootstrap({
    browserType,
    stateDir: "/tmp/naverpay-profile",
    headless: true,
    loginTimeoutSec: 240,
    logPrefix: "[test]",
    ensureLoggedInFn: async (page, timeoutSec) => {
      loginCalls.push({ pageId: page.id, timeoutSec });
    },
  });

  assert.deepEqual(launches, [true]);
  assert.equal(result.bootstrappedHeadfulLogin, false);
  assert.equal(result.page.id, "page-1");
  assert.equal(loginCalls.length, 1);
});

test("launchContextWithLoginBootstrap retries headless launches with Chromium channel after shell crash", async () => {
  const launches = [];
  const browserType = {
    async launchPersistentContext(_stateDir, options) {
      launches.push({ headless: options.headless, channel: options.channel ?? "" });
      if (launches.length === 1) {
        throw new Error(
          "browserType.launchPersistentContext: Target page, context or browser has been closed\nchrome-headless-shell\nPermission denied (1100)",
        );
      }
      const page = { id: `page-${launches.length}` };
      return {
        pages() {
          return [page];
        },
        async newPage() {
          return page;
        },
        async close() {},
      };
    },
  };

  const result = await launchContextWithLoginBootstrap({
    browserType,
    stateDir: "/tmp/naverpay-profile",
    headless: true,
    ensureLoggedInFn: async () => {},
  });

  assert.deepEqual(launches, [
    { headless: true, channel: "" },
    { headless: true, channel: HEADLESS_CHANNEL_FALLBACK },
  ]);
  assert.equal(result.page.id, "page-2");
});

test("launchContextWithLoginBootstrap falls back to visible login before resuming headless", async () => {
  const launches = [];
  const closed = [];
  const browserType = {
    async launchPersistentContext(_stateDir, options) {
      launches.push(options.headless);
      const page = { id: `page-${launches.length}` };
      return {
        pages() {
          return [page];
        },
        async newPage() {
          return page;
        },
        async close() {
          closed.push(page.id);
        },
      };
    },
  };
  const loginCalls = [];

  const result = await launchContextWithLoginBootstrap({
    browserType,
    stateDir: "/tmp/naverpay-profile",
    headless: true,
    loginTimeoutSec: 240,
    logPrefix: "[test]",
    ensureLoggedInFn: async (page, timeoutSec) => {
      loginCalls.push({ pageId: page.id, timeoutSec });
      if (page.id === "page-1") {
        throw new Error("Login did not complete within 10s. Complete login in the browser window and retry.");
      }
    },
  });

  assert.deepEqual(launches, [true, false, true]);
  assert.deepEqual(closed, ["page-1", "page-2"]);
  assert.equal(result.bootstrappedHeadfulLogin, true);
  assert.equal(result.page.id, "page-3");
  assert.equal(loginCalls.length, 3);
});
