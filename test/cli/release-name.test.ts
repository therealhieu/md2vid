import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyPackageName } from "../../scripts/check_release_name.ts";

test("an npm E404 means the first-release name is available", () => {
  assert.equal(
    classifyPackageName({ status: 1, stdout: "", stderr: "E404 Not Found" }, "therealhieu"),
    "available",
  );
});

test("an existing package is allowed only when the current user is a maintainer", () => {
  const owned = JSON.stringify([{ name: "therealhieu", email: "public@example.com" }]);
  assert.equal(
    classifyPackageName({ status: 0, stdout: owned, stderr: "" }, "therealhieu"),
    "owned",
  );
  assert.throws(
    () => classifyPackageName({ status: 0, stdout: owned, stderr: "" }, "someone-else"),
    /owned by \[therealhieu\]/,
  );
});

test("non-404 registry failures stop the release", () => {
  assert.throws(
    () => classifyPackageName({ status: 1, stdout: "", stderr: "ECONNRESET" }, "therealhieu"),
    /registry lookup failed/,
  );
});
