import test from "node:test";
import assert from "node:assert/strict";

import {
  REVIEWED_EXECUTION_REQUIRED_MESSAGE,
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
