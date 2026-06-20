import assert from "node:assert/strict";
import { test } from "node:test";
import type { QuestionFeedback } from "@prisma/client";
import {
  buildFeedbackIssueBody,
  buildFeedbackIssueTitle,
  feedbackTypeOf,
} from "../src/github/issues.js";
import { generateProblemStatementFromIssue } from "../src/github/problemStatement.js";

function sampleFeedback(overrides: Partial<QuestionFeedback> = {}): QuestionFeedback {
  return {
    id: 1,
    cardId: 42,
    type: "bug",
    content: "火文明ですか？ という質問でBotが「いいえ」と答えたが、本来は「はい」。このカードは火文明です",
    userId: "123456789",
    status: "approved",
    issueNumber: null,
    adminComment: null,
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

test("種別キーは表示名/GHラベルへマップし、未知キーはその他にフォールバック", () => {
  assert.deepEqual(feedbackTypeOf("bug"), { key: "bug", label: "不具合報告", gh: "bug" });
  assert.equal(feedbackTypeOf("request").label, "要望");
  assert.equal(feedbackTypeOf("request").gh, "enhancement");
  assert.equal(feedbackTypeOf("nonexistent").key, "other");
  assert.equal(feedbackTypeOf("nonexistent").label, "その他");
});

test("Issue 本文は種別の表示名を載せる", () => {
  const body = buildFeedbackIssueBody(sampleFeedback({ type: "request" }), "カード");
  assert.match(body, /\*\*種別:\*\* 要望/);
});

test("管理者コメントを渡すと本文へ専用セクションが追記される", () => {
  const body = buildFeedbackIssueBody(
    sampleFeedback(),
    "ボルメテウス",
    "コスト判定のルールを直してください",
  );
  assert.match(body, /## 🛠 管理者コメント/);
  assert.match(body, /コスト判定のルールを直してください/);
});

test("管理者コメントが空/未指定なら専用セクションは出ない", () => {
  for (const c of [undefined, null, "   "]) {
    const body = buildFeedbackIssueBody(sampleFeedback(), "ボルメテウス", c);
    assert.ok(!body.includes("管理者コメント"), `comment=${JSON.stringify(c)}`);
  }
});

test("管理者コメントも fenced code block 化され @mention 無害化される", () => {
  const body = buildFeedbackIssueBody(
    sampleFeedback(),
    "カード",
    "```\n@everyone 直して",
  );
  assert.match(body, /````/);
  assert.ok(!/(^|[^​])@everyone/.test(body));
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

test("カード未紐付け(cardId=null)でもタイトル/本文が生成される", () => {
  const fb = sampleFeedback({ cardId: null });
  const title = buildFeedbackIssueTitle(fb, null);
  assert.match(title, /\[feedback\] \(カード指定なし\):/);

  const body = buildFeedbackIssueBody(fb, null);
  assert.match(body, /\*\*カード名:\*\* \(カード指定なし\)/);
  assert.match(body, /このカードは火文明です/);
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
