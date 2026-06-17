import * as cheerio from "cheerio";

export interface ParsedCard {
  name: string;
  civilization: string | null;
  cost: number | null;
  cardType: string | null;
  race: string | null;
  power: string | null;
  text: string | null;
  rawText: string;
}

export interface ExpansionLink {
  url: string;
  title: string;
}

const BASE = "https://dmwiki.net";

/** Resolve a possibly-relative href against the wiki base URL. */
export function resolveUrl(href: string): string {
  try {
    return new URL(href, BASE).toString();
  } catch {
    return href;
  }
}

/**
 * Extract internal article links from a list-style page (the expansion
 * index, or an expansion page listing its cards). This is intentionally
 * broad: it collects content links and lets the caller decide which to
 * enqueue. Navigation/edit/anchor links are filtered out.
 */
export function extractArticleLinks(html: string): ExpansionLink[] {
  const $ = cheerio.load(html);
  const out: ExpansionLink[] = [];
  const seen = new Set<string>();

  // Prefer the PukiWiki/MediaWiki main content area; this excludes the
  // sidebar (#menubar), navigator and footer that repeat on every page.
  const content = $(
    "#body, #mw-content-text, #content, .mw-parser-output",
  ).first();
  const scope = content.length ? content : $("body");

  scope.find("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const title = $(el).text().trim();
    if (!href || !title) return;
    if (!isContentLink(href)) return;

    const url = resolveUrl(href).split("#")[0];
    if (seen.has(url)) return;
    seen.add(url);
    out.push({ url, title });
  });

  return out;
}

function isContentLink(href: string): boolean {
  // Skip anchors and mailto.
  if (href.startsWith("#") || href.startsWith("mailto:")) return false;

  const url = resolveUrl(href);
  let host: string;
  let path: string;
  let search: string;
  try {
    const u = new URL(url);
    host = u.hostname;
    path = decodeURIComponent(u.pathname);
    search = u.search;
  } catch {
    return false;
  }

  // Only the main wiki host — excludes bbs.dmwiki.net and other subdomains.
  if (host !== "dmwiki.net") return false;

  // dmwiki is a PukiWiki: real article pages are path-based ("/PageName").
  // Reject the bare root and any query-action links (?cmd=, ?plugin=, etc.).
  if (path === "/" || path === "") return false;
  if (search && /[?&](cmd|plugin|page|refer|word|encode_hint)=/i.test(search)) {
    return false;
  }

  const lower = path.toLowerCase();
  const badNamespaces = [
    "special:",
    "特別:",
    "category:",
    "カテゴリ:",
    "file:",
    "ファイル:",
    "help:",
    "template:",
    "テンプレート:",
    "talk:",
    "ノート:",
    "user:",
    "利用者:",
    "recentchanges",
    "最近更新",
    "最終更新",
    "メニュー",
    "サイドバー",
    "ヘルプ",
    "frontpage",
    "トップページ",
  ];
  if (badNamespaces.some((b) => lower.includes(b))) return false;
  return true;
}

/**
 * Best-effort parse of a single card page. The contract: when a card is
 * recognised, `name` and `rawText` are always populated and structured
 * fields are filled when they can be confidently extracted. Non-card pages
 * (expansion indexes, keyword glossary entries like "cip", set codes such
 * as "DMPP-01") return `null` so the caller can skip them.
 */
export function parseCardPage(
  html: string,
  fallbackName: string,
): ParsedCard | null {
  const $ = cheerio.load(html);

  const rawTitle =
    $("h1#firstHeading").text().trim() ||
    $("h1.page-header__title").text().trim() ||
    $("title").text().trim() ||
    $("h1").first().text().trim() ||
    fallbackName;
  // Keep the brackets here: the card/non-card decision is made on the
  // pre-stripped title (real card pages are titled 《…》).
  const titleNoSuffix = cleanCardName(rawTitle);
  const hasBracket = hasBracketCardName(titleNoSuffix);

  const content = $(
    "#body, #mw-content-text, .mw-parser-output, #content",
  ).first();
  const scope = content.length ? content : $("body");

  const rawText = collapseWhitespace(scope.text());

  // dmwiki card pages typically render a stat block; we additionally scan
  // the raw text with regexes so parsing degrades gracefully.
  const civilization = extractCivilization(rawText);
  const cost = extractCost(rawText);
  const cardType = extractCardType(rawText);
  const race = extractRace(rawText);
  const power = extractPower(rawText);
  const text = extractAbilityText(scope, $);

  if (!isCardPage(hasBracket, civilization, cardType)) return null;

  // Strip the 《》 for storage so names line up with the seed data.
  const name = stripBrackets(titleNoSuffix) || fallbackName;

  return {
    name,
    civilization,
    cost,
    cardType,
    race,
    power,
    text,
    rawText: truncate(rawText, 20000),
  };
}

/** True when a cleaned page title is in 《…》 card-name form. */
export function hasBracketCardName(title: string): boolean {
  return title.includes("《");
}

/**
 * Decide whether a page is an actual card. Real dmwiki card pages are
 * titled 《…》 and render a stat block, so we require the bracketed name
 * plus at least one confidently-extracted stat (civilization or type).
 */
export function isCardPage(
  hasBracket: boolean,
  civilization: string | null,
  cardType: string | null,
): boolean {
  return hasBracket && (civilization !== null || cardType !== null);
}

// --- field extractors (best effort) -------------------------------------

function extractCivilization(raw: string): string | null {
  const m = raw.match(/文明[\s:：]*([光水闇火自然無／/・]+)/);
  if (m) return m[1].replace(/[／/]/g, "/").trim();
  // Fallback: detect civ keywords near the word 文明.
  const civs = ["光", "水", "闇", "火", "自然", "無色"];
  const found = civs.filter((c) => raw.includes(`${c}文明`));
  return found.length ? found.join("/") : null;
}

function extractCost(raw: string): number | null {
  const m = raw.match(/コスト[\s:：]*([0-9０-９]+)/);
  if (!m) return null;
  const n = parseInt(toHalfWidth(m[1]), 10);
  return Number.isFinite(n) ? n : null;
}

function extractCardType(raw: string): string | null {
  const types = [
    "進化クリーチャー",
    "クリーチャー",
    "呪文",
    "クロスギア",
    "城",
    "フィールド",
    "タマシード",
    "オーラ",
  ];
  const found = types.find((t) => raw.includes(t));
  return found ?? null;
}

function extractRace(raw: string): string | null {
  const m = raw.match(/種族[\s:：]*([^\n。]{1,40})/);
  if (!m) return null;
  return m[1].replace(/\s+/g, " ").trim() || null;
}

function extractPower(raw: string): string | null {
  const m = raw.match(/パワー[\s:：]*([+＋]?[0-9０-９,，]+|∞)/);
  if (!m) return null;
  return toHalfWidth(m[1]).replace(/，/g, ",").trim();
}

function extractAbilityText(
  scope: cheerio.Cheerio<any>,
  $: cheerio.CheerioAPI,
): string | null {
  // Heuristic: the first reasonably-sized paragraph block often holds the
  // ability text. Kept simple on purpose; rawText is the source of truth.
  const paras = scope
    .find("p")
    .toArray()
    .map((p) => collapseWhitespace($(p).text()))
    .filter((t) => t.length > 0);
  const candidate = paras.find((t) => t.length >= 8);
  return candidate ? truncate(candidate, 2000) : null;
}

// --- string helpers -----------------------------------------------------

/** Strip the wiki title suffix and edit markers from a page heading. */
function cleanCardName(title: string): string {
  return title
    .replace(/\s*[-–—]\s*デュエル・マスターズ\s*Wiki\s*$/i, "")
    .replace(/\s*[-–—]\s*Duel\s*Masters\s*Wiki\s*$/i, "")
    .replace(/\s*\[編集\]\s*/g, "")
    .trim();
}

/** Remove 《》 brackets from a card name (storage form matches seed data). */
export function stripBrackets(name: string): string {
  return name.replace(/[《》]/g, "").trim();
}

function collapseWhitespace(s: string): string {
  return s.replace(/[\t\r ]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function toHalfWidth(s: string): string {
  return s.replace(/[０-９]/g, (d) =>
    String.fromCharCode(d.charCodeAt(0) - 0xfee0),
  );
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}
