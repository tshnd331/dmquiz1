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
    question: "火文明ですか？",
    botAnswer: "no",
    userCorrectAnswer: "yes",
    reason: "このカードは火文明です",
    userId: "123456789",
    status: "approved",
    issueNumber: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

test("Issue タイトルはカード名と質問を含み、長い質問は切り詰める", () => {
  const longQ = "あ".repeat(100);
  const title = buildFeedbackIssueTitle(sampleFeedback({ question: longQ }), "ボルメテウス");
  assert.match(title, /\[feedback\] ボルメテウス:/);
  assert.ok(title.includes("…"));
  assert.ok(title.length < 90);
});

test("Issue 本文は回答ラベルを日本語化し、必須セクションを含む", () => {
  const body = buildFeedbackIssueBody(sampleFeedback(), "ボルメテウス");
  assert.match(body, /管理者承認済み/);
  assert.match(body, /\*\*カード名:\*\* ボルメテウス/);
  assert.match(body, /\*\*Botの回答:\*\* いいえ/); // botAnswer "no"
  assert.match(body, /\*\*正解:\*\* はい/); // userCorrectAnswer "yes"
  assert.match(body, /このカードは火文明です/);
  assert.match(body, /\*\*ユーザー ID:\*\* 123456789/);
});

test("理由が無い場合は「（記載なし）」になる", () => {
  const body = buildFeedbackIssueBody(sampleFeedback({ reason: null }), "X");
  assert.match(body, /\(記載なし\)|（記載なし）/);
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
