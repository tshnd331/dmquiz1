import {
  crawl,
  DEFAULT_CRAWL_OPTIONS,
  type CrawlOptions,
} from "../src/crawler/dmwikiCrawler.js";
import { disconnectPrisma } from "../src/db/prisma.js";
import { logger } from "../src/utils/logger.js";

/**
 * CLI entry for `npm run crawl`.
 *
 * Usage:
 *   npm run crawl                    # default: few expansions, <=50 cards
 *   npm run crawl -- --limit 5       # up to 5 expansion pages
 *   npm run crawl -- --max-cards 20  # fetch at most 20 card pages this run
 *   npm run crawl -- --all           # process everything (slow!)
 *   npm run crawl -- --force         # re-fetch even already-stored data
 */
function intArg(argv: string[], i: number, arg: string): number | null {
  const raw = arg.includes("=") ? arg.split("=")[1] : argv[i + 1];
  const v = parseInt(raw ?? "", 10);
  return Number.isFinite(v) ? v : null;
}

function parseArgs(argv: string[]): CrawlOptions {
  const opts: CrawlOptions = { ...DEFAULT_CRAWL_OPTIONS };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--all") {
      opts.all = true;
    } else if (arg === "--force") {
      opts.force = true;
    } else if (arg === "--limit" || arg.startsWith("--limit=")) {
      const v = intArg(argv, i, arg);
      if (!arg.includes("=")) i++;
      if (v !== null) {
        if (v <= 0) opts.all = true;
        else opts.limit = v;
      }
    } else if (arg === "--max-cards" || arg.startsWith("--max-cards=")) {
      const v = intArg(argv, i, arg);
      if (!arg.includes("=")) i++;
      if (v !== null && v > 0) opts.maxCards = v;
    }
  }
  return opts;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await crawl(options);
}

main()
  .catch((err) => {
    logger.error("Crawl crashed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });
