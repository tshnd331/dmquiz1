/**
 * Trigger the configured fix agent for an approved feedback Issue.
 *
 * Invoked by `.github/workflows/copilot-agent-loop.yml` per detected Issue.
 * Engine is swappable via FIX_AGENT ("copilot" | "claude"); add new engines
 * by implementing the FixAgent interface and registering it in `AGENTS`.
 *
 * Env:
 *   GITHUB_TOKEN       PAT / Actions token with repo + issues write
 *   GITHUB_REPOSITORY  "owner/name" (provided by Actions)
 *   ISSUE_NUMBER       Issue to hand to the agent
 *   FIX_AGENT          engine selector (default "copilot")
 */

import {
  generateProblemStatementFromIssue,
  type IssueLike,
} from "../src/github/problemStatement.js";

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
const GITHUB_GRAPHQL = "https://api.github.com/graphql";

function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

async function graphql<T>(token: string, query: string, variables: unknown): Promise<T> {
  const res = await fetch(GITHUB_GRAPHQL, {
    method: "POST",
    headers: ghHeaders(token),
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: T; errors?: unknown };
  if (!res.ok || json.errors) {
    throw new Error(`GraphQL error: ${res.status} ${JSON.stringify(json.errors)}`);
  }
  return json.data as T;
}

/**
 * GitHub Copilot coding agent: assign the Issue to the Copilot bot.
 * Discovers the bot's node id via suggestedActors, then assigns it.
 * NOTE: requires Copilot coding agent to be enabled for the repo. This is the
 * most spec-dependent part; adjust the mutation if GitHub's API changes.
 */
const copilotAgent: FixAgent = {
  name: "copilot",
  async trigger(ctx) {
    const [owner, name] = ctx.repo.split("/");

    const data = await graphql<{
      repository: {
        id: string;
        suggestedActors: { nodes: { login: string; __typename: string; id: string }[] };
      };
    }>(
      ctx.token,
      `query($owner:String!, $name:String!) {
        repository(owner:$owner, name:$name) {
          id
          suggestedActors(capabilities:[CAN_BE_ASSIGNED], first:50) {
            nodes { login __typename ... on Bot { id } ... on User { id } }
          }
        }
      }`,
      { owner, name },
    );

    const copilot = data.repository.suggestedActors.nodes.find(
      (n) => n.login === "copilot-swe-agent" || n.login === "Copilot",
    );
    if (!copilot) {
      throw new Error(
        "Copilot coding agent is not assignable on this repo. Enable it in repo settings.",
      );
    }

    const issueNode = await graphql<{ repository: { issue: { id: string } } }>(
      ctx.token,
      `query($owner:String!, $name:String!, $num:Int!) {
        repository(owner:$owner, name:$name) { issue(number:$num) { id } }
      }`,
      { owner, name, num: ctx.issue.number },
    );

    await graphql(
      ctx.token,
      `mutation($assignableId:ID!, $actorIds:[ID!]!) {
        replaceActorsForAssignable(input:{assignableId:$assignableId, actorIds:$actorIds}) {
          assignable { ... on Issue { number } }
        }
      }`,
      { assignableId: issueNode.repository.issue.id, actorIds: [copilot.id] },
    );

    console.log(
      `[triggerFixAgent] Assigned Copilot coding agent to Issue #${ctx.issue.number}`,
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
