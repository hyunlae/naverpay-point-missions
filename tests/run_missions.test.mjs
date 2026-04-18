import test from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";

import {
  REVIEWED_EXECUTION_REQUIRED_MESSAGE,
  main,
  resolveRunOptions,
  validateRunOptions,
} from "../scripts/run_missions.mjs";

test("run_missions defaults max to 200", () => {
  const options = resolveRunOptions(["--missions", "/tmp/naverpay-missions.json"]);
  assert.equal(options.maxCount, 200);
});

test("run_missions requires reviewed missions by default", () => {
  const options = resolveRunOptions([]);
  assert.throws(
    () => validateRunOptions(options),
    new RegExp(REVIEWED_EXECUTION_REQUIRED_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
});

test("run_missions allows reviewed snapshot execution", () => {
  const options = resolveRunOptions(["--missions", "/tmp/naverpay-missions.json"]);
  assert.doesNotThrow(() => validateRunOptions(options));
});

test("run_missions allows explicit live discovery opt-in", () => {
  const options = resolveRunOptions(["--live-discovery", "true"]);
  assert.doesNotThrow(() => validateRunOptions(options));
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
