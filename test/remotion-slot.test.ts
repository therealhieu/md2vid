// remotion-slot.test.ts — the remotion adapter is now REAL (Part B). This test
// inverted from its reserved-slot form: it asserted every method threw
// "not implemented"; it now asserts the adapter is wired and its methods no longer
// throw the placeholder. Behavioral coverage lives in frameworks/remotion/__tests__/.

import { test } from "node:test";
import assert from "node:assert/strict";
import { getAdapter, FRAMEWORKS } from "../frameworks/index.ts";

test("getAdapter('remotion') resolves an adapter named remotion", () => {
  assert.equal(getAdapter("remotion").name, "remotion");
});

test("remotion exposes the complete scaffold lifecycle as real functions", () => {
  const a = getAdapter("remotion");
  for (const method of [
    "scaffoldSpec",
    "writeScaffoldRuntime",
    "ensureRuntime",
    "emit",
    "verify",
  ] as const) {
    assert.equal(typeof a[method], "function", `remotion.${method} must be a function`);
  }
  // verify on a non-existent dir returns findings (an error finding), never the
  // "not implemented" placeholder throw.
  let threwNotImplemented = false;
  try {
    a.verify("/nonexistent-remotion-project-xyz");
  } catch (e) {
    if (/not implemented/.test(String(e))) threwNotImplemented = true;
  }
  assert.equal(threwNotImplemented, false, "verify must no longer throw 'not implemented'");
});

test("the registry holds both hyperframes and remotion", () => {
  assert.deepEqual(Object.keys(FRAMEWORKS).sort(), ["hyperframes", "remotion"]);
});
