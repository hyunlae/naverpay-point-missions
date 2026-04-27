import test from "node:test";
import assert from "node:assert/strict";

import {
  ENSURE_USAGE_TEXT,
  parseInstallLocations,
  resolveEnsureOptions,
} from "../scripts/ensure_runtime.mjs";

test("ensure_runtime parses playwright install locations", () => {
  const locations = parseInstallLocations(`
Chrome for Testing 145.0.7632.6
  Install location:    /Users/example/Library/Caches/ms-playwright/chromium-1208

Chrome Headless Shell 145.0.7632.6
  Install location:    /Users/example/Library/Caches/ms-playwright/chromium_headless_shell-1208
`);

  assert.deepEqual(locations, [
    "/Users/example/Library/Caches/ms-playwright/chromium-1208",
    "/Users/example/Library/Caches/ms-playwright/chromium_headless_shell-1208",
  ]);
});

test("ensure_runtime defaults to automatic installs", () => {
  const options = resolveEnsureOptions([]);

  assert.equal(options.installPackage, true);
  assert.equal(options.installBrowsers, true);
});

test("ensure_runtime rejects invalid booleans", () => {
  assert.throws(
    () => resolveEnsureOptions(["--install-package", "maybe"]),
    /expects true\/false/i,
  );
});

test("ensure_runtime help mentions preflight use", () => {
  assert.match(ENSURE_USAGE_TEXT, /run_missions\/discover_missions/);
});
