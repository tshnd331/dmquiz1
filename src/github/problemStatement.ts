/**
 * Build the problem statement handed to the fix agent (Copilot coding agent
 * today, swappable later). Kept engine-agnostic: it only describes the task.
 */

export interface IssueLike {
  number: number;
  title: string;
  body: string | null;
}

/**
 * Turn an approved feedback Issue into an actionable instruction for a
 * coding agent that improves {@link RuleBasedQuestionAnswerer}.
 */
export function generateProblemStatementFromIssue(issue: IssueLike): string {
  return [
    `GitHub Issue #${issue.number}「${issue.title}」を解決してください。`,
    "",
    "このIssueは、デュエマ当てクイズBotのルールベース回答器が誤った回答を返したという",
    "ユーザーフィードバックです。以下を行ってください:",
    "",
    "1. Issue 本文の質問・カード・Botの回答・正解を確認する。",
    "2. `src/quiz/RuleBasedQuestionAnswerer.ts` の該当カテゴリ（文明/コスト/パワー/種族/カードタイプ）の",
    "   ルールを修正し、正しい回答を返すようにする。",
    "3. `test/` に、この誤りを再現する回帰テストを追加する（`node:test` + `tsx`）。",
    "4. `npm test` と `npm run build` が通ることを確認する。",
    `5. 変更は PR として提出する（自動マージはしない）。PR 本文に \`Closes #${issue.number}\` を含める。`,
    "",
    "--- Issue 本文 ---",
    issue.body ?? "(本文なし)",
  ].join("\n");
}
