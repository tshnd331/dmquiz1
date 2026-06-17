import { prisma } from "../db/prisma.js";
import { logger } from "../utils/logger.js";
import { sleepRandom } from "../utils/sleep.js";
import {
  extractArticleLinks,
  parseCardPage,
  type ParsedCard,
} from "./parser.js";

// Expansion index page (URL-encoded "エキスパンション").
export const EXPANSION_INDEX_URL =
  "https://dmwiki.net/%E3%82%A8%E3%82%AD%E3%82%B9%E3%83%91%E3%83%B3%E3%82%B7%E3%83%A7%E3%83%B3";

const USER_AGENT =
  "dmquiz-bot/0.1 (Duel Masters quiz crawler; contact: set-your-email)";
const MAX_ATTEMPTS = 3;
const SLEEP_MIN_MS = 1000;
const SLEEP_MAX_MS = 3000;

export interface CrawlOptions {
  /** Max number of expansion pages to process. Use `all` to ignore. */
  limit: number;
  /** Max number of card pages to fetch this run (politeness cap). */
  maxCards: number;
  /** Process everything regardless of `limit` / `maxCards`. */
  all: boolean;
  /** Re-fetch even URLs/cards already stored. */
  force: boolean;
}

export const DEFAULT_CRAWL_OPTIONS: CrawlOptions = {
  limit: 2,
  maxCards: 50,
  all: false,
  force: false,
};

/** Fetch a URL as text with retry + polite sleeping. Returns null on failure. */
async function fetchHtml(url: string): Promise<string | null> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const html = await res.text();
      return html;
    } catch (err) {
      logger.warn(
        `fetch failed (attempt ${attempt}/${MAX_ATTEMPTS}) ${url}: ${
          err instanceof Error ? err.message : err
        }`,
      );
      if (attempt < MAX_ATTEMPTS) {
        await sleepRandom(SLEEP_MIN_MS * attempt, SLEEP_MAX_MS * attempt);
      }
    } finally {
      // Be polite between every request, success or failure.
      await sleepRandom(SLEEP_MIN_MS, SLEEP_MAX_MS);
    }
  }
  return null;
}

/** Insert a crawl target if new; on force, reset a done/failed one to pending. */
async function upsertTarget(
  url: string,
  type: "expansion" | "card",
  force: boolean,
): Promise<void> {
  const existing = await prisma.crawlTarget.findUnique({ where: { url } });
  if (!existing) {
    await prisma.crawlTarget.create({ data: { url, type, status: "pending" } });
    return;
  }
  if (force && existing.status !== "pending") {
    await prisma.crawlTarget.update({
      where: { url },
      data: { status: "pending", attempts: 0 },
    });
  }
}

async function markTarget(
  url: string,
  status: "done" | "failed",
  bumpAttempt = false,
): Promise<void> {
  await prisma.crawlTarget.update({
    where: { url },
    data: {
      status,
      ...(bumpAttempt ? { attempts: { increment: 1 } } : {}),
    },
  });
}

/**
 * Main crawl entry point. Resumable: progress is tracked in CrawlTarget
 * rows, already-stored cards are skipped (unless `force`), and failures are
 * retried up to MAX_ATTEMPTS across runs.
 */
export async function crawl(options: CrawlOptions): Promise<void> {
  const { all, limit, force } = options;
  const maxCards = all ? Number.POSITIVE_INFINITY : options.maxCards;
  logger.info(
    `Crawl start (expansions=${all ? "all" : limit}, maxCards=${
      all ? "all" : options.maxCards
    }, force=${force})`,
  );

  // --- Phase 1: expansion index -> expansion targets --------------------
  logger.info(`Fetching expansion index: ${EXPANSION_INDEX_URL}`);
  const indexHtml = await fetchHtml(EXPANSION_INDEX_URL);
  if (!indexHtml) {
    logger.error("Could not fetch the expansion index. Aborting.");
    return;
  }
  const indexBase = EXPANSION_INDEX_URL.split("#")[0];
  const expansionLinks = extractArticleLinks(indexHtml).filter(
    (l) => l.url !== indexBase, // drop the index page's self-link
  );
  logger.info(`Found ${expansionLinks.length} candidate expansion links.`);
  for (const link of expansionLinks) {
    await upsertTarget(link.url, "expansion", force);
  }

  // --- Phase 2: expansion pages -> card targets -------------------------
  const expansionTargets = await prisma.crawlTarget.findMany({
    where: { type: "expansion", status: { not: "done" }, attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { id: "asc" },
    take: all ? undefined : limit,
  });
  logger.info(`Processing ${expansionTargets.length} expansion page(s).`);

  for (const target of expansionTargets) {
    const html = await fetchHtml(target.url);
    if (!html) {
      await markTarget(target.url, "failed", true);
      continue;
    }
    const cardLinks = extractArticleLinks(html);
    logger.info(`  ${target.url} -> ${cardLinks.length} card link(s)`);
    for (const link of cardLinks) {
      await upsertTarget(link.url, "card", force);
    }
    await markTarget(target.url, "done");
  }

  // --- Phase 3: card pages -> Card rows ---------------------------------
  const cardTargets = await prisma.crawlTarget.findMany({
    where: { type: "card", status: { not: "done" }, attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { id: "asc" },
  });
  logger.info(`Processing ${cardTargets.length} card page(s).`);

  let saved = 0;
  let skipped = 0;
  for (const target of cardTargets) {
    if (saved >= maxCards) {
      logger.info(
        `Reached maxCards=${maxCards}. Stopping (resume later to continue).`,
      );
      break;
    }
    // Skip cards already stored unless force is set.
    if (!force) {
      const existing = await prisma.card.findUnique({
        where: { sourceUrl: target.url },
      });
      if (existing) {
        await markTarget(target.url, "done");
        skipped++;
        continue;
      }
    }

    const html = await fetchHtml(target.url);
    if (!html) {
      await markTarget(target.url, "failed", true);
      continue;
    }

    const fallbackName = decodeTitleFromUrl(target.url);
    const parsed = parseCardPage(html, fallbackName);
    await saveCard(parsed, target.url);
    await markTarget(target.url, "done");
    saved++;
  }

  logger.info(
    `Crawl finished. cards saved=${saved}, skipped(existing)=${skipped}.`,
  );
}

/** Upsert a parsed card keyed by sourceUrl (also unique by name). */
async function saveCard(parsed: ParsedCard, sourceUrl: string): Promise<void> {
  const data = {
    name: parsed.name,
    civilization: parsed.civilization,
    cost: parsed.cost,
    cardType: parsed.cardType,
    race: parsed.race,
    power: parsed.power,
    text: parsed.text,
    sourceUrl,
    rawText: parsed.rawText,
    fetchedAt: new Date(),
  };
  try {
    await prisma.card.upsert({
      where: { sourceUrl },
      create: data,
      update: data,
    });
  } catch (err) {
    // Most likely a duplicate `name` from a different URL; log and continue.
    logger.warn(
      `Failed to save card "${parsed.name}" (${sourceUrl}): ${
        err instanceof Error ? err.message : err
      }`,
    );
  }
}

/** Recover a human-ish title from a dmwiki URL for use as a fallback name. */
function decodeTitleFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname.replace(/^\//, "");
    return decodeURIComponent(path);
  } catch {
    return url;
  }
}
