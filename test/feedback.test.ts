import assert from "node:assert/strict";
import { test } from "node:test";
import type { QuestionFeedback } from "@prisma/client";
import {
  buildFeedbackIssueBody,
  buildFeedbackIssueTitle,
} from "../src/github/issues.js";
import { generateProblemStatementFromIssue } from "../src/github/problemStatement.js";

function sampleFeedback(overrides: Partial<QuestionFeedback> = {}): QuestionFeedback {
  return {
    id: 1,
    cardId: 42,
    content: "火文明ですか？ という質問でBotが「いいえ」と答えたが、本来は「はい」。このカードは火文明です",
    userId: "123456789",
    status: "approved",
    issueNumber: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

test("Issue タイトルはカード名と内容を含み、長い内容は切り詰める", () => {
  const longC = "あ".repeat(100);
  const title = buildFeedbackIssueTitle(sampleFeedback({ content: longC }), "ボルメテウス");
  assert.match(title, /\[feedback\] ボルメテウス:/);
  assert.ok(title.includes("…"));
  assert.ok(title.length < 90);
});

test("Issue 本文は必須セクションを含み、フィードバック内容を載せる", () => {
  const body = buildFeedbackIssueBody(sampleFeedback(), "ボルメテウス");
  assert.match(body, /管理者承認済み/);
  assert.match(body, /\*\*カード名:\*\* ボルメテウス/);
  assert.match(body, /このカードは火文明です/);
  assert.match(body, /\*\*ユーザー ID:\*\* 123456789/);
});

test("タイトルは改行を畳み単一行にし、@mention を無害化する", () => {
  const title = buildFeedbackIssueTitle(
    sampleFeedback({ content: "1行目\n2行目\t@everyone   末尾" }),
    "カード",
  );
  assert.ok(!/\n/.test(title), "タイトルに改行が残らない");
  assert.ok(!/(^|[^​])@everyone/.test(title), "@mention が素のまま残らない");
  assert.match(title, /1行目 2行目/); // 連続空白が単一化されている
});

test("本文はユーザー入力を fenced code block 化し、内部の ``` で脱出されない", () => {
  const evil = "```\n## 偽セクション\n@everyone 理由に```入り @here";
  const body = buildFeedbackIssueBody(
    sampleFeedback({ content: evil }),
    "カード",
  );
  // 入力中の ``` より長いフェンスで囲まれている（4連以上のバッククォートが登場）
  assert.match(body, /````/);
  // mention は無害化済（素の @everyone / @here が残らない）
  assert.ok(!/(^|[^​])@everyone/.test(body));
  assert.ok(!/(^|[^​])@here/.test(body));
});

test("問題文は対象ファイルと Closes 参照を含む", () => {
  const stmt = generateProblemStatementFromIssue({
    number: 7,
    title: "[feedback] X: 火文明ですか？",
    body: "本文",
  });
  assert.match(stmt, /Issue #7/);
  assert.match(stmt, /RuleBasedQuestionAnswerer\.ts/);
  assert.match(stmt, /Closes #7/);
  assert.match(stmt, /本文/);
});
