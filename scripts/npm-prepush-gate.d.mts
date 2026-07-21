export interface PrePushUpdate {
  localRef: string;
  localSha: string;
  remoteRef: string;
  remoteSha: string;
}

export interface FailureMessageInput {
  packageName: string;
  localVersion: string;
  npmVersion: string;
}

export function parsePrePushUpdates(input: string): PrePushUpdate[];
export function isProtectedMainPush(updates: PrePushUpdate[]): boolean;
export function compareSemver(left: string, right: string): -1 | 0 | 1;
export function shouldBlockPushForUnpublishedVersion(localVersion: string, npmVersion: string): boolean;
export function buildFailureMessage(input: FailureMessageInput): string;
export function run(argv?: string[], options?: { cwd?: string; stdinText?: string }): Promise<number>;
