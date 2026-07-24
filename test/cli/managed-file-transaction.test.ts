import assert from "node:assert/strict";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  promoteManagedFiles,
  type ManagedFile,
  type ManagedFileTransactionDependencies,
} from "../../scripts/managed_file_transaction.ts";

function root(): string {
  return mkdtempSync(join(tmpdir(), "md2vid-transaction-"));
}

function fixture(dir: string): ManagedFile[] {
  mkdirSync(join(dir, "stage"), { recursive: true });
  writeFileSync(join(dir, "a.json"), "old-a");
  writeFileSync(join(dir, "b.html"), "old-b");
  writeFileSync(join(dir, "stage", "a.json"), "new-a");
  writeFileSync(join(dir, "stage", "b.html"), "new-b");
  return [
    { target: "a.json", staged: join(dir, "stage", "a.json") },
    { target: "b.html", staged: join(dir, "stage", "b.html") },
  ];
}

function residue(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((path) => path.includes("md2vid-backup"))
    .sort();
}

test("promotes all staged files", () => {
  const dir = root();
  try {
    const files = fixture(dir);

    promoteManagedFiles(dir, join(dir, "stage"), files);

    assert.equal(readFileSync(join(dir, "a.json"), "utf8"), "new-a");
    assert.equal(readFileSync(join(dir, "b.html"), "utf8"), "new-b");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("restores all originals if the second promotion fails", () => {
  const dir = root();
  try {
    const files = fixture(dir);
    let promotions = 0;
    const deps: ManagedFileTransactionDependencies = {
      rename(source, destination) {
        if (String(source).includes(`${join(dir, "stage")}`) && ++promotions === 2) {
          throw new Error("injected promote failure");
        }
        renameSync(source, destination);
      },
    };

    assert.throws(() => promoteManagedFiles(dir, join(dir, "stage"), files, deps), /injected promote failure/);
    assert.equal(readFileSync(join(dir, "a.json"), "utf8"), "old-a");
    assert.equal(readFileSync(join(dir, "b.html"), "utf8"), "old-b");
    assert.equal(existsSync(join(dir, "stage", "a.json")), false);
    assert.equal(existsSync(join(dir, "stage", "b.html")), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("rejects unsafe absolute, traversal, duplicate, and malformed targets", () => {
  const dir = root();
  try {
    mkdirSync(join(dir, "stage"));
    writeFileSync(join(dir, "stage", "a"), "new");
    for (const target of [join(dir, "absolute.json"), "../escape.json", "a/./b", "a//b", "a\\b"]) {
      assert.throws(
        () => promoteManagedFiles(dir, join(dir, "stage"), [{ target, staged: join(dir, "stage", "a") }]),
        /unsafe managed target|escapes project root/,
        target,
      );
    }
    writeFileSync(join(dir, "stage", "b"), "new-b");
    assert.throws(
      () => promoteManagedFiles(dir, join(dir, "stage"), [
        { target: "same.json", staged: join(dir, "stage", "a") },
        { target: "same.json", staged: join(dir, "stage", "b") },
      ]),
      /duplicate managed target/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("rejects a symlink target", () => {
  const dir = root();
  try {
    mkdirSync(join(dir, "stage"));
    writeFileSync(join(dir, "real.json"), "old");
    symlinkSync(join(dir, "real.json"), join(dir, "linked.json"));
    writeFileSync(join(dir, "stage", "new.json"), "new");

    assert.throws(
      () => promoteManagedFiles(dir, join(dir, "stage"), [{ target: "linked.json", staged: join(dir, "stage", "new.json") }]),
      /symbolic link/,
    );
    assert.equal(readFileSync(join(dir, "real.json"), "utf8"), "old");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("rejects a symlink parent", () => {
  const dir = root();
  try {
    mkdirSync(join(dir, "outside"));
    symlinkSync(join(dir, "outside"), join(dir, "linked"));
    mkdirSync(join(dir, "stage"));
    writeFileSync(join(dir, "stage", "new.json"), "new");

    assert.throws(
      () => promoteManagedFiles(dir, join(dir, "stage"), [{ target: "linked/value.json", staged: join(dir, "stage", "new.json") }]),
      /symbolic link/,
    );
    assert.equal(existsSync(join(dir, "outside", "value.json")), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("rejects a missing or non-regular staged source before backups", () => {
  const dir = root();
  try {
    writeFileSync(join(dir, "a.json"), "old-a");
    mkdirSync(join(dir, "stage"));
    let renames = 0;
    const deps: ManagedFileTransactionDependencies = {
      rename(source, destination) {
        renames += 1;
        renameSync(source, destination);
      },
    };

    assert.throws(
      () => promoteManagedFiles(dir, join(dir, "stage"), [{ target: "a.json", staged: join(dir, "stage", "missing.json") }], deps),
      /staged source must be a regular file/,
    );
    assert.equal(renames, 0);
    assert.equal(readFileSync(join(dir, "a.json"), "utf8"), "old-a");

    assert.throws(
      () => promoteManagedFiles(dir, join(dir, "stage"), [{ target: "a.json", staged: join(dir, "stage") }], deps),
      /staged source escapes staging root/,
    );
    assert.equal(renames, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("rollback removes a newly created target that had no original", () => {
  const dir = root();
  try {
    mkdirSync(join(dir, "stage"));
    writeFileSync(join(dir, "existing.json"), "old");
    writeFileSync(join(dir, "stage", "new.json"), "new");
    writeFileSync(join(dir, "stage", "existing.json"), "replacement");
    let promotions = 0;
    const deps: ManagedFileTransactionDependencies = {
      rename(source, destination) {
        if (String(source).includes(join(dir, "stage")) && ++promotions === 2) {
          throw new Error("stop after new target");
        }
        renameSync(source, destination);
      },
    };

    assert.throws(() => promoteManagedFiles(dir, join(dir, "stage"), [
      { target: "created.json", staged: join(dir, "stage", "new.json") },
      { target: "existing.json", staged: join(dir, "stage", "existing.json") },
    ], deps), /stop after new target/);
    assert.equal(existsSync(join(dir, "created.json")), false);
    assert.equal(readFileSync(join(dir, "existing.json"), "utf8"), "old");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("unrelated sentinel files remain unchanged", () => {
  const dir = root();
  try {
    const files = fixture(dir);
    writeFileSync(join(dir, "sentinel.txt"), "keep-me");

    promoteManagedFiles(dir, join(dir, "stage"), files);

    assert.equal(readFileSync(join(dir, "sentinel.txt"), "utf8"), "keep-me");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("removes invocation-owned backups and staged files after success", () => {
  const dir = root();
  try {
    const files = fixture(dir);

    promoteManagedFiles(dir, join(dir, "stage"), files);

    assert.deepEqual(residue(dir), []);
    assert.equal(existsSync(join(dir, "stage", "a.json")), false);
    assert.equal(existsSync(join(dir, "stage", "b.html")), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("removes unpromoted staging files after failure", () => {
  const dir = root();
  try {
    const files = fixture(dir);
    const deps: ManagedFileTransactionDependencies = {
      rename(source, destination) {
        if (String(source).includes(join(dir, "stage"))) throw new Error("first promotion failed");
        renameSync(source, destination);
      },
    };

    assert.throws(() => promoteManagedFiles(dir, join(dir, "stage"), files, deps), /first promotion failed/);
    assert.equal(existsSync(join(dir, "stage", "a.json")), false);
    assert.equal(existsSync(join(dir, "stage", "b.html")), false);
    assert.deepEqual(residue(dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("restoration failure throws AggregateError and preserves the recovery backup", () => {
  const dir = root();
  try {
    const files = fixture(dir);
    let promotions = 0;
    const deps: ManagedFileTransactionDependencies = {
      rename(source, destination) {
        if (String(source).includes(join(dir, "stage")) && ++promotions === 2) {
          throw new Error("injected promote failure");
        }
        if (String(source).includes("md2vid-backup") && destination === join(dir, "a.json")) {
          throw new Error("injected restore failure");
        }
        renameSync(source, destination);
      },
    };

    let error: unknown;
    try {
      promoteManagedFiles(dir, join(dir, "stage"), files, deps);
      assert.fail("expected promotion to fail");
    } catch (caught) {
      error = caught;
    }
    assert.ok(error instanceof AggregateError);
    assert.match(error.message, /rollback was incomplete/);
    assert.match(error.message, /a\.json\.md2vid-backup-0/);
    assert.equal(existsSync(join(dir, "a.json.md2vid-backup-0")), true);
    assert.equal(readFileSync(join(dir, "a.json.md2vid-backup-0"), "utf8"), "old-a");
    assert.equal(existsSync(join(dir, "stage", "a.json")), false);
    assert.equal(existsSync(join(dir, "stage", "b.html")), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("backup cleanup failure keeps promoted targets and reports retained backups", () => {
  const dir = root();
  try {
    const files = fixture(dir);
    writeFileSync(join(dir, "c.txt"), "old-c");
    writeFileSync(join(dir, "stage", "c.txt"), "new-c");
    files.push({ target: "c.txt", staged: join(dir, "stage", "c.txt") });
    let backupRemovals = 0;
    const deps: ManagedFileTransactionDependencies = {
      remove(path, options) {
        if (String(path).includes("md2vid-backup") && ++backupRemovals === 2) {
          throw new Error("injected second backup cleanup failure");
        }
        rmSync(path, options);
      },
    };

    const result = promoteManagedFiles(dir, join(dir, "stage"), files, deps);

    assert.deepEqual(result.retainedBackups, [join(dir, "b.html.md2vid-backup-1")]);
    assert.equal(result.cleanupErrors.length, 1);
    assert.match(result.cleanupErrors[0].message, /injected second backup cleanup failure/);
    assert.equal(readFileSync(join(dir, "a.json"), "utf8"), "new-a");
    assert.equal(readFileSync(join(dir, "b.html"), "utf8"), "new-b");
    assert.equal(readFileSync(join(dir, "c.txt"), "utf8"), "new-c");
    assert.equal(existsSync(join(dir, "a.json.md2vid-backup-0")), false);
    assert.equal(readFileSync(join(dir, "b.html.md2vid-backup-1"), "utf8"), "old-b");
    assert.equal(existsSync(join(dir, "c.txt.md2vid-backup-2")), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("rejects aliases between targets and generated backup paths before mutation", () => {
  const dir = root();
  try {
    mkdirSync(join(dir, "stage"));
    writeFileSync(join(dir, "a"), "old-a");
    writeFileSync(join(dir, "stage", "a"), "new-a");
    writeFileSync(join(dir, "stage", "alias"), "new-alias");

    assert.throws(
      () => promoteManagedFiles(dir, join(dir, "stage"), [
        { target: "a", staged: join(dir, "stage", "a") },
        { target: "a.md2vid-backup-0", staged: join(dir, "stage", "alias") },
      ]),
      /managed target, backup, and staged paths must be distinct/,
    );
    assert.equal(readFileSync(join(dir, "a"), "utf8"), "old-a");
    assert.equal(existsSync(join(dir, "a.md2vid-backup-0")), false);
    assert.equal(readFileSync(join(dir, "stage", "a"), "utf8"), "new-a");
    assert.equal(readFileSync(join(dir, "stage", "alias"), "utf8"), "new-alias");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("rejects staged sources outside the transaction root without cleaning them", () => {
  const dir = root();
  const outside = root();
  try {
    mkdirSync(join(dir, "stage"));
    writeFileSync(join(dir, "a.json"), "old-a");
    writeFileSync(join(outside, "new.json"), "outside-new");

    assert.throws(
      () => promoteManagedFiles(dir, join(dir, "stage"), [{ target: "a.json", staged: join(outside, "new.json") }]),
      /staged source escapes staging root/,
    );
    assert.equal(readFileSync(join(dir, "a.json"), "utf8"), "old-a");
    assert.equal(readFileSync(join(outside, "new.json"), "utf8"), "outside-new");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("rejects a staged source beneath a symlink parent without cleaning it", () => {
  const dir = root();
  const outside = root();
  try {
    writeFileSync(join(dir, "a.json"), "old-a");
    writeFileSync(join(outside, "new.json"), "outside-new");
    symlinkSync(outside, join(dir, "stage"));

    assert.throws(
      () => promoteManagedFiles(dir, join(dir, "stage"), [{ target: "a.json", staged: join(dir, "stage", "new.json") }]),
      /staging root path contains a symbolic link/,
    );
    assert.equal(readFileSync(join(dir, "a.json"), "utf8"), "old-a");
    assert.equal(readFileSync(join(outside, "new.json"), "utf8"), "outside-new");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("rejects a symbolic-link transaction root", () => {
  const realRoot = root();
  const linkContainer = root();
  const linkedRoot = join(linkContainer, "linked-root");
  try {
    mkdirSync(join(realRoot, "stage"));
    writeFileSync(join(realRoot, "a.json"), "old-a");
    writeFileSync(join(realRoot, "stage", "a.json"), "new-a");
    symlinkSync(realRoot, linkedRoot);

    assert.throws(
      () => promoteManagedFiles(linkedRoot, join(linkedRoot, "stage"), [{
        target: "a.json",
        staged: join(linkedRoot, "stage", "a.json"),
      }]),
      /transaction root must not be a symbolic link/,
    );
    assert.equal(readFileSync(join(realRoot, "a.json"), "utf8"), "old-a");
    assert.equal(readFileSync(join(realRoot, "stage", "a.json"), "utf8"), "new-a");
  } finally {
    rmSync(linkContainer, { recursive: true, force: true });
    rmSync(realRoot, { recursive: true, force: true });
  }
});

test("staging contract rejects target-to-staged aliases", () => {
  const dir = root();
  const stage = join(dir, "stage");
  try {
    mkdirSync(stage);
    writeFileSync(join(stage, "a"), "new-a");

    assert.throws(
      () => promoteManagedFiles(dir, stage, [{ target: "stage/a", staged: join(stage, "a") }]),
      /managed target, backup, and staged paths must be distinct/,
    );
    assert.equal(readFileSync(join(stage, "a"), "utf8"), "new-a");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("staging contract rejects distinct managed descendants beneath stagingRoot", () => {
  const dir = root();
  const stage = join(dir, "stage");
  try {
    mkdirSync(join(stage, "input"), { recursive: true });
    writeFileSync(join(stage, "input", "a"), "new-a");

    assert.throws(
      () => promoteManagedFiles(dir, stage, [{
        target: "stage/promoted/a",
        staged: join(stage, "input", "a"),
      }]),
      /managed targets and backups must be outside staging root/,
    );
    assert.equal(readFileSync(join(stage, "input", "a"), "utf8"), "new-a");
    assert.equal(existsSync(join(stage, "promoted", "a")), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("staging contract rejects backup-to-staged aliases", () => {
  const dir = root();
  const stage = join(dir, "stage");
  try {
    mkdirSync(stage);
    writeFileSync(join(stage, "a.md2vid-backup-0"), "staged");

    assert.throws(
      () => promoteManagedFiles(dir, stage, [{
        target: "stage/a",
        staged: join(stage, "a.md2vid-backup-0"),
      }]),
      /managed target, backup, and staged paths must be distinct/,
    );
    assert.equal(readFileSync(join(stage, "a.md2vid-backup-0"), "utf8"), "staged");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("staging contract rejects duplicate staged aliases", () => {
  const dir = root();
  const stage = join(dir, "stage");
  try {
    mkdirSync(stage);
    writeFileSync(join(stage, "shared"), "staged");

    assert.throws(
      () => promoteManagedFiles(dir, stage, [
        { target: "a", staged: join(stage, "shared") },
        { target: "b", staged: join(stage, "shared") },
      ]),
      /managed target, backup, and staged paths must be distinct/,
    );
    assert.equal(readFileSync(join(stage, "shared"), "utf8"), "staged");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("staging contract rejects an unrelated in-root file outside stagingRoot", () => {
  const dir = root();
  const stage = join(dir, "stage");
  try {
    mkdirSync(stage);
    writeFileSync(join(dir, "unrelated.txt"), "do-not-touch");

    assert.throws(
      () => promoteManagedFiles(dir, stage, [{
        target: "a",
        staged: join(dir, "unrelated.txt"),
      }]),
      /staged source escapes staging root/,
    );
    assert.equal(readFileSync(join(dir, "unrelated.txt"), "utf8"), "do-not-touch");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("staging contract rejects stagingRoot outside the transaction root", () => {
  const dir = root();
  const outside = root();
  try {
    writeFileSync(join(outside, "a"), "outside");
    assert.throws(
      () => promoteManagedFiles(dir, outside, [{ target: "a", staged: join(outside, "a") }]),
      /staging root must be beneath transaction root/,
    );
    assert.equal(readFileSync(join(outside, "a"), "utf8"), "outside");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("staging contract rejects a symbolic-link stagingRoot", () => {
  const dir = root();
  const outside = root();
  const stage = join(dir, "stage");
  try {
    writeFileSync(join(outside, "a"), "outside");
    symlinkSync(outside, stage);
    assert.throws(
      () => promoteManagedFiles(dir, stage, [{ target: "a", staged: join(stage, "a") }]),
      /staging root path contains a symbolic link/,
    );
    assert.equal(readFileSync(join(outside, "a"), "utf8"), "outside");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("staging contract rejects a symbolic-link staging ancestor", () => {
  const dir = root();
  const outside = root();
  const linkedParent = join(dir, "linked-parent");
  const stage = join(linkedParent, "stage");
  try {
    mkdirSync(join(outside, "stage"));
    writeFileSync(join(outside, "stage", "a"), "outside");
    symlinkSync(outside, linkedParent);
    assert.throws(
      () => promoteManagedFiles(dir, stage, [{ target: "a", staged: join(stage, "a") }]),
      /staging root path contains a symbolic link/,
    );
    assert.equal(readFileSync(join(outside, "stage", "a"), "utf8"), "outside");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("lstat preflight rejects dangling target, parent, and backup symlinks", () => {
  for (const kind of ["target", "parent", "backup"] as const) {
    const dir = root();
    const stage = join(dir, "stage");
    try {
      mkdirSync(stage);
      writeFileSync(join(stage, "new"), "new");
      let target = "a";
      if (kind === "target") symlinkSync("missing-target", join(dir, "a"));
      if (kind === "parent") {
        symlinkSync("missing-parent", join(dir, "linked"));
        target = "linked/a";
      }
      if (kind === "backup") symlinkSync("missing-backup", join(dir, "a.md2vid-backup-0"));

      assert.throws(
        () => promoteManagedFiles(dir, stage, [{ target, staged: join(stage, "new") }]),
        /symbolic link|managed backup path already exists/,
        kind,
      );
      assert.equal(readFileSync(join(stage, "new"), "utf8"), "new");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("uses injected lstat without exists guards", () => {
  const dir = root();
  try {
    const files = fixture(dir);
    let existsCalls = 0;
    let lstatCalls = 0;
    const countedLstat = new Proxy(lstatSync, {
      apply(target, thisArg, argumentsList) {
        lstatCalls += 1;
        return Reflect.apply(target, thisArg, argumentsList);
      },
    });
    const deps: ManagedFileTransactionDependencies = {
      exists(path) {
        existsCalls += 1;
        return existsSync(path);
      },
      lstat: countedLstat,
    };

    promoteManagedFiles(dir, join(dir, "stage"), files, deps);

    assert.equal(existsCalls, 0);
    assert.ok(lstatCalls > 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
