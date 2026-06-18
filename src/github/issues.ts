import type { QuestionFeedback } from "@prisma/client";

/** Labels applied to every feedback-driven Issue (admin-approved). */
export const FEEDBACK_ISSUE_LABELS = [
  "feedback",
  "auto-generated",
  "rule-improvement",
  "approved",
];

/** Zero-width space; breaks `@mention` / `#issue` auto-links without changing the visible text. */
const ZWSP = "​";

/** Neutralise `@` so GitHub does not turn user input into mention notifications. */
function defuseMentions(s: string): string {
  return s.replace(/@/g, `@${ZWSP}`);
}

/**
 * Collapse all whitespace (incl. newlines) into single spaces and defuse
 * mentions, for use in a single-line context like the Issue title.
 */
function sanitizeTitlePart(s: string): string {
  return defuseMentions(s.replace(/\s+/g, " ").trim());
}

/**
 * Wrap untrusted user input in a fenced code block that cannot be broken out
 * of: the fence length always exceeds the longest backtick run inside, and
 * mentions are defused so the body never emits stray notifications.
 */
function fencedBlock(s: string): string {
  const longestRun = (s.match(/`+/g) ?? []).reduce((m, r) => Math.max(m, r.length), 0);
  const fence = "`".repeat(Math.max(3, longestRun + 1));
  return `${fence}\n${defuseMentions(s)}\n${fence}`;
}

/** Short, human-readable Issue title for a feedback item. */
export function buildFeedbackIssueTitle(fb: QuestionFeedback, cardName: string): string {
  const clean = sanitizeTitlePart(fb.content);
  const q = clean.length > 60 ? clean.slice(0, 59) + "…" : clean;
  return `[feedback] ${cardName}: ${q}`;
}

/** Markdown body for the Issue created on admin approval. */
export function buildFeedbackIssueBody(fb: QuestionFeedback, cardName: string): string {
  return [
    "## 📝 ユーザーフィードバック（管理者承認済み）",
    "",
    "**内容:**",
    fencedBlock(fb.content),
    "",
    `**カード名:** ${cardName}`,
    "",
    `**ユーザー ID:** ${fb.userId}`,
    "",
    "---",
    "",
    "このIssueは管理者が承認済みです。修正エージェントにより自動ハンドル予定。",
  ].join("\n");
}

export interface CreateIssueParams {
  /** "owner/name" form. */
  repo: string;
  token: string;
  title: string;
  body: string;
  labels?: string[];
}

/**
 * Create a GitHub Issue via the REST API using native fetch (no SDK dep).
 * Returns the created Issue number.
 */
export async function createFeedbackIssue(params: CreateIssueParams): Promise<number> {
  const { repo, token, title, body, labels = FEEDBACK_ISSUE_LABELS } = params;
  const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title, body, labels }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `GitHub Issue creation failed: ${res.status} ${res.statusText} ${detail}`,
    );
  }

  const json = (await res.json()) as { number?: number };
  if (typeof json.number !== "number") {
    throw new Error("GitHub Issue creation: unexpected response (no issue number)");
  }
  return json.number;
}
