#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

try {
  // Dispatch has no PR body. All other missing inputs fail closed.
  if (process.env.GITHUB_EVENT_NAME === "workflow_dispatch") {
    console.log(
      "Skipping closing-document references: workflow_dispatch has no PR body.",
    );
  } else {
    if (process.env.GITHUB_EVENT_NAME !== "pull_request") {
      throw new Error(
        "expected GITHUB_EVENT_NAME=pull_request or workflow_dispatch",
      );
    }
    let body;
    try {
      body = JSON.parse(process.env.PR_BODY_JSON);
    } catch {
      throw new Error("PR_BODY_JSON is missing or unreadable");
    }
    if (typeof body !== "string") {
      throw new Error("PR_BODY_JSON must contain a PR body string");
    }
    // Supports closing keywords followed by #N or a full issue URL (any repository).
    // Ignores negation; do not filter "does NOT close".
    const closing =
      /\b(?:close[sd]?|fix(?:es|ed)?|resolve[sd]?)\s+(?:#([1-9]\d*)\b|https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/issues\/([1-9]\d*)\b)/gi;
    const issues = [
      ...new Set(
        [...body.matchAll(closing)].map((match) => match[1] ?? match[2]),
      ),
    ];
    const root = execFileSync(
      "git",
      ["-C", process.argv[2] ?? process.cwd(), "rev-parse", "--show-toplevel"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
    const files = execFileSync("git", ["-C", root, "ls-files", "-z"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
      .split("\0")
      .filter(Boolean);
    // Fixed same-line phrase list, not a prose analyser. Historical archive,
    // non-Markdown, and untracked files are deliberately outside this guard.
    const handoff =
      /\b(?:left\s+to|tracked\s+in|deferred\s+to|known\s+exception|until\b.*\bfixed)\b/i;
    for (const file of files) {
      if (!/\.md$/i.test(file) || file.startsWith("docs/archive/")) continue;
      const lines = readFileSync(resolve(root, file), "utf8").split(/\r?\n/);
      for (const [index, line] of lines.entries()) {
        if (!handoff.test(line)) continue;
        for (const issue of issues) {
          if (new RegExp(`(?:#${issue}\\b|\\bissues/${issue}\\b)`).test(line)) {
            console.log(`${file}:${index + 1}: #${issue}: ${line}`);
            process.exitCode = 1;
          }
        }
      }
    }
  }
} catch (error) {
  console.error(`Closing-document reference check failed: ${error.message}`);
  process.exitCode = 1;
}
