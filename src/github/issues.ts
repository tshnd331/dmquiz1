import type { QuestionFeedback } from "@prisma/client";

/** Labels applied to every feedback-driven Issue (admin-approved). */
export const FEEDBACK_ISSUE_LABELS = [
  "feedback",
  "auto-generated",
  "rule-improvement",
  "approved",
];

const ANSWER_LABEL: Record<string, string> = {
  yes: "はい",
  no: "いいえ",
  unknown: "判断不能",
};

function label(answer: string | null | undefined): string {
  if (!answer) return "（不明）";
  return ANSWER_LABEL[answer] ?? answer;
}

/** Short, human-readable Issue title for a feedback item. */
export function buildFeedbackIssueTitle(fb: QuestionFeedback, cardName: string): string {
  const q = fb.question.length > 60 ? fb.question.slice(0, 59) + "…" : fb.question;
  return `[feedback] ${cardName}: ${q}`;
}

/**
 * Markdown body for the Issue created on admin approval.
 * Mirrors the format defined in AUTOMATION_PLAN.md.
 */
export function buildFeedbackIssueBody(fb: QuestionFeedback, cardName: string): string {
  return [
    "## 📝 ユーザーフィードバック（管理者承認済み）",
    "",
    "**質問内容:**",
    `\`${fb.question}\``,
    "",
    `**カード名:** ${cardName}`,
    "",
    `**Botの回答:** ${label(fb.botAnswer)}`,
    "",
    `**正解:** ${label(fb.userCorrectAnswer)}`,
    "",
    "**理由:**",
    fb.reason ?? "（記載なし）",
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
