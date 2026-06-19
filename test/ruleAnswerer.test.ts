import assert from "node:assert/strict";
import { test } from "node:test";
import type { Card } from "@prisma/client";
import { RuleBasedQuestionAnswerer } from "../src/quiz/RuleBasedQuestionAnswerer.js";

/** Build a minimal Card fixture for testing. */
function makeCard(overrides: Partial<Card>): Card {
  return {
    id: 1,
    name: "テストカード",
    civilization: null,
    cost: null,
    cardType: null,
    race: null,
    power: null,
    text: null,
    rawText: null,
    sourceUrl: "seed://test",
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

const answerer = new RuleBasedQuestionAnswerer();

// --- いけにえの鎖 regression tests (Issue #11) ----------------------------

const ikenieCard = makeCard({
  name: "いけにえの鎖",
  civilization: "闇",
  cost: 5,
  cardType: "呪文",
  race: null,
  power: null,
  text: "S・トリガー。相手のクリーチャーを1体選ぶ。そのターンの終わりに、そのクリーチャーを破壊する。",
  rawText:
    "いけにえの鎖 闇 呪文  S・トリガー。相手のクリーチャーを1体選ぶ。そのターンの終わりに、そのクリーチャーを破壊する。",
  sourceUrl: "seed://ikenie-no-kusari",
});

test("いけにえの鎖: 闇文明ですか → はい", async () => {
  const result = await answerer.answer(ikenieCard, "闇文明ですか？");
  assert.equal(result.answer, "yes");
});

test("いけにえの鎖: 光文明ですか → いいえ", async () => {
  const result = await answerer.answer(ikenieCard, "光文明ですか？");
  assert.equal(result.answer, "no");
});

test("いけにえの鎖: コストは5ですか → はい", async () => {
  const result = await answerer.answer(ikenieCard, "コストは5ですか？");
  assert.equal(result.answer, "yes");
});

test("いけにえの鎖: コストは6ですか → いいえ", async () => {
  const result = await answerer.answer(ikenieCard, "コストは6ですか？");
  assert.equal(result.answer, "no");
});

test("いけにえの鎖: コストは5以上ですか → はい", async () => {
  const result = await answerer.answer(ikenieCard, "コストは5以上ですか？");
  assert.equal(result.answer, "yes");
});

test("いけにえの鎖: コストは6以下ですか → はい", async () => {
  const result = await answerer.answer(ikenieCard, "コストは6以下ですか？");
  assert.equal(result.answer, "yes");
});

test("いけにえの鎖: 呪文ですか → はい", async () => {
  const result = await answerer.answer(ikenieCard, "呪文ですか？");
  assert.equal(result.answer, "yes");
});

test("いけにえの鎖: クリーチャーですか → いいえ", async () => {
  const result = await answerer.answer(ikenieCard, "クリーチャーですか？");
  assert.equal(result.answer, "no");
});

test("いけにえの鎖: S・トリガーを持っていますか → はい", async () => {
  const result = await answerer.answer(ikenieCard, "S・トリガーを持っていますか？");
  assert.equal(result.answer, "yes");
});
