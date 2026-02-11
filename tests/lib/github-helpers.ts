import { execSync } from "node:child_process";

function gh(args: string, opts?: { cwd?: string }): string {
  return execSync(`gh ${args}`, {
    cwd: opts?.cwd,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

export function createTestRepo(
  org: string,
  name: string,
  localPath: string
): string {
  const fullName = `${org}/${name}`;

  // Create the remote repo (public so CI runs without billing concerns)
  gh(`repo create ${fullName} --public`, { cwd: localPath });

  // Add remote and push initial commit
  execSync(`git remote add origin https://github.com/${fullName}.git`, {
    cwd: localPath,
    stdio: "pipe",
  });
  execSync("git push -u origin main", {
    cwd: localPath,
    stdio: "pipe",
  });

  return fullName;
}

export function deleteTestRepo(fullName: string): void {
  try {
    gh(`repo delete ${fullName} --yes`);
  } catch (err) {
    console.warn(`Warning: Failed to delete repo ${fullName}:`, (err as Error).message);
  }
}

export interface PRInfo {
  number: number;
  title: string;
  state: string;
  headRefName: string;
  url: string;
}

export function listPRs(repo: string): PRInfo[] {
  try {
    const json = gh(
      `pr list --repo ${repo} --json number,title,state,headRefName,url --limit 50`
    );
    return JSON.parse(json);
  } catch {
    return [];
  }
}

export function getPRDetails(repo: string, prNumber: number): PRInfo | null {
  try {
    const json = gh(
      `pr view ${prNumber} --repo ${repo} --json number,title,state,headRefName,url`
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export interface PRComment {
  author: { login: string };
  body: string;
  createdAt: string;
}

export function getPRComments(repo: string, prNumber: number): PRComment[] {
  try {
    const json = gh(
      `pr view ${prNumber} --repo ${repo} --json comments --jq '.comments'`
    );
    return JSON.parse(json);
  } catch {
    return [];
  }
}

export function branchExistsOnRemote(repo: string, branchPattern: string): boolean {
  try {
    const result = gh(`api repos/${repo}/branches --jq '.[].name'`);
    const branches = result.split("\n").filter(Boolean);
    return branches.some((b) => b.includes(branchPattern));
  } catch {
    return false;
  }
}

export interface CheckInfo {
  name: string;
  status: string;
  conclusion: string;
}

export function getPRChecks(repo: string, prNumber: number): CheckInfo[] {
  try {
    const json = gh(
      `pr checks ${prNumber} --repo ${repo} --json name,state,conclusion 2>/dev/null || echo "[]"`
    );
    return JSON.parse(json);
  } catch {
    return [];
  }
}
