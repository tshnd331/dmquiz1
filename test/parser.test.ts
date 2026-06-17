import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseCardPage,
  hasBracketCardName,
  sourceUrlIsCardPage,
} from "../src/crawler/parser.js";

/** Minimal HTML resembling a dmwiki page: a heading plus a content body. */
function page(heading: string, body: string): string {
  return `<!doctype html><html><head><title>${heading} - デュエル・マスターズWiki</title></head>` +
    `<body><h1 id="firstHeading">${heading}</h1><div id="body">${body}</div></body></html>`;
}

// A real card page: 《》-bracketed title and a stat block.
const AQUAN = page(
  "《アクアン》",
  "<p>アクアン　R　水文明　(4)</p><p>クリーチャー：サイバーロード　2000</p>" +
    "<p>このクリーチャーをバトルゾーンに出した時、自分の山札の上から3枚を見る。</p>",
);

test("本物のカードページはパースされ、《》が剥がれる", () => {
  const parsed = parseCardPage(AQUAN, "fallback");
  assert.notEqual(parsed, null);
  assert.equal(parsed?.name, "アクアン");
  assert.equal(parsed?.civilization, "水");
  assert.equal(parsed?.cardType, "クリーチャー");
});

test("キーワード解説ページ(cip)はnull", () => {
  const html = page(
    "cip",
    "<p>cipとは、クリーチャーがバトルゾーンに出た時に発動する能力の通称。</p>",
  );
  assert.equal(parseCardPage(html, "cip"), null);
});

test("エキスパンションページ(DMPP-01)はnull", () => {
  // 《》が無いので、本文にクリーチャー等の語があっても弾く。
  const html = page(
    "DMPP-01 「超獣の始動 -MASTER OF DUEL-」",
    "<p>収録カード一覧。クリーチャー・呪文を多数収録。</p>",
  );
  assert.equal(parseCardPage(html, "DMPP-01"), null);
});

test("機構/特殊リンク(Dr.ルート / New Division)はnull", () => {
  assert.equal(
    parseCardPage(page("Dr.ルート", "<p>クリーチャーの解説。</p>"), "Dr.ルート"),
    null,
  );
  assert.equal(
    parseCardPage(page("New Division", "<p>殿堂レギュレーションの一種。</p>"), "New Division"),
    null,
  );
});

test("ツインパクト風の《A》／《B》名もカードとして通る", () => {
  const html = page(
    "《ガイアール・カイザー》／《熱血星龍 ガイギンガ》",
    "<p>火文明　(7)　クリーチャー　パワー7000</p>",
  );
  const parsed = parseCardPage(html, "fallback");
  assert.notEqual(parsed, null);
  assert.equal(parsed?.name, "ガイアール・カイザー／熱血星龍 ガイギンガ");
});

test("hasBracketCardName は先頭《…》ペアのみ true", () => {
  assert.equal(hasBracketCardName("《アクアン》"), true);
  assert.equal(hasBracketCardName("cip"), false);
  assert.equal(hasBracketCardName("DMPP-01"), false);
  // たまたま途中に《があるだけ、》が無い等は false。
  assert.equal(hasBracketCardName("解説《補足"), false);
});

test("sourceUrlIsCardPage は URL の《》有無でカードページ判定（保存名に非依存）", () => {
  const cardUrl = `https://dmwiki.net/${encodeURIComponent("《アクアン》")}`;
  assert.equal(sourceUrlIsCardPage(cardUrl), true);
  assert.equal(sourceUrlIsCardPage("https://dmwiki.net/DMPP-01"), false);
  assert.equal(sourceUrlIsCardPage("https://dmwiki.net/cip"), false);
  // seed カードは dmwiki 由来でないので prune 対象外（ここでも false）。
  assert.equal(sourceUrlIsCardPage("seed://aqua-hulcus"), false);
});
