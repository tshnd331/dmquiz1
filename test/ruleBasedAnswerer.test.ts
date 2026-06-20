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

test("文明: ボルガッシュ・ドラゴン(火)に水火以外ですかはno", async () => {
  const result = await answerer.answer(
    card({ name: "ボルガッシュ・ドラゴン", civilization: "火" }),
    "水火以外ですか",
  );
  assert.equal(result.answer, "no");
});
test("文明: 自然カードに水火以外ですかはyes", async () => {
  const result = await answerer.answer(
    card({ civilization: "自然" }),
    "水火以外ですか",
  );
  assert.equal(result.answer, "yes");
});

// --- カードタイプ (否定形) -----------------------------------------------
// Regression: Issue #20 - 嘆きの影ダーク・レイブン への否定形質問が正しく回答されなかった

test("カードタイプ: クリーチャーではないですか - クリーチャーカードはno", async () => {
  const result = await answerer.answer(
    card({ name: "嘆きの影ダーク・レイブン", cardType: "クリーチャー" }),
    "クリーチャーではないですか？",
  );
  assert.equal(result.answer, "no");
});

test("カードタイプ: クリーチャー以外ですか - クリーチャーカードはno", async () => {
  const result = await answerer.answer(
    card({ name: "嘆きの影ダーク・レイブン", cardType: "クリーチャー" }),
    "クリーチャー以外ですか？",
  );
  assert.equal(result.answer, "no");
});

test("カードタイプ: クリーチャーではないカードタイプですか - クリーチャーカードはno", async () => {
  const result = await answerer.answer(
    card({ name: "嘆きの影ダーク・レイブン", cardType: "クリーチャー" }),
    "クリーチャーではないカードタイプですか？",
  );
  assert.equal(result.answer, "no");
});

test("カードタイプ: クリーチャーではないですか - 呪文カードはyes", async () => {
  const result = await answerer.answer(
    card({ cardType: "呪文" }),
    "クリーチャーではないですか？",
  );
  assert.equal(result.answer, "yes");
});

test("カードタイプ: クリーチャー以外ですか - 呪文カードはyes", async () => {
  const result = await answerer.answer(
    card({ cardType: "呪文" }),
    "クリーチャー以外ですか？",
  );
  assert.equal(result.answer, "yes");
});

test("カードタイプ: クリーチャーではないカードタイプですか - 呪文カードはyes", async () => {
  const result = await answerer.answer(
    card({ cardType: "呪文" }),
    "クリーチャーではないカードタイプですか？",
  );
  assert.equal(result.answer, "yes");
});

test("カードタイプ: クリーチャーじゃないですか - クリーチャーカードはno", async () => {
  const result = await answerer.answer(
    card({ cardType: "クリーチャー" }),
    "クリーチャーじゃないですか？",
  );
  assert.equal(result.answer, "no");
});

test("カードタイプ: クリーチャーじゃないですか - 呪文カードはyes", async () => {
  const result = await answerer.answer(
    card({ cardType: "呪文" }),
    "クリーチャーじゃないですか？",
  );
  assert.equal(result.answer, "yes");
});

test("カードタイプ: クリーチャーではなく呪文ですか - クリーチャーカードはno", async () => {
  const result = await answerer.answer(
    card({ cardType: "クリーチャー" }),
    "クリーチャーではなく呪文ですか？",
  );
  assert.equal(result.answer, "no");
});

test("カードタイプ: クリーチャーではなく呪文ですか - 呪文カードはyes", async () => {
  const result = await answerer.answer(
    card({ cardType: "呪文" }),
    "クリーチャーではなく呪文ですか？",
  );
  assert.equal(result.answer, "yes");
});

// 指摘1回帰防止: サブタイプ「進化クリーチャー」が「クリーチャー」に誤マッチしないこと
test("カードタイプ: 進化クリーチャーではないですか - 通常クリーチャーはyes", async () => {
  const result = await answerer.answer(
    card({ cardType: "クリーチャー" }),
    "進化クリーチャーではないですか？",
  );
  assert.equal(result.answer, "yes");
});

test("カードタイプ: 進化クリーチャーではないですか - 進化クリーチャーはno", async () => {
  const result = await answerer.answer(
    card({ cardType: "進化クリーチャー" }),
    "進化クリーチャーではないですか？",
  );
  assert.equal(result.answer, "no");
});

// Regression: Issue #29 - 文明とカードタイプを同時に尋ねる質問が
// 文明だけで誤って yes 判定されることがあった
test("文明+カードタイプ: 自然の呪文ですか - 自然のクリーチャーはno", async () => {
  const result = await answerer.answer(
    card({ civilization: "自然", cardType: "クリーチャー" }),
    "自然の呪文ですか？",
  );
  assert.equal(result.answer, "no");
});

test("文明+カードタイプ: 自然の呪文ですか - 自然の呪文はyes", async () => {
  const result = await answerer.answer(
    card({ civilization: "自然", cardType: "呪文" }),
    "自然の呪文ですか？",
  );
  assert.equal(result.answer, "yes");
});

test("文明+カードタイプ: 自然の呪文ではないですか - 自然のクリーチャーはyes", async () => {
  const result = await answerer.answer(
    card({ civilization: "自然", cardType: "クリーチャー" }),
    "自然の呪文ではないですか？",
  );
  assert.equal(result.answer, "yes");
});

test("文明+カードタイプ: 自然の呪文ではないですか - 自然の呪文はno", async () => {
  const result = await answerer.answer(
    card({ civilization: "自然", cardType: "呪文" }),
    "自然の呪文ではないですか？",
  );
  assert.equal(result.answer, "no");
});

test("文明+カードタイプ: 自然のクリーチャーではなく呪文ですか - 自然の呪文はyes", async () => {
  const result = await answerer.answer(
    card({ civilization: "自然", cardType: "呪文" }),
    "自然のクリーチャーではなく呪文ですか？",
  );
  assert.equal(result.answer, "yes");
});

test("文明+カードタイプ: 自然のクリーチャーではなく呪文ですか - 自然のクリーチャーはno", async () => {
  const result = await answerer.answer(
    card({ civilization: "自然", cardType: "クリーチャー" }),
    "自然のクリーチャーではなく呪文ですか？",
  );
  assert.equal(result.answer, "no");
});

// Regression: Issue #31 - 文明+コスト+パワー+カードタイプの複合条件を正しく判定する
test("文明+コスト+パワー+カードタイプ: 水のコスト10のパワー2000のクリーチャーですか - コスト4はno", async () => {
  const result = await answerer.answer(
    card({ civilization: "水", cost: 4, power: "2000", cardType: "クリーチャー" }),
    "水のコスト10のパワー2000のクリーチャーですか？",
  );
  assert.equal(result.answer, "no");
});

// Regression: PR #32 レビュー - 複合条件でラベル付きコスト/パワーの範囲指定
// (以上/以下/未満/超え) を完全一致で誤判定しないこと
test("文明+コスト範囲+カードタイプ: 水のコスト10以上のクリーチャー - コスト4はno", async () => {
  const result = await answerer.answer(
    card({ civilization: "水", cost: 4, cardType: "クリーチャー" }),
    "水のコスト10以上のクリーチャーですか？",
  );
  assert.equal(result.answer, "no");
});

test("文明+コスト範囲+カードタイプ: 水のコスト10以上のクリーチャー - コスト12はyes", async () => {
  const result = await answerer.answer(
    card({ civilization: "水", cost: 12, cardType: "クリーチャー" }),
    "水のコスト10以上のクリーチャーですか？",
  );
  assert.equal(result.answer, "yes");
});

test("文明+パワー範囲+カードタイプ: 水のパワー2000以下のクリーチャー - パワー3000はno", async () => {
  const result = await answerer.answer(
    card({ civilization: "水", power: "3000", cardType: "クリーチャー" }),
    "水のパワー2000以下のクリーチャーですか？",
  );
  assert.equal(result.answer, "no");
});

test("文明+パワー範囲+カードタイプ: 水のパワー2000以下のクリーチャー - パワー1000はyes", async () => {
  const result = await answerer.answer(
    card({ civilization: "水", power: "1000", cardType: "クリーチャー" }),
    "水のパワー2000以下のクリーチャーですか？",
  );
  assert.equal(result.answer, "yes");
});

// --- コスト / パワー / 種族 (否定形) --------------------------------------
// Regression: Issue #22 - 墓堀怪人アシッドフィスト への否定形質問が
// カードタイプ以外で正しく判定されなかった

test("文明: 墓堀怪人アシッドフィストに闇文明ではないですかはno", async () => {
  const result = await answerer.answer(
    card({ name: "墓堀怪人アシッドフィスト", civilization: "闇" }),
    "闇文明ではないですか？",
  );
  assert.equal(result.answer, "no");
});

test("コスト: 墓堀怪人アシッドフィストにコスト5ではないですかはyes", async () => {
  const result = await answerer.answer(
    card({ name: "墓堀怪人アシッドフィスト", cost: 4 }),
    "コスト5ではないですか？",
  );
  assert.equal(result.answer, "yes");
});

test("コスト: 墓堀怪人アシッドフィストにコスト4ではないですかはno", async () => {
  const result = await answerer.answer(
    card({ name: "墓堀怪人アシッドフィスト", cost: 4 }),
    "コスト4ではないですか？",
  );
  assert.equal(result.answer, "no");
});

test("パワー: 墓堀怪人アシッドフィストにパワー4000ではないですかはyes", async () => {
  const result = await answerer.answer(
    card({ name: "墓堀怪人アシッドフィスト", power: "3000" }),
    "パワー4000ではないですか？",
  );
  assert.equal(result.answer, "yes");
});

test("種族: 墓堀怪人アシッドフィストにデビルマスクではないですかはno", async () => {
  const result = await answerer.answer(
    card({ name: "墓堀怪人アシッドフィスト", race: "デビルマスク" }),
    "デビルマスクではないですか？",
  );
  assert.equal(result.answer, "no");
});

test("種族: 墓堀怪人アシッドフィストにアーマロイドではないですかはyes", async () => {
  const result = await answerer.answer(
    card({ name: "墓堀怪人アシッドフィスト", race: "デビルマスク" }),
    "アーマロイドではないですか？",
  );
  assert.equal(result.answer, "yes");
});

// Regression: Issue #37 - 「ドラゴンですか」のように部分一致する種族クエリが正しく判定される
test("種族: アーマード・ドラゴンにドラゴンですか（部分一致）はyes", async () => {
  const result = await answerer.answer(
    card({ race: "アーマード・ドラゴン" }),
    "ドラゴンですか？",
  );
  assert.equal(result.answer, "yes");
});

test("種族: エンジェル・コマンドにコマンドですか（部分一致）はyes", async () => {
  const result = await answerer.answer(
    card({ race: "エンジェル・コマンド" }),
    "コマンドですか？",
  );
  assert.equal(result.answer, "yes");
});

test("種族: アーマード・ドラゴンに種族はドラゴンですかはyes", async () => {
  const result = await answerer.answer(
    card({ race: "アーマード・ドラゴン" }),
    "種族はドラゴンですか？",
  );
  assert.equal(result.answer, "yes");
});

test("種族: アーマード・ドラゴンにドラゴン種族ですかはyes", async () => {
  const result = await answerer.answer(
    card({ race: "アーマード・ドラゴン" }),
    "ドラゴン種族ですか？",
  );
  assert.equal(result.answer, "yes");
});

test("種族: エンジェル・コマンドにドラゴンですかはno", async () => {
  const result = await answerer.answer(
    card({ race: "エンジェル・コマンド" }),
    "ドラゴンですか？",
  );
  assert.equal(result.answer, "no");
});

// Regression: Issue #39 - 種族数（ふたつ以上）を尋ねる質問を判定できること
test("種族: ジョーカーズ/チーム切札に種族がふたつ以上ありますかはyes", async () => {
  const result = await answerer.answer(
    card({ name: "石臼男", race: "ジョーカーズ/チーム切札" }),
    "種族がふたつ以上ありますか？",
  );
  assert.equal(result.answer, "yes");
});

test("種族: デビルマスクに種族がふたつ以上ありますかはno", async () => {
  const result = await answerer.answer(
    card({ name: "デビルマスク", race: "デビルマスク" }),
    "種族がふたつ以上ありますか？",
  );
  assert.equal(result.answer, "no");
});

test("種族: 3種族カードに種族が3つ以上ありますかはyes", async () => {
  const result = await answerer.answer(
    card({ name: "トリプル種族", race: "ジョーカーズ/チーム切札/ヒューマノイド" }),
    "種族が3つ以上ありますか？",
  );
  assert.equal(result.answer, "yes");
});

test("種族: 3種族カードに種族が4つ以上ありますかはno", async () => {
  const result = await answerer.answer(
    card({ name: "トリプル種族", race: "ジョーカーズ/チーム切札/ヒューマノイド" }),
    "種族が4つ以上ありますか？",
  );
  assert.equal(result.answer, "no");
});

test("種族: ジョーカーズ/チーム切札に種族が2個以上ありますかはyes", async () => {
  const result = await answerer.answer(
    card({ name: "石臼男", race: "ジョーカーズ/チーム切札" }),
    "種族が2個以上ありますか？",
  );
  assert.equal(result.answer, "yes");
});

test("種族: デビルマスクに種族が2個以上ありますかはno", async () => {
  const result = await answerer.answer(
    card({ name: "デビルマスク", race: "デビルマスク" }),
    "種族が2個以上ありますか？",
  );
  assert.equal(result.answer, "no");
});
