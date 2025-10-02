import { execSync } from "child_process";

function tryExec(command: string, cwd?: string): string | null {
  try {
    return execSync(command, { cwd, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

function getRepoTopLevel(startCwd: string): string | null {
  const top = tryExec("git rev-parse --show-toplevel", startCwd);
  return top || null;
}

function isGitDirty(): boolean {
  const top = getRepoTopLevel(process.cwd());
  const dirty = top && tryExec("git status --porcelain", top);
  return typeof dirty === "string" && dirty.length > 0;
}

function getGitHash(): string {
  if (process.env.GIT_HASH) return process.env.GIT_HASH;
  if (process.env.npm_package_gitHead) return process.env.npm_package_gitHead;

  const top = getRepoTopLevel(process.cwd());
  const hash = top && tryExec('git log -1 --pretty=format:"%H"', top);
  return hash || "unknown";
}

function getGitBranch(): string {
  if (process.env.GIT_BRANCH) return process.env.GIT_BRANCH;

  const top = getRepoTopLevel(process.cwd());
  const branch = top && tryExec("git rev-parse --abbrev-ref HEAD", top);
  return branch || "unknown";
}

class VersionInfo {
  private static instance: VersionInfo;
  private gitHash: string;
  private gitBranch: string;
  private gitDirty: boolean;

  private constructor() {
    this.gitDirty = isGitDirty();
    this.gitHash = getGitHash();
    this.gitBranch = getGitBranch();
  }

  public static getInstance(): VersionInfo {
    if (!VersionInfo.instance) {
      VersionInfo.instance = new VersionInfo();
    }
    return VersionInfo.instance;
  }

  public getVersion(): string {
    return process.env.VERSION || "unknown";
  }

  public getGitHash(): string {
    return this.gitHash.slice(0, 7);
  }

  public getGitFullHash(): string {
    return this.gitHash;
  }

  public isGitDirty(): boolean {
    return this.gitDirty;
  }

  public getGitBranch(): string {
    return this.gitBranch;
  }

  public getNodeVersion(): string {
    return process.version;
  }
}

export const versionInfo = VersionInfo.getInstance();
