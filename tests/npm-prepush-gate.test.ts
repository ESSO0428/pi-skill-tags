import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFailureMessage,
  compareSemver,
  isProtectedMainPush,
  parsePrePushUpdates,
  shouldBlockPushForUnpublishedVersion,
} from "../scripts/npm-prepush-gate.mjs";

test("parsePrePushUpdates reads git pre-push stdin lines", () => {
  const updates = parsePrePushUpdates(
    "refs/heads/main abc123 refs/heads/main def456\nrefs/heads/feature 111 refs/heads/feature 222\n",
  );

  assert.deepEqual(updates, [
    {
      localRef: "refs/heads/main",
      localSha: "abc123",
      remoteRef: "refs/heads/main",
      remoteSha: "def456",
    },
    {
      localRef: "refs/heads/feature",
      localSha: "111",
      remoteRef: "refs/heads/feature",
      remoteSha: "222",
    },
  ]);
});

test("isProtectedMainPush only guards pushes targeting remote main", () => {
  assert.equal(
    isProtectedMainPush([
      {
        localRef: "refs/heads/main",
        localSha: "abc123",
        remoteRef: "refs/heads/main",
        remoteSha: "def456",
      },
    ]),
    true,
  );

  assert.equal(
    isProtectedMainPush([
      {
        localRef: "refs/heads/feature",
        localSha: "abc123",
        remoteRef: "refs/heads/feature",
        remoteSha: "def456",
      },
    ]),
    false,
  );
});

test("compareSemver compares numeric version parts", () => {
  assert.equal(compareSemver("0.1.1", "0.1.1"), 0);
  assert.equal(compareSemver("0.1.2", "0.1.1"), 1);
  assert.equal(compareSemver("0.2.0", "0.10.0"), -1);
});

test("shouldBlockPushForUnpublishedVersion blocks when local version is ahead of npm", () => {
  assert.equal(shouldBlockPushForUnpublishedVersion("0.1.2", "0.1.1"), true);
  assert.equal(shouldBlockPushForUnpublishedVersion("0.1.1", "0.1.1"), false);
  assert.equal(shouldBlockPushForUnpublishedVersion("0.1.0", "0.1.1"), false);
});

test("buildFailureMessage explains the workflow is intentional", () => {
  const message = buildFailureMessage({
    packageName: "@esso0428/pi-skill-tags",
    localVersion: "0.1.2",
    npmVersion: "0.1.1",
  });

  assert.match(message, /intentional release gate/i);
  assert.match(message, /publish first, push main second/i);
  assert.match(message, /SKIP_NPM_GATE=1 git push/i);
});
