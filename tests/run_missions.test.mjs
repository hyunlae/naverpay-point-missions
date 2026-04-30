import test from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";

import {
  buildExecutionResult,
  DEFAULT_EXECUTION_MODE_MESSAGE,
  main,
  preloadReviewedMissions,
  resolveRunOptions,
  validateRunOptions,
} from "../scripts/run_missions.mjs";

test("run_missions defaults max to 200", () => {
  const options = resolveRunOptions(["--missions", "/tmp/naverpay-missions.json"]);
  assert.equal(options.maxCount, 200);
});

test("run_missions enables live discovery by default", () => {
  const options = resolveRunOptions([]);
  assert.equal(options.liveDiscovery, true);
  assert.doesNotThrow(() => validateRunOptions(options));
});

test("run_missions allows reviewed snapshot execution", () => {
  const options = resolveRunOptions(["--missions", "/tmp/naverpay-missions.json"]);
  assert.doesNotThrow(() => validateRunOptions(options));
});

test("run_missions allows explicit live discovery opt-in", () => {
  const options = resolveRunOptions(["--live-discovery", "true"]);
  assert.doesNotThrow(() => validateRunOptions(options));
});

test("run_missions rejects disabling live discovery without reviewed missions", () => {
  const options = resolveRunOptions(["--live-discovery", "false"]);
  assert.throws(
    () => validateRunOptions(options),
    new RegExp(DEFAULT_EXECUTION_MODE_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
});

test("run_missions rejects invalid boolean flags", () => {
  assert.throws(
    () => resolveRunOptions(["--live-discovery", "maybe"]),
    /expects true\/false/i,
  );
});

test("run_missions preflights an empty reviewed snapshot before launching the browser", async (t) => {
  const tempFile = path.join(os.tmpdir(), `naverpay-empty-${Date.now()}.json`);
  await writeFile(tempFile, JSON.stringify({ missions: [] }), "utf8");

  const launchMock = t.mock.method(chromium, "launchPersistentContext", async () => {
    throw new Error("browser should not launch");
  });

  await main(["--missions", tempFile]);

  assert.equal(launchMock.mock.calls.length, 0);
});

test("preloadReviewedMissions normalizes duplicate campaigns and drops low-quality labels", async () => {
  const tempFile = path.join(os.tmpdir(), `naverpay-reviewed-${Date.now()}.json`);
  await writeFile(
    tempFile,
    JSON.stringify({
      missions: [
        {
          label: "메디큐브",
          href: "https://brand.example/offer?utm_source=a",
          cardText: "메디큐브 클릭 15원",
          sourceListUrl: "https://point.pay.naver.com/source/a",
        },
        {
          label: "메디큐브",
          href: "https://brand.example/offer?utm_source=b",
          cardText: "메디큐브 클릭 15원 랜덤딜",
          sourceListUrl: "https://point.pay.naver.com/source/b",
        },
        {
          label: "클릭 10원 ㅁ ㅁ",
          href: "https://brand.example/noisy",
          cardText: "클릭 10원 ㅁ ㅁ",
          sourceListUrl: "https://point.pay.naver.com/source/c",
        },
      ],
    }),
    "utf8",
  );

  const missions = await preloadReviewedMissions(tempFile);

  assert.equal(missions.length, 1);
  assert.equal(missions[0].label, "메디큐브");
});

test("buildExecutionResult marks popup-claim paths as claimed and resolved", () => {
  const result = buildExecutionResult({
    chosenAction: { label: "메디큐브", href: "https://brand.example/offer" },
    sourceUrl: "https://point.pay.naver.com/source/a",
    waitPlan: { waitSeconds: 7, source: "default-wait-seconds" },
    claim: { clicked: false },
    popupClaimClicked: true,
    popupClaimLabel: "포인트 받기",
    alreadyCompletedPopup: false,
    alreadyCompletedConfirmClicked: false,
    alreadyCompletedPopupText: "",
  });

  assert.equal(result.claimed, true);
  assert.equal(result.resolved, true);
  assert.equal(result.resolutionPath, "popup-claim");
});

test("buildExecutionResult marks already-completed paths as resolved without claiming", () => {
  const result = buildExecutionResult({
    chosenAction: { label: "메디큐브", href: "https://brand.example/offer" },
    sourceUrl: "https://point.pay.naver.com/source/a",
    waitPlan: { waitSeconds: 7, source: "default-wait-seconds" },
    claim: { clicked: false },
    popupClaimClicked: false,
    popupClaimLabel: "",
    alreadyCompletedPopup: true,
    alreadyCompletedConfirmClicked: true,
    alreadyCompletedPopupText: "캠페인 당 1회만 적립",
  });

  assert.equal(result.claimed, false);
  assert.equal(result.resolved, true);
  assert.equal(result.resolutionPath, "already-completed");
});
