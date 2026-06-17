import { prisma, disconnectPrisma } from "../src/db/prisma.js";
import { logger } from "../src/utils/logger.js";

/**
 * Inserts a small set of well-known Duel Masters cards so the bot can be
 * tried out before running the crawler. Idempotent (upsert by sourceUrl).
 */
const SAMPLE_CARDS = [
  {
    name: "ボルメテウス・ホワイト・ドラゴン",
    civilization: "光/火",
    cost: 6,
    cardType: "進化クリーチャー",
    race: "アーマード・ドラゴン",
    power: "5000",
    text: "このクリーチャーがブロックされた時、相手のシールドを1つブレイクし、そのカードを墓地に置く。W・ブレイカー。",
    sourceUrl: "seed://bolmeteus-white-dragon",
  },
  {
    name: "超竜バジュラ",
    civilization: "火",
    cost: 7,
    cardType: "進化クリーチャー",
    race: "アーマード・ドラゴン",
    power: "13000",
    text: "このクリーチャーが攻撃する時、相手のマナゾーンからカードを2枚選び、墓地に置く。T・ブレイカー。",
    sourceUrl: "seed://chouryu-bajula",
  },
  {
    name: "ヘブンズ・ゲート",
    civilization: "光",
    cost: 6,
    cardType: "呪文",
    race: null,
    power: null,
    text: "S・トリガー。自分の手札からブロッカーを持つクリーチャーを2体まで出す。",
    sourceUrl: "seed://heavens-gate",
  },
  {
    name: "アクア・ハルカス",
    civilization: "水",
    cost: 3,
    cardType: "クリーチャー",
    race: "リキッド・ピープル",
    power: "2000",
    text: "このクリーチャーが出た時、カードを1枚引く。",
    sourceUrl: "seed://aqua-hulcus",
  },
  {
    name: "デーモン・ハンド",
    civilization: "闇",
    cost: 6,
    cardType: "呪文",
    race: null,
    power: null,
    text: "S・トリガー。相手のクリーチャーを1体破壊する。",
    sourceUrl: "seed://demon-hand",
  },
  {
    name: "青銅の鎧",
    civilization: "自然",
    cost: 3,
    cardType: "クリーチャー",
    race: "ビーストフォーク",
    power: "1000",
    text: "このクリーチャーが出た時、自分の山札の一番上のカードをマナゾーンに置く。",
    sourceUrl: "seed://bronze-arm-tribe",
  },
  {
    name: "ホーリー・スパーク",
    civilization: "光",
    cost: 5,
    cardType: "呪文",
    race: null,
    power: null,
    text: "S・トリガー。相手のクリーチャーをすべてタップする。",
    sourceUrl: "seed://holy-spark",
  },
  {
    name: "幻想妖精カチュア",
    civilization: "火/自然",
    cost: 6,
    cardType: "クリーチャー",
    race: "ドリームメイト",
    power: "5000",
    text: "自分のターンのはじめに、自分の山札の上から1枚目をシールド化することなどができる。コスト踏み倒し能力を持つ。",
    sourceUrl: "seed://katsia",
  },
];

async function main() {
  let count = 0;
  for (const card of SAMPLE_CARDS) {
    await prisma.card.upsert({
      where: { sourceUrl: card.sourceUrl },
      create: {
        ...card,
        rawText: `${card.name} ${card.civilization ?? ""} ${card.cardType ?? ""} ${card.race ?? ""} ${card.text ?? ""}`,
      },
      update: {
        ...card,
        rawText: `${card.name} ${card.civilization ?? ""} ${card.cardType ?? ""} ${card.race ?? ""} ${card.text ?? ""}`,
      },
    });
    count++;
  }
  const total = await prisma.card.count();
  logger.info(`Seeded ${count} sample card(s). Total cards in DB: ${total}.`);
}

main()
  .catch((err) => {
    logger.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });
