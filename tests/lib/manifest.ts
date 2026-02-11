import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { getTestsDir } from "./env.js";

export interface ManifestIssue {
  key: string;
  id: string;
  identifier: string;
  title: string;
  wave: number;
  blockedByKeys: string[];
}

export interface TestManifest {
  createdAt: string;
  projectId: string;
  projectName: string;
  teamId: string;
  teamKey: string;
  issues: ManifestIssue[];
  dependencyMap: Record<string, string[]>;
  waves: Record<string, string[]>;
  testRepoPath: string;
  githubRepo?: string;
  pgContainerId?: string;
  databaseUrl?: string;
}

const MANIFEST_FILENAME = "test-manifest-single.json";

function manifestPath(): string {
  return resolve(getTestsDir(), MANIFEST_FILENAME);
}

export function manifestExists(): boolean {
  return existsSync(manifestPath());
}

export function readManifest(): TestManifest {
  const p = manifestPath();
  if (!existsSync(p)) {
    throw new Error(`Manifest not found: ${p}`);
  }
  return JSON.parse(readFileSync(p, "utf-8"));
}

export function writeManifest(manifest: TestManifest): void {
  writeFileSync(manifestPath(), JSON.stringify(manifest, null, 2) + "\n");
}

export function deleteManifest(): void {
  const p = manifestPath();
  if (existsSync(p)) {
    unlinkSync(p);
  }
}
