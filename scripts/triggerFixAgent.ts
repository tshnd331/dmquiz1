/**
 * Trigger the configured fix agent for an approved feedback Issue.
 *
 * Invoked by `.github/workflows/copilot-agent-loop.yml` per detected Issue.
 * Engine is swappable via FIX_AGENT ("copilot" | "claude"); add new engines
 * by implementing the FixAgent interface and registering it in `AGENTS`.
 *
 * Env:
 *   GITHUB_TOKEN       Copilot-licensed user's PAT (Issues RW + Metadata R).
 *                      The default Actions GITHUB_TOKEN CANNOT assign Copilot.
 *   GITHUB_REPOSITORY  "owner/name" (provided by Actions)
 *   ISSUE_NUMBER       Issue to hand to the agent
 *   FIX_AGENT          engine selector (default "copilot")
 *
 * Requires the `gh` CLI on PATH (present on GitHub-hosted runners).
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  generateProblemStatementFromIssue,
  type IssueLike,
} from "../src/github/problemStatement.js";

const execFileAsync = promisify(execFile);

interface FixAgentContext {
  repo: string; // "owner/name"
  token: string;
  issue: IssueLike;
  problemStatement: string;
}

interface FixAgent {
  readonly name: string;
  trigger(ctx: FixAgentContext): Promise<void>;
}

const GITHUB_API = "https://api.github.com";

function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

/**
 * GitHub Copilot coding agent: assign the Issue to @copilot via the official
 * `gh issue edit --add-assignee @copilot`. Additive (does not clobber existing
 * assignees) and lets gh resolve the bot, so there is no node-id juggling.
 *
 * IMPORTANT: the token MUST be a Copilot-licensed user's PAT (fine-grained:
 * Issues read/write + Metadata read). The default Actions GITHUB_TOKEN cannot
 * assign Copilot. Copilot coding agent must be enabled for the repo.
 */
const copilotAgent: FixAgent = {
  name: "copilot",
  async trigger(ctx) {
    await execFileAsync(
      "gh",
      [
        "issue",
        "edit",
        String(ctx.issue.number),
        "--repo",
        ctx.repo,
        "--add-assignee",
        "@copilot",
      ],
      { env: { ...process.env, GH_TOKEN: ctx.token } },
    );

    console.log(
      `[triggerFixAgent] Assigned @copilot to Issue #${ctx.issue.number}`,
    );
  },
};

/** Placeholder engine: swap-in point for a future Claude-based fixer. */
const claudeAgent: FixAgent = {
  name: "claude",
  async trigger(ctx) {
    console.log(
      `[triggerFixAgent] Claude engine not implemented yet. Problem statement for Issue #${ctx.issue.number}:\n${ctx.problemStatement}`,
    );
    throw new Error("FIX_AGENT=claude is not implemented yet.");
  },
};

const AGENTS: Record<string, FixAgent> = {
  copilot: copilotAgent,
  claude: claudeAgent,
};

async function fetchIssue(repo: string, token: string, num: number): Promise<IssueLike> {
  const res = await fetch(`${GITHUB_API}/repos/${repo}/issues/${num}`, {
    headers: ghHeaders(token),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch Issue #${num}: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as { number: number; title: string; body: string | null };
  return { number: json.number, title: json.title, body: json.body };
}

async function main(): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  const issueNumber = Number(process.env.ISSUE_NUMBER);
  const agentName = process.env.FIX_AGENT || "copilot";

  if (!token) throw new Error("GITHUB_TOKEN is required");
  if (!repo) throw new Error("GITHUB_REPOSITORY is required");
  if (!Number.isInteger(issueNumber)) throw new Error("ISSUE_NUMBER must be an integer");

  const agent = AGENTS[agentName];
  if (!agent) {
    throw new Error(`Unknown FIX_AGENT "${agentName}". Available: ${Object.keys(AGENTS).join(", ")}`);
  }

  const issue = await fetchIssue(repo, token, issueNumber);
  const problemStatement = generateProblemStatementFromIssue(issue);

  console.log(`[triggerFixAgent] engine=${agent.name} issue=#${issueNumber}`);
  await agent.trigger({ repo, token, issue, problemStatement });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
