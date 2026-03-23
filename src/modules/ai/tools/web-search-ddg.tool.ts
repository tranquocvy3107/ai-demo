import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import * as cheerio from 'cheerio';
import { chromium } from 'playwright';

// ===== TODO =====
// 1. Rotate User-Agent (anti block)
// 2. Parallel search (multi-engine)

const MAX_RESULTS = 10;

// ===== DEBUG =====
const DEBUG = process.env.DEBUG === 'true';

function log(...args: any[]) {
  if (DEBUG) {
    console.log('[DDG]', ...args);
  }
}

// ===== TYPES =====
type SearchResult = {
  title: string;
  url?: string;
  domain?: string;
  snippet?: string;
};

// ===== UTILS =====
function decodeDuckDuckGoUrl(url: string): string {
  const match = url.match(/uddg=(.*?)(&|$)/);
  return match ? decodeURIComponent(match[1]) : url;
}

function isAdUrl(url: string): boolean {
  return url.includes('/y.js?ad_');
}

function extractDomain(url: string, includeSubdomain = false): string {
  try {
    const u = new URL(url);
    let hostname = u.hostname.replace(/^www\./, '');

    if (!includeSubdomain) {
      const parts = hostname.split('.');
      if (parts.length > 2) {
        hostname = parts.slice(-2).join('.');
      }
    }

    return hostname;
  } catch (err) {
    log('extractDomain error:', err);
    return '';
  }
}

// ===== DEDUPE =====
function dedupeByKey<T>(
  arr: T[],
  getKey: (item: T) => string | undefined,
): T[] {
  const seen = new Set<string>();

  return arr.filter((item) => {
    const key = getKey(item);
    if (!key || seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

// ===== FORMAT =====
function formatResults(
  results: SearchResult[],
  mode: 'url' | 'domain' | 'both',
) {
  return results.map((r) => {
    switch (mode) {
      case 'domain':
        return { title: r.title, domain: r.domain, snippet: r.snippet };
      case 'url':
        return { title: r.title, url: r.url, snippet: r.snippet };
      default:
        return r;
    }
  });
}

// ===== PARSE HTML =====
function parseDuckDuckGoHTML(
  html: string,
  limit: number,
  includeSubdomain: boolean,
): SearchResult[] {
  log('Parsing HTML...');

  const $ = cheerio.load(html);
  const results: SearchResult[] = [];

  $('.result').each((_, el) => {
    if (results.length >= limit) return false;

    const title = $(el).find('.result__title a').text().trim();
    const rawUrl = $(el).find('.result__title a').attr('href') || '';
    const snippet = $(el).find('.result__snippet').text().trim();

    const url = decodeDuckDuckGoUrl(rawUrl);

    if (!title || !url || isAdUrl(url)) return;

    const domain = extractDomain(url, includeSubdomain);

    results.push({ title, url, domain, snippet });
  });

  log('HTML results found:', results.length);

  return dedupeByKey(results, (r) => r.url).slice(0, limit);
}

// ===== PLAYWRIGHT FALLBACK =====
async function searchDuckDuckGoPlaywright(
  query: string,
  limit: number,
  includeSubdomain: boolean,
): Promise<SearchResult[]> {
  log('Using Playwright fallback...');

  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();

    await page.goto(`https://duckduckgo.com/?q=${encodeURIComponent(query)}`);
    await page.waitForTimeout(2000);

    const html = await page.content();
    const $ = cheerio.load(html);

    const results: SearchResult[] = [];

    $('a[data-testid="result-title-a"]').each((_, el) => {
      if (results.length >= limit) return false;

      const title = $(el).text().trim();
      const rawUrl = $(el).attr('href') || '';
      const url = decodeDuckDuckGoUrl(rawUrl);

      if (!title || !url || isAdUrl(url)) return;

      const domain = extractDomain(url, includeSubdomain);

      results.push({
        title,
        url,
        domain,
        snippet: '',
      });
    });

    log('Playwright results found:', results.length);

    return dedupeByKey(results, (r) => r.url).slice(0, limit);
  } catch (err) {
    log('Playwright error:', err);
    return [];
  } finally {
    await browser.close();
  }
}

// ===== MAIN SEARCH =====
async function searchDuckDuckGo(
  query: string,
  limit: number,
  options: {
    onlyUniqueDomain?: boolean;
    includeSubdomain?: boolean;
  },
) {
  const includeSubdomain = options.includeSubdomain ?? false;

  log('Search start:', { query, limit, options });

  let results: SearchResult[] = [];

  try {
    const res = await fetch(
      `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    );

    const html = await res.text();

    results = parseDuckDuckGoHTML(html, limit, includeSubdomain);
  } catch (err) {
    log('HTML fetch error:', err);
  }

  // ===== FALLBACK =====
  if (results.length < limit) {
    const fallback = await searchDuckDuckGoPlaywright(
      query,
      limit - results.length,
      includeSubdomain,
    );

    results = [...results, ...fallback];
  }

  // ===== DEDUPE DOMAIN =====
  if (options.onlyUniqueDomain) {
    results = dedupeByKey(results, (r) => r.domain);
    log('After domain dedupe:', results.length);
  }

  log('Final results:', results.length);

  return results.slice(0, limit);
}

// ===== TOOL =====
export const webSearchDDGTool = tool(
  async ({ query, numResults, mode, onlyUniqueDomain, includeSubdomain }) => {
    const limit = numResults || MAX_RESULTS;
    log(`[FLOW] ► query="${query}" limit=${limit}`);

    try {
      const results = await searchDuckDuckGo(query, limit, {
        onlyUniqueDomain,
        includeSubdomain,
      });

      log(`[FLOW] ✔ found=${results.length} results`);

      return JSON.stringify({
        success: true,
        query,
        totalResults: results.length,
        results: formatResults(results, mode || 'both'),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      log(`[FLOW] ✘ FAILED query="${query}" error="${msg}"`);

      return JSON.stringify({ success: false, error: true, message: msg });
    }
  },
  {
    name: 'web_search',
    description: `
Search the web using DuckDuckGo and return a list of relevant results.

Use this tool when you need to find a target website, domain, or URLs related to the user's query.

Input:
- query: string (required) — search keywords
- numResults: number (optional, default: 10) — maximum number of results
- mode: "url" | "domain" | "both" (optional, default: "both")
- onlyUniqueDomain: boolean (optional) — return only one result per domain
- includeSubdomain: boolean (optional) — include subdomains in domain extraction

Output:
- JSON object with:
  - success: boolean
  - query: string
  - totalResults: number
  - results: array of objects:
    - title: string
    - url: string (if mode = "url" or "both")
    - domain: string (if mode = "domain" or "both")
    - snippet: string

Rules:
- Always use this tool as the FIRST step to discover relevant websites
- Prefer official websites over directories, aggregators, or ads
- Avoid duplicate domains unless explicitly needed
- Do NOT assume a domain without using this tool
`,
    schema: z.object({
      query: z.string(),
      numResults: z.number().optional(),
      mode: z.enum(['url', 'domain', 'both']).optional(),
      onlyUniqueDomain: z.boolean().optional(),
      includeSubdomain: z.boolean().optional(),
    }),
  },
);
