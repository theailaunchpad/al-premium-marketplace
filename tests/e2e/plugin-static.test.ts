/**
 * Static validation tests for the Linear PM plugin.
 *
 * These tests validate the structural integrity of all skill and agent files
 * without making any API calls. They catch the kinds of issues found in the
 * v1.5.0 audit: wrong tool names, ghost agent references, broken links,
 * invalid frontmatter, etc.
 *
 * Run: cd tests && bun test e2e/plugin-static.test.ts
 */

import { describe, test, expect } from "bun:test";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, join, relative, dirname } from "node:path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLUGIN_DIR = resolve(
  import.meta.dir,
  "../../plugins/linear-pm"
);
const SKILLS_DIR = join(PLUGIN_DIR, "skills");
const AGENTS_DIR = join(PLUGIN_DIR, "agents");

// Valid Linear MCP method names (portable, no prefix)
const VALID_LINEAR_METHODS = [
  "get_issue",
  "list_issues",
  "save_issue",
  "get_project",
  "list_projects",
  "save_project",
  "get_milestone",
  "list_milestones",
  "save_milestone",
  "list_issue_statuses",
  "get_issue_status",
  "list_issue_labels",
  "create_issue_label",
  "list_project_labels",
  "list_comments",
  "create_comment",
  "list_cycles",
  "get_document",
  "list_documents",
  "create_document",
  "update_document",
  "extract_images",
  "get_attachment",
  "create_attachment",
  "delete_attachment",
  "list_teams",
  "get_team",
  "list_users",
  "get_user",
  "search_documentation",
];

// Methods that never existed or were renamed — should not appear in skills
const BANNED_METHODS = [
  "create_issue",
  "update_issue",
  "create_project",
  "update_project",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recursively find all files matching a predicate */
function findFiles(dir: string, predicate: (path: string) => boolean): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;

  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...findFiles(full, predicate));
    } else if (predicate(full)) {
      results.push(full);
    }
  }
  return results;
}

/** Get all SKILL.md files */
function getSkillFiles(): string[] {
  return findFiles(SKILLS_DIR, (p) => p.endsWith("SKILL.md"));
}

/** Get all agent .md files */
function getAgentFiles(): string[] {
  return findFiles(AGENTS_DIR, (p) => p.endsWith(".md"));
}

/** Get all markdown files in skills/ (including non-SKILL.md) */
function getAllSkillMarkdown(): string[] {
  return findFiles(SKILLS_DIR, (p) => p.endsWith(".md"));
}

/** Parse YAML frontmatter from a markdown file */
function parseFrontmatter(content: string): Record<string, string> | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const fm: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      fm[key] = value;
    }
  }
  return fm;
}

/** Get a short label for a file path relative to the plugin dir */
function label(filePath: string): string {
  return relative(PLUGIN_DIR, filePath);
}

// ---------------------------------------------------------------------------
// Test Suites
// ---------------------------------------------------------------------------

describe("Plugin Structure", () => {
  test("plugin.json exists and has required fields", () => {
    const pluginJsonPath = join(PLUGIN_DIR, ".claude-plugin", "plugin.json");
    expect(existsSync(pluginJsonPath)).toBe(true);

    const json = JSON.parse(readFileSync(pluginJsonPath, "utf-8"));
    expect(json.name).toBe("linear-pm");
    expect(json.description).toBeTruthy();
    expect(json.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("skills/ directory exists", () => {
    expect(existsSync(SKILLS_DIR)).toBe(true);
  });

  test("agents/ directory exists", () => {
    expect(existsSync(AGENTS_DIR)).toBe(true);
  });

  test("no empty directories exist", () => {
    const dirs = findFiles(PLUGIN_DIR, () => false); // just triggers traversal
    // Check all subdirectories of plugin root
    const checkDirs = (dir: string): string[] => {
      const empties: string[] = [];
      if (!existsSync(dir)) return empties;
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          const contents = readdirSync(full);
          if (contents.length === 0) {
            empties.push(relative(PLUGIN_DIR, full));
          }
          empties.push(...checkDirs(full));
        }
      }
      return empties;
    };

    const empties = checkDirs(PLUGIN_DIR);
    expect(empties).toEqual([]);
  });

  test("README.md exists", () => {
    expect(existsSync(join(PLUGIN_DIR, "README.md"))).toBe(true);
  });
});

describe("Skill Frontmatter", () => {
  const skillFiles = getSkillFiles();

  test("at least one SKILL.md exists", () => {
    expect(skillFiles.length).toBeGreaterThan(0);
  });

  for (const file of skillFiles) {
    const rel = label(file);

    test(`${rel} has valid frontmatter with name and description`, () => {
      const content = readFileSync(file, "utf-8");
      const fm = parseFrontmatter(content);

      expect(fm).not.toBeNull();
      expect(fm!.name).toBeTruthy();
      expect(fm!.description).toBeTruthy();
    });

    test(`${rel} frontmatter name matches directory name`, () => {
      const content = readFileSync(file, "utf-8");
      const fm = parseFrontmatter(content);
      if (!fm) return; // covered by the previous test

      const dirName = relative(SKILLS_DIR, dirname(file));
      expect(fm.name).toBe(dirName);
    });
  }
});

describe("Agent Frontmatter", () => {
  const agentFiles = getAgentFiles();

  test("at least one agent exists", () => {
    expect(agentFiles.length).toBeGreaterThan(0);
  });

  for (const file of agentFiles) {
    const rel = label(file);

    test(`${rel} has valid frontmatter with name and description`, () => {
      const content = readFileSync(file, "utf-8");
      const fm = parseFrontmatter(content);

      expect(fm).not.toBeNull();
      expect(fm!.name).toBeTruthy();
      expect(fm!.description).toBeTruthy();
    });
  }
});

describe("MCP Tool References", () => {
  const skillFiles = getAllSkillMarkdown();
  const agentFiles = getAgentFiles();
  const allFiles = [...skillFiles, ...agentFiles];

  test("no files reference mcp__linear__ (old prefixed format)", () => {
    const violations: string[] = [];

    for (const file of allFiles) {
      const content = readFileSync(file, "utf-8");
      // Match mcp__linear__ but NOT mcp__plugin_linear or mcp__claude_ai_Linear
      // (those would be a different problem). We want to ban the short form
      // mcp__linear__<method> which doesn't resolve to any real tool.
      if (/mcp__linear__\w+/.test(content)) {
        violations.push(label(file));
      }
    }

    expect(violations).toEqual([]);
  });

  test("no skills use banned method names (create_issue, update_issue, create_project)", () => {
    const violations: { file: string; method: string; line: number }[] = [];

    for (const file of skillFiles) {
      const content = readFileSync(file, "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        for (const banned of BANNED_METHODS) {
          // Match the method name as a tool reference (backticked or in a tool call pattern),
          // but not as part of prose like "the old create_issue method" in changelogs
          if (
            line.includes(`\`${banned}\``) ||
            line.includes(`__${banned}`) ||
            // Match patterns like "Use create_issue" or "the create_issue tool"
            new RegExp(`\\b(use|call|invoke|with|tool)\\b.*\\b${banned}\\b`, "i").test(line)
          ) {
            violations.push({
              file: label(file),
              method: banned,
              line: i + 1,
            });
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  test("skill tool references use valid Linear MCP method names", () => {
    // Check that when skills reference Linear tools, they use known method names
    const toolRefPattern = /`(get_|list_|save_|create_|update_|delete_|search_|extract_)\w+`/g;
    const unknownRefs: { file: string; method: string; line: number }[] = [];

    for (const file of skillFiles) {
      const content = readFileSync(file, "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let match;
        while ((match = toolRefPattern.exec(line)) !== null) {
          const method = match[0].replace(/`/g, "");
          if (!VALID_LINEAR_METHODS.includes(method) && !BANNED_METHODS.includes(method)) {
            unknownRefs.push({
              file: label(file),
              method,
              line: i + 1,
            });
          }
        }
      }
    }

    // This is a warning, not a hard failure — unknown methods might be from
    // other MCP servers. But it's useful to flag for review.
    if (unknownRefs.length > 0) {
      console.warn(
        "Unknown tool references (may be from non-Linear MCP servers):",
        unknownRefs
      );
    }
  });
});

describe("Priority Labels", () => {
  test("priority 3 is labeled Normal (not Medium)", () => {
    const violations: { file: string; line: number }[] = [];

    for (const file of getAllSkillMarkdown()) {
      const content = readFileSync(file, "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        // Match patterns like "3=Medium" or "3: Medium" in priority context
        if (/3\s*[=:]\s*Medium/i.test(lines[i])) {
          violations.push({ file: label(file), line: i + 1 });
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

describe("Cross-References", () => {
  test("no skills reference nonexistent agents", () => {
    // Collect all valid agent names from frontmatter
    const agentFiles = getAgentFiles();
    const validAgentNames = new Set<string>();
    for (const file of agentFiles) {
      const content = readFileSync(file, "utf-8");
      const fm = parseFrontmatter(content);
      if (fm?.name) validAgentNames.add(fm.name);
    }

    // Known agent references that appear in skill text
    // These are the agent names that skills invoke via the Task tool
    const agentRefPattern = /`([\w-]+)`\s+agent/g;
    const ghostRefs: { file: string; agent: string; line: number }[] = [];

    for (const file of getSkillFiles()) {
      const content = readFileSync(file, "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        let match;
        while ((match = agentRefPattern.exec(lines[i])) !== null) {
          const agentName = match[1];
          // Skip generic agent types that aren't plugin-specific
          const genericAgents = new Set([
            "General",
            "Plan",
            "Explore",
            "general-purpose",
          ]);
          if (!genericAgents.has(agentName) && !validAgentNames.has(agentName)) {
            ghostRefs.push({
              file: label(file),
              agent: agentName,
              line: i + 1,
            });
          }
        }
      }
    }

    expect(ghostRefs).toEqual([]);
  });

  test("shared preflight reference links resolve to existing files", () => {
    const missingLinks: { file: string; target: string }[] = [];

    for (const file of getSkillFiles()) {
      const content = readFileSync(file, "utf-8");
      // Match markdown links like [text](../shared/preflight-checks.md)
      const linkPattern = /\[.*?\]\((\.\.?\/[^\)]+\.md)\)/g;
      let match;
      while ((match = linkPattern.exec(content)) !== null) {
        const linkTarget = match[1];
        const resolvedPath = resolve(dirname(file), linkTarget);
        if (!existsSync(resolvedPath)) {
          missingLinks.push({
            file: label(file),
            target: linkTarget,
          });
        }
      }
    }

    expect(missingLinks).toEqual([]);
  });

  test("skills referenced by other skills exist", () => {
    // Check for skill invocation patterns like "use the create-linear-issue skill"
    // or "invoke the resolve-linear-issue skill"
    const skillDirs = readdirSync(SKILLS_DIR).filter((d) => {
      const full = join(SKILLS_DIR, d);
      return statSync(full).isDirectory() && existsSync(join(full, "SKILL.md"));
    });
    const validSkillNames = new Set(skillDirs);

    // Match backtick-quoted skill names followed by "skill" — the most reliable pattern
    const skillRefPattern = /`([\w-]+)`\s+skill/gi;
    const missingSkills: { file: string; skill: string; line: number }[] = [];

    // Skills from other plugins that are valid external references
    const externalSkills = new Set([
      "using-git-worktrees",
    ]);

    for (const file of [...getSkillFiles(), ...getAgentFiles()]) {
      const content = readFileSync(file, "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        let match;
        while ((match = skillRefPattern.exec(lines[i])) !== null) {
          const skillName = match[1];
          if (
            !validSkillNames.has(skillName) &&
            !externalSkills.has(skillName)
          ) {
            missingSkills.push({
              file: label(file),
              skill: skillName,
              line: i + 1,
            });
          }
        }
      }
    }

    expect(missingSkills).toEqual([]);
  });
});

describe("Content Quality", () => {
  test("no SKILL.md contains 'This a ' (missing word typo)", () => {
    const typos: { file: string; line: number }[] = [];

    for (const file of getSkillFiles()) {
      const content = readFileSync(file, "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        if (/\bThis a \b/.test(lines[i])) {
          typos.push({ file: label(file), line: i + 1 });
        }
      }
    }

    expect(typos).toEqual([]);
  });

  test("all SKILL.md files have a top-level heading", () => {
    const missing: string[] = [];

    for (const file of getSkillFiles()) {
      const content = readFileSync(file, "utf-8");
      // Strip frontmatter, then check for # heading
      const body = content.replace(/^---\n[\s\S]*?\n---\n*/, "");
      if (!/^#\s+\S/m.test(body)) {
        missing.push(label(file));
      }
    }

    expect(missing).toEqual([]);
  });

  test("shared preflight-checks.md contains CONTEXT placeholder", () => {
    const preflightPath = join(SKILLS_DIR, "shared", "preflight-checks.md");
    expect(existsSync(preflightPath)).toBe(true);

    const content = readFileSync(preflightPath, "utf-8");
    expect(content).toContain("<CONTEXT>");
  });
});

describe("Plugin Version", () => {
  test("plugin.json version is semver", () => {
    const pluginJson = JSON.parse(
      readFileSync(join(PLUGIN_DIR, ".claude-plugin", "plugin.json"), "utf-8")
    );
    expect(pluginJson.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("README changelog mentions the current version", () => {
    const pluginJson = JSON.parse(
      readFileSync(join(PLUGIN_DIR, ".claude-plugin", "plugin.json"), "utf-8")
    );
    const readme = readFileSync(join(PLUGIN_DIR, "README.md"), "utf-8");
    expect(readme).toContain(`v${pluginJson.version}`);
  });
});
