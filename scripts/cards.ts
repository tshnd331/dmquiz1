import type { Prisma } from "@prisma/client";
import { prisma, disconnectPrisma } from "../src/db/prisma.js";
import { logger } from "../src/utils/logger.js";
import { stripBrackets, sourceUrlIsCardPage } from "../src/crawler/parser.js";

/**
 * Inspects cards already imported into the DB (via `npm run seed` / `npm run crawl`).
 *
 * Usage:
 *   npm run cards                     サマリ（総件数 + 文明別/種別別の集計）
 *   npm run cards -- --list           カード一覧（既定50件）
 *   npm run cards -- --list --limit N 件数指定
 *   npm run cards -- --list --filter 光   名前/文明/種別の部分一致で絞込
 *   npm run cards -- --prune --dry-run    不正カード（非《》）の削除対象を確認
 *   npm run cards -- --prune              不正カード削除＋既存名の《》正規化
 */

interface Args {
  list: boolean;
  limit: number;
  filter: string | null;
  prune: boolean;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    list: false,
    limit: 50,
    filter: null,
    prune: false,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--list") {
      args.list = true;
    } else if (a === "--prune") {
      args.prune = true;
    } else if (a === "--dry-run") {
      args.dryRun = true;
    } else if (a === "--limit") {
      const n = Number.parseInt(argv[++i] ?? "", 10);
      if (Number.isFinite(n) && n > 0) args.limit = n;
    } else if (a === "--filter") {
      args.filter = argv[++i] ?? null;
    }
  }
  return args;
}

/** Build a one-line summary of a card's key fields, skipping nulls. */
function cardLine(c: {
  name: string;
  civilization: string | null;
  cost: number | null;
  cardType: string | null;
}): string {
  const parts = [
    c.civilization ? `文明: ${c.civilization}` : null,
    c.cost !== null ? `コスト: ${c.cost}` : null,
    c.cardType ? `種別: ${c.cardType}` : null,
  ].filter(Boolean);
  const meta = parts.length ? `（${parts.join(" / ")}）` : "";
  return `- ${c.name} ${meta}`.trimEnd();
}

/** Print "<count>件  <label>" lines for a groupBy result, biggest first. */
function printGroup(
  title: string,
  rows: { value: string | null; count: number }[],
): void {
  console.log(`\n[${title}]`);
  if (rows.length === 0) {
    console.log("  (なし)");
    return;
  }
  rows
    .slice()
    .sort((a, b) => b.count - a.count)
    .forEach((r) => {
      console.log(`  ${String(r.count).padStart(5)}  ${r.value ?? "(未設定)"}`);
    });
}

async function showSummary(): Promise<void> {
  const total = await prisma.card.count();
  console.log(`取り込み済みカード総数: ${total} 件`);
  if (total === 0) {
    console.log(
      "カードがありません。`npm run seed` でサンプル投入するか、`npm run crawl` で取得してください。",
    );
    return;
  }

  const byCiv = await prisma.card.groupBy({
    by: ["civilization"],
    _count: { _all: true },
  });
  const byType = await prisma.card.groupBy({
    by: ["cardType"],
    _count: { _all: true },
  });

  printGroup(
    "文明別",
    byCiv.map((r) => ({ value: r.civilization, count: r._count._all })),
  );
  printGroup(
    "種別別",
    byType.map((r) => ({ value: r.cardType, count: r._count._all })),
  );
}

async function showList(args: Args): Promise<void> {
  const where: Prisma.CardWhereInput | undefined = args.filter
    ? {
        OR: [
          { name: { contains: args.filter } },
          { civilization: { contains: args.filter } },
          { cardType: { contains: args.filter } },
        ],
      }
    : undefined;

  const total = await prisma.card.count({ where });
  const cards = await prisma.card.findMany({
    where,
    take: args.limit,
    orderBy: { name: "asc" },
    select: { name: true, civilization: true, cost: true, cardType: true },
  });

  const label = args.filter ? `「${args.filter}」に一致するカード` : "カード";
  console.log(`${label}: ${total} 件（先頭 ${cards.length} 件を表示）`);
  if (cards.length === 0) return;

  console.log("");
  for (const c of cards) console.log(cardLine(c));
  if (total > cards.length) {
    console.log(`\n…他 ${total - cards.length} 件（--limit で表示数を変更）`);
  }
}

/**
 * Remove non-card rows that the crawler wrongly imported (set codes like
 * "DMPP-01", keyword pages like "cip", etc.) and normalise the surviving
 * real cards' names by stripping their 《》 brackets.
 *
 * Targets only crawler rows (sourceUrl https://dmwiki.net/…). Seed cards use
 * `seed://` URLs and are never touched.
 *
 * The bad rows are identified from their sourceUrl (card pages carry 《…》 in
 * the URL path), NOT from the stored name. This stays correct even after the
 * stored name has had its 《》 stripped, so `--prune` is safe to re-run.
 */
async function prune(args: Args): Promise<void> {
  const dry = args.dryRun;
  console.log(dry ? "[dry-run] 変更は行いません\n" : "");

  // 1) crawl由来 かつ URLが非カードページ（《》を含まない）を削除。
  //    判定はsourceUrl由来なので保存名の《》剥がし後も再実行で安全。
  const dmwikiCards = await prisma.card.findMany({
    where: { sourceUrl: { startsWith: "https://dmwiki.net" } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, sourceUrl: true },
  });
  const bad = dmwikiCards.filter((c) => !sourceUrlIsCardPage(c.sourceUrl));
  console.log(`削除対象（非カード）: ${bad.length} 件`);
  for (const c of bad) console.log(`  - ${c.name}`);
  if (!dry && bad.length > 0) {
    const { count } = await prisma.card.deleteMany({
      where: { id: { in: bad.map((c) => c.id) } },
    });
    console.log(`→ ${count} 件削除しました`);
  }

  // 2) 残った本物カードの《》を剥がして表記統一。
  const bracketed = await prisma.card.findMany({
    where: { name: { startsWith: "《" } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  console.log(`\n正規化対象（《》剥がし）: ${bracketed.length} 件`);
  let normalized = 0;
  for (const c of bracketed) {
    const next = stripBrackets(c.name);
    if (next === c.name || next.length === 0) continue;
    console.log(`  ${c.name} → ${next}`);
    if (!dry) {
      try {
        await prisma.card.update({ where: { id: c.id }, data: { name: next } });
        normalized++;
      } catch (err) {
        // A name collision (e.g. seed already holds the stripped name).
        logger.warn(
          `正規化スキップ "${c.name}" → "${next}": ${
            err instanceof Error ? err.message : err
          }`,
        );
      }
    }
  }
  if (!dry) console.log(`→ ${normalized} 件を正規化しました`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.prune) {
    await prune(args);
  } else if (args.list) {
    await showList(args);
  } else {
    await showSummary();
  }
}

main()
  .catch((err) => {
    logger.error("Card inspection failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });
