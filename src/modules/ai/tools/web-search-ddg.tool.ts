import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import * as cheerio from 'cheerio';
import { chromium } from 'playwright';

const MAX_RESULTS = 10;
const DEBUG = true;

type SearchResult = {
  title: string;
  url: string;
  snippet?: string;
};

// ===== LOGGER =====
function log(...args: unknown[]) {
  if (DEBUG) console.log(...args);
}

// ===== UTILS =====
function decodeDuckDuckGoUrl(url: string): string {
  const match = url.match(/uddg=(.*?)(&|$)/);
  return match ? decodeURIComponent(match[1]) : url;
}

// Filter out ads (DuckDuckGo ad URLs usually start with /y.js?ad_)
function isAdUrl(url: string): boolean {
  return url.includes('/y.js?ad_');
}

// Dedupe results by URL
function dedupeResults(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  const deduped: SearchResult[] = [];
  for (const r of results) {
    if (!seen.has(r.url)) {
      deduped.push(r);
      seen.add(r.url);
    }
  }
  return deduped;
}

// ===== FETCH HTML =====
async function fetchDuckDuckGoHTML(query: string, start = 0): Promise<string> {
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}&s=${start}`;

  log('[DDG][FETCH] URL:', url);

  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    },
  });

  const html = await res.text();

  log('[DDG][FETCH] HTML length:', html.length);
  log('[DDG][FETCH] Preview:', html.slice(0, 200));

  return html;
}

// ===== PARSE HTML =====
function parseDuckDuckGoHTML(html: string, limit: number): SearchResult[] {
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];

  $('.result').each((_, el) => {
    if (results.length >= limit) return false;

    const title = $(el).find('.result__title a').text().trim();
    const rawUrl = $(el).find('.result__title a').attr('href') || '';
    const snippet = $(el).find('.result__snippet').text().trim();

    const url = decodeDuckDuckGoUrl(rawUrl);

    // Skip ads
    if (!title || !url || isAdUrl(url)) return;

    results.push({ title, url, snippet });
  });

  log('[DDG][PARSE] Results count (before dedupe/filter):', results.length);

  return dedupeResults(results).slice(0, limit);
}

// ===== PLAYWRIGHT FALLBACK =====
async function searchDuckDuckGoPlaywright(
  query: string,
  limit: number,
): Promise<SearchResult[]> {
  log('[DDG][PLAYWRIGHT] Start fallback');

  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      viewport: { width: 1280, height: 800 },
    });

    const page = await context.newPage();

    const url = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
    log('[DDG][PLAYWRIGHT] Goto:', url);

    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000); // anti-bot delay

    const html = await page.content();
    log('[DDG][PLAYWRIGHT] HTML length:', html.length);

    const $ = cheerio.load(html);
    const results: SearchResult[] = [];

    const selector = 'a[data-testid="result-title-a"]';

    $(selector).each((_, el) => {
      if (results.length >= limit) return false;

      const element = $(el);
      const title = element.text().trim();
      const rawUrl = element.attr('href') || '';
      const url = decodeDuckDuckGoUrl(rawUrl);

      if (title && url && !isAdUrl(url)) {
        results.push({ title, url, snippet: '' });
      }
    });

    return dedupeResults(results).slice(0, limit);
  } catch (err) {
    log('[DDG][PLAYWRIGHT] ERROR:', err);
    return [];
  } finally {
    await browser.close();
  }
}

// ===== MAIN SEARCH =====
async function searchDuckDuckGo(query: string, limit: number) {
  log('\n====== DDG SEARCH START ======');
  log('[DDG] Query:', query);

  const results: SearchResult[] = [];
  let start = 0;
  const pageSize = 10;

  // Try fetching multiple pages until enough results
  while (results.length < limit) {
    try {
      const html = await fetchDuckDuckGoHTML(query, start);
      const pageResults = parseDuckDuckGoHTML(html, limit - results.length);

      results.push(...pageResults);

      if (pageResults.length < pageSize) {
        // No more results on next page
        break;
      }

      start += pageSize;
    } catch (err) {
      log('[DDG] HTML fetch/parse ERROR:', err);
      break;
    }
  }

  if (results.length >= limit) {
    log('[DDG] SUCCESS via HTML, total results:', results.length);
    return { source: 'duckduckgo', totalResults: results.length, results };
  }

  log('[DDG] HTML insufficient, fallback → Playwright');

  const fallback = await searchDuckDuckGoPlaywright(query, limit - results.length);
  const allResults = [...results, ...fallback].slice(0, limit);

  log('====== DDG SEARCH END ======\n');

  return {
    source: fallback.length > 0 ? 'playwright' : 'duckduckgo',
    totalResults: allResults.length,
    results: allResults,
  };
}

// ===== TOOL =====
export const webSearchDDGTool = tool(
  async ({ query, numResults }) => {
    const limit = numResults || MAX_RESULTS;

    try {
      const result = await searchDuckDuckGo(query, limit);
      return JSON.stringify({ query, ...result });
    } catch (err) {
      return JSON.stringify({
        error: true,
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  },
  {
    name: 'web_search',
    description: 'DuckDuckGo search with HTML + Playwright fallback, dedupe & filter ads',
    schema: z.object({ query: z.string(), numResults: z.number().optional() }),
  },
);
