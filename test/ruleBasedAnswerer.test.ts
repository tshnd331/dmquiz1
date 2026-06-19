import assert from "node:assert/strict";
import { test } from "node:test";
import type { Card } from "@prisma/client";
import { RuleBasedQuestionAnswerer } from "../src/quiz/RuleBasedQuestionAnswerer.js";

const answerer = new RuleBasedQuestionAnswerer();

/** Minimal Card stub with only the fields the answerer needs. */
function card(overrides: Partial<Card> = {}): Card {
  return {
    id: 1,
    name: "テストカード",
    civilization: null,
    cost: null,
    cardType: null,
    race: null,
    power: null,
    text: null,
    rawText: "",
    sourceUrl: "seed://test-card",
    fetchedAt: new Date(0),
    ...overrides,
  };
}

// --- 多色 (multicolor) ---------------------------------------------------

test("多色ですか: 複数文明カードは yes", async () => {
  const result = await answerer.answer(card({ civilization: "光/闇" }), "多色ですか");
  assert.equal(result.answer, "yes");
});

test("多色ですか: 単色カードは no", async () => {
  const result = await answerer.answer(card({ civilization: "水" }), "多色ですか？");
  assert.equal(result.answer, "no");
});

test("多色ですか: 文明未取得は unknown", async () => {
  const result = await answerer.answer(card({ civilization: null }), "多色ですか");
  assert.equal(result.answer, "unknown");
});

test("多色ですか: 3文明カードも yes", async () => {
  const result = await answerer.answer(
    card({ civilization: "光/水/闇" }),
    "このカードは多色ですか",
  );
  assert.equal(result.answer, "yes");
});

test("多色ですか: 流星の精霊ミーアのような多文明カードは yes", async () => {
  // 流星の精霊ミーア is a light/water dual-civilization card
  const result = await answerer.answer(
    card({ name: "流星の精霊ミーア", civilization: "光/水" }),
    "多色ですか",
  );
  assert.equal(result.answer, "yes");
  assert.match(result.reason, /光\/水/);
});

// --- 文明 (civilization) -------------------------------------------------

test("文明: 水光カードに水自然ですかはno (星海の精霊エーテルのバグ再現)", async () => {
  // Issue #16: 水光 card should NOT answer "yes" to "水自然ですか"
  const result = await answerer.answer(
    card({ name: "星海の精霊エーテル", civilization: "水/光" }),
    "水自然ですか",
  );
  assert.equal(result.answer, "no");
});

test("文明: 水自然カードに水自然ですかはyes", async () => {
  const result = await answerer.answer(
    card({ civilization: "水/自然" }),
    "水自然ですか",
  );
  assert.equal(result.answer, "yes");
});

test("文明: 水光カードに水文明ですかはyes", async () => {
  const result = await answerer.answer(
    card({ civilization: "水/光" }),
    "水文明ですか",
  );
  assert.equal(result.answer, "yes");
});
