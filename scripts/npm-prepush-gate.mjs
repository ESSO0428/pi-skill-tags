import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const PROTECTED_REMOTE_REF = "refs/heads/main";
const ZERO_SHA_RE = /^0+$/;
const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/;

export function parsePrePushUpdates(input) {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [localRef, localSha, remoteRef, remoteSha] = line.split(/\s+/);
      return { localRef, localSha, remoteRef, remoteSha };
    });
}

export function isProtectedMainPush(updates) {
  return updates.some((update) =>
    update.remoteRef === PROTECTED_REMOTE_REF &&
    update.localSha &&
    !ZERO_SHA_RE.test(update.localSha)
  );
}

function parseSemver(version) {
  const match = String(version).trim().match(SEMVER_RE);
  if (!match) {
    throw new Error(`Unsupported version format: ${version}`);
  }
  return match.slice(1, 4).map((part) => Number(part));
}

export function compareSemver(left, right) {
  const leftParts = parseSemver(left);
  const rightParts = parseSemver(right);

  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] > rightParts[index]) return 1;
    if (leftParts[index] < rightParts[index]) return -1;
  }
  return 0;
}

export function shouldBlockPushForUnpublishedVersion(localVersion, npmVersion) {
  return compareSemver(localVersion, npmVersion) > 0;
}

export function buildFailureMessage({ packageName, localVersion, npmVersion }) {
  return [
    "",
    "[npm gate] Intentional release gate: publish first, push main second.",
    "[npm gate] This repo blocks pushes to main when npm is behind the local package version.",
    `[npm gate] Local package: ${packageName}@${localVersion}`,
    `[npm gate] npm visible version: ${npmVersion}`,
    "[npm gate] Required flow:",
    "[npm gate]   1. publish the package to npm",
    "[npm gate]   2. wait until npm can resolve the new version",
    "[npm gate]   3. push main",
    "[npm gate] Temporary override if you really need it: SKIP_NPM_GATE=1 git push",
    "",
  ].join("\n");
}

function readPackageInfo(cwd) {
  const packageJsonPath = path.join(cwd, "package.json");
  const manifest = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  return { packageName: manifest.name, localVersion: manifest.version };
}

function readNpmVersion(packageName) {
  try {
    const raw = execFileSync("npm", ["view", packageName, "version", "--json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed === "string" ? parsed : null;
  } catch {
    return null;
  }
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return chunks.join("");
}

export async function run(argv = process.argv.slice(2), options = {}) {
  const { cwd = process.cwd(), stdinText } = options;
  const manualMainCheck = argv.includes("--check-main");
  const updates = manualMainCheck
    ? [{ localRef: "HEAD", localSha: "LOCAL", remoteRef: PROTECTED_REMOTE_REF, remoteSha: "REMOTE" }]
    : parsePrePushUpdates(stdinText ?? await readStdin());

  if (!isProtectedMainPush(updates)) {
    return 0;
  }

  if (process.env.SKIP_NPM_GATE === "1") {
    console.error("[npm gate] SKIP_NPM_GATE=1 set; bypassing intentional release gate for this push.");
    return 0;
  }

  const { packageName, localVersion } = readPackageInfo(cwd);
  const npmVersion = readNpmVersion(packageName);

  if (!npmVersion || shouldBlockPushForUnpublishedVersion(localVersion, npmVersion)) {
    console.error(buildFailureMessage({
      packageName,
      localVersion,
      npmVersion: npmVersion ?? "not visible on npm",
    }));
    return 1;
  }

  console.error(
    `[npm gate] main push allowed: ${packageName}@${localVersion} is already visible on npm (latest: ${npmVersion}).`,
  );
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const exitCode = await run();
  process.exit(exitCode);
}
