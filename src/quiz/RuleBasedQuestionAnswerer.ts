import type { Card } from "@prisma/client";
import type {
  AnswerResult,
  QuestionAnswerer,
  YesNoUnknown,
} from "./QuestionAnswerer.js";

/**
 * A simple, dependency-free answerer that handles a handful of common
 * Japanese question patterns by matching against the card's structured
 * fields. Anything it cannot confidently judge returns "unknown".
 *
 * This is deliberately conservative: a wrong "yes"/"no" is worse for the
 * quiz than an honest "unknown".
 */
export class RuleBasedQuestionAnswerer implements QuestionAnswerer {
  async answer(card: Card, question: string): Promise<AnswerResult> {
    const q = normalize(question);

    return (
      this.tryMulticolor(card, q) ??
      this.tryCivilization(card, q) ??
      this.tryCardType(card, q) ??
      this.tryCost(card, q) ??
      this.tryPower(card, q) ??
      this.tryRaceOrText(card, q) ??
      unknown("この質問はルールベースでは判定できませんでした。")
    );
  }

  // --- 多色 -------------------------------------------------------------
  private tryMulticolor(card: Card, q: string): AnswerResult | null {
    if (
      !q.includes("多色") &&
      !q.includes("たしょく") &&
      !q.includes("タショク") &&
      !q.includes("multicolor")
    )
      return null;
    if (!card.civilization) {
      return unknown("このカードの文明情報が未取得です。");
    }
    const isMulticolor = card.civilization.includes("/");
    return verdict(isMulticolor, `文明は「${card.civilization}」です。`);
  }

  // --- 文明 -------------------------------------------------------------
  private tryCivilization(card: Card, q: string): AnswerResult | null {
    const civs: Array<{ key: string; words: string[] }> = [
      { key: "光", words: ["光", "ひかり", "white", "light"] },
      { key: "水", words: ["水", "みず", "blue", "water"] },
      { key: "闇", words: ["闇", "やみ", "black", "dark"] },
      { key: "火", words: ["火", "ひ", "red", "fire"] },
      { key: "自然", words: ["自然", "しぜん", "green", "nature"] },
      { key: "無", words: ["無", "ゼロ", "zero", "colorless"] },
    ];

    // Only treat it as a civilization question if "文明" (or civ name) appears.
    const matched = civs.find((c) => c.words.some((w) => q.includes(normalize(w))));
    if (!matched) return null;
    const looksLikeCivQuestion =
      q.includes("文明") || q.includes("civ") || matched.words.some((w) => q.includes(normalize(w)));
    if (!looksLikeCivQuestion) return null;

    if (!card.civilization) {
      return unknown("このカードの文明情報が未取得です。");
    }
    // Collect ALL civilizations mentioned in the question so that a question
    // like "水自然ですか" requires the card to have BOTH Water AND Nature, not
    // just Water. Using only the first match caused false "yes" answers for
    // multi-civ cards (e.g. "水光" answering yes to "水自然ですか").
    const allMatched = civs.filter((c) => c.words.some((w) => q.includes(normalize(w))));
    const has = allMatched.every((c) => card.civilization!.includes(c.key));
    return verdict(isTrailingNegation(q) ? !has : has, `文明は「${card.civilization}」です。`);
  }

  // --- カードタイプ -----------------------------------------------------
  private tryCardType(card: Card, q: string): AnswerResult | null {
    // Order matters: more specific subtypes must come before broader ones so
    // that `find` (first match wins) and the negation check below apply to the
    // intended type (e.g. "進化クリーチャー" before "クリーチャー").
    const types = ["進化クリーチャー", "クリーチャー", "呪文", "進化", "クロスギア", "城", "フィールド", "タマシード"];
    const matched = types.find((t) => q.includes(normalize(t)));
    if (!matched) return null;

    const haystack = `${card.cardType ?? ""}`;
    if (!card.cardType) {
      // Fall back to rawText so we can still answer when structured parse failed.
      if (!card.text && !card.rawText) {
        return unknown("カードタイプ情報が未取得です。");
      }
    }
    const normalizedMatched = normalize(matched);
    const has = normalize(haystack).includes(normalizedMatched);
    if (!card.cardType) return null; // avoid false negatives without structured data
    const negated = isTypeNegated(q, normalizedMatched);
    return verdict(negated ? !has : has, `カードタイプは「${card.cardType}」です。`);
  }

  // --- コスト -----------------------------------------------------------
  private tryCost(card: Card, q: string): AnswerResult | null {
    if (!q.includes("コスト") && !q.includes("cost")) return null;
    const num = extractNumber(q);
    if (num === null) return null;
    if (card.cost === null || card.cost === undefined) {
      return unknown("コスト情報が未取得です。");
    }

    let has: boolean;
    if (q.includes("以上")) has = card.cost >= num;
    else if (q.includes("以下")) has = card.cost <= num;
    else if (q.includes("より大き") || q.includes("超え")) has = card.cost > num;
    else if (q.includes("未満") || q.includes("より小さ")) has = card.cost < num;
    else has = card.cost === num;
    // default: exact match ("コストは5ですか")
    return verdict(isTrailingNegation(q) ? !has : has, `コストは ${card.cost} です。`);
  }

  // --- パワー -----------------------------------------------------------
  private tryPower(card: Card, q: string): AnswerResult | null {
    if (!q.includes("パワー") && !q.includes("power")) return null;
    const num = extractNumber(q);
    if (num === null) return null;
    const power = parsePower(card.power);
    if (power === null) {
      return unknown("パワー情報が未取得、または数値化できません。");
    }

    let has: boolean;
    if (q.includes("以上")) has = power >= num;
    else if (q.includes("以下")) has = power <= num;
    else if (q.includes("より大き") || q.includes("超え")) has = power > num;
    else if (q.includes("未満") || q.includes("より小さ")) has = power < num;
    else has = power === num;
    return verdict(isTrailingNegation(q) ? !has : has, `パワーは ${card.power} です。`);
  }

  // --- 種族 / テキスト --------------------------------------------------
  private tryRaceOrText(card: Card, q: string): AnswerResult | null {
    // Pattern: "〜ですか" / "〜を持っていますか" — strip the suffix and search.
    const keyword = extractKeyword(q);
    if (!keyword) return null;

    const raceHit = card.race ? normalize(card.race).includes(keyword) : false;
    const textHaystack = normalize(`${card.text ?? ""} ${card.rawText ?? ""}`);
    const textHit = keyword && textHaystack ? textHaystack.includes(keyword) : false;
    const negated = isTrailingNegation(q);

    if (card.race && raceHit) {
      return verdict(!negated, `種族は「${card.race}」です。`);
    }
    if (textHit) return verdict(!negated, "能力テキストに該当する記述があります。");
    if (card.race) {
      // Known race, keyword not present anywhere -> no.
      return verdict(negated, `種族は「${card.race}」です。`);
    }
    return null;
  }
}

// --- helpers ------------------------------------------------------------

function verdict(value: boolean, reason: string): AnswerResult {
  return { answer: value ? "yes" : "no", reason };
}

function unknown(reason: string): AnswerResult {
  return { answer: "unknown", reason };
}

const TRAILING_NEGATION_PATTERN = /(ではない|じゃない|以外)(ですか)?[?？。、.,!！]*$/;
/** Lowercase, trim, normalise full-width chars, drop spaces/punctuation noise. */
function normalize(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ \t　]/g, "")
    .trim();
}

/** Pull the first integer out of a (already normalised) string. */
function extractNumber(s: string): number | null {
  const m = s.match(/-?\d+/);
  return m ? parseInt(m[0], 10) : null;
}

/**
 * Returns true when the question asks whether the card is NOT the given type.
 * Handles patterns like "〜以外ですか", "〜ではないですか", "〜ではないカードタイプですか".
 * Both `q` and `normalizedType` must already be normalised via `normalize()`.
 */
function isTypeNegated(q: string, normalizedType: string): boolean {
  const idx = q.indexOf(normalizedType);
  if (idx === -1) return false;
  const after = q.slice(idx + normalizedType.length);
  return /^(ではない|じゃない|以外|ではなく)/.test(after);
}

/** Convert a power string like "+99999" / "12000" / "∞" to a number. */
function parsePower(power: string | null): number | null {
  if (!power) return null;
  const cleaned = power.replace(/[+,\s]/g, "");
  if (cleaned === "∞" || /infinity/i.test(cleaned)) return Number.POSITIVE_INFINITY;
  const m = cleaned.match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

/**
 * For free-form "Xですか" questions, extract the candidate keyword X.
 * Returns null when no usable keyword is found.
 */
function extractKeyword(q: string): string | null {
  let k = q
    .replace(/このカードは?/g, "")
    .replace(/それは?/g, "")
    .replace(/を?持っていますか.*$/g, "")
    .replace(/を?持つ.*$/g, "")
    .replace(TRAILING_NEGATION_PATTERN, "")
    .replace(/でよ.*$/g, "")
    .replace(/ですか.*$/g, "")
    .replace(/[?？。、.,!！]/g, "")
    .trim();
  // Too short or generic to be meaningful.
  if (k.length < 2) return null;
  return k;
}

function isTrailingNegation(q: string): boolean {
  return TRAILING_NEGATION_PATTERN.test(q);
}

export type { YesNoUnknown };
