import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import * as cheerio from 'cheerio';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// enable stealth
chromium.use(StealthPlugin());

const MAX_RESULTS = 10;
const USER_DATA_DIR = './user-data';

// ===== USER AGENTS =====
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
];

// ===== TYPES =====
type SearchResult = {
  title: string;
  url?: string;
  domain?: string;
  snippet?: string;
};

// ===== UTILS =====
function getRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
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
  } catch {
    return '';
  }
}

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

// ===== PARSE =====
function parseGoogleHTML(
  html: string,
  limit: number,
  includeSubdomain: boolean,
): SearchResult[] {
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];

  $('a h3').each((_, el) => {
    if (results.length >= limit) return false;

    const title = $(el).text().trim();
    const link = $(el).closest('a').attr('href') || '';

    if (!title || !link.startsWith('http')) return;

    results.push({
      title,
      url: link,
      domain: extractDomain(link, includeSubdomain),
      snippet: '',
    });
  });

  return dedupeByKey(results, (r) => r.url).slice(0, limit);
}

// ===== HUMAN SIMULATION =====
async function simulateHuman(page: any) {
  await page.mouse.move(100 + Math.random() * 300, 200 + Math.random() * 300);

  await page.waitForTimeout(500 + Math.random() * 1000);
}

// ===== GOOGLE SEARCH =====
async function searchGooglePlaywright(
  query: string,
  limit: number,
  includeSubdomain: boolean,
): Promise<SearchResult[]> {
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false, // 👉 debug; production đổi true

    userAgent: USER_AGENTS[0],

    viewport: { width: 1366, height: 768 },
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',

    args: ['--disable-blink-features=AutomationControlled'],
  });

  try {
    const page = await context.newPage();

    console.log('🔍 Searching:', query);

    // ===== STEP 1 =====
    await page.goto('https://www.google.com', { timeout: 20000 });

    await page.waitForTimeout(3000 + Math.random() * 3000);
    await simulateHuman(page);

    // cookie consent
    try {
      const btn = await page.$('button:has-text("Accept all")');
      if (btn) await btn.click();
    } catch {}

    // ===== STEP 2 =====
    await page.click('textarea[name="q"]');
    await page.waitForTimeout(500 + Math.random() * 1000);

    // ===== STEP 3 =====
    await page.type('textarea[name="q"]', query, {
      delay: 100 + Math.random() * 120,
    });

    await page.waitForTimeout(1000);

    // ===== STEP 4 =====
    await page.keyboard.press('Enter');

    // ===== STEP 5 =====
    await page.waitForTimeout(5000 + Math.random() * 4000);
    await simulateHuman(page);

    await page.mouse.wheel(0, 300 + Math.random() * 500);

    const html = await page.content();

    // ===== CAPTCHA =====
    if (html.includes('captcha') || html.includes('unusual traffic')) {
      console.log('❌ CAPTCHA detected');
      console.log('👉 Solve manually to warm session');
      return [];
    }

    return parseGoogleHTML(html, limit, includeSubdomain);
  } catch (err) {
    console.error('❌ Search error:', err);
    return [];
  } finally {
    // ❗ KHÔNG close để giữ session trust
    await context.close();
  }
}

// ===== MAIN =====
async function searchWeb(
  query: string,
  limit: number,
  options: {
    onlyUniqueDomain?: boolean;
    includeSubdomain?: boolean;
  },
) {
  const includeSubdomain = options.includeSubdomain ?? false;

  let results = await searchGooglePlaywright(query, limit, includeSubdomain);

  if (options.onlyUniqueDomain) {
    results = dedupeByKey(results, (r) => r.domain);
  }

  return results.slice(0, limit);
}

// ===== TOOL =====
export const webSearchGGTool = tool(
  async ({ query, numResults, mode, onlyUniqueDomain, includeSubdomain }) => {
    const limit = numResults || MAX_RESULTS;

    const results = await searchWeb(query, limit, {
      onlyUniqueDomain,
      includeSubdomain,
    });

    return JSON.stringify({
      success: true,
      query,
      totalResults: results.length,
      results: formatResults(results, mode || 'both'),
    });
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
    - url: string
    - domain: string
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
