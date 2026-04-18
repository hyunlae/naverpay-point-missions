import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("release workflow publishes GitHub releases on semver tag pushes", async () => {
  const workflow = await readFile(".github/workflows/release.yml", "utf8");

  assert.match(workflow, /name:\s*Release/i);
  assert.match(workflow, /push:\s*\n\s*tags:\s*\n\s*-\s*'v\*'/);
  assert.match(workflow, /permissions:\s*\n\s*contents:\s*write/);
  assert.match(
    workflow,
    /node scripts\/release\.mjs --version "\$\{\{ github\.ref_name \}\}" --publish-github true --skip-prepare true/,
  );
});
