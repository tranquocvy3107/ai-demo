import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import * as cheerio from 'cheerio';
import { chromium, Browser } from 'playwright';

// ===== CONFIG =====
const MAX_CONTENT_LENGTH = 10000;
const DEBUG = process.env.DEBUG === 'true';

// ===== LOGGER =====
function log(...args: any[]) {
  if (DEBUG) console.log('[WebScraper]', ...args);
}

// ===== BROWSER (reuse) =====
let browser: Browser | null = null;

async function getBrowser() {
  // Fix #6: reset dead browser instance before reusing
  if (browser && !browser.isConnected()) {
    log('Browser disconnected — relaunching');
    browser = null;
  }
  if (!browser) {
    log('Launching browser...');
    browser = await chromium.launch({ headless: true });
  }
  return browser;
}

// ===== SERVICE =====
class SmartWebScraperService {
  // ===== FAST FETCH =====
  private async fetchHtml(url: string): Promise<string> {
    log('Fetching via HTTP...');
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Accept: 'text/html',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  }

  // ===== PLAYWRIGHT FETCH =====
  private async fetchHtmlWithPlaywright(url: string): Promise<string> {
    log('Fetching via Playwright...');
    const browser = await getBrowser();
    const page = await browser.newPage();

    try {
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      });

      await page.waitForTimeout(2000); // wait JS render
      return await page.content();
    } finally {
      await page.close();
    }
  }

  // ===== SSR DETECTOR =====
  private isSSR(html: string): boolean {
    const $ = cheerio.load(html);
    const text = $('body').text().trim();
    return text.length > 200; // nếu đủ content → SSR
  }

  // ===== SMART FETCH =====
  private async getHtmlSmart(url: string) {
    let html = '';
    let mode: 'fetch' | 'playwright' = 'fetch';
    let fallbackReason: string | null = null;

    try {
      html = await this.fetchHtml(url);
      log('Fetch success');
    } catch (err) {
      log('Fetch failed → fallback Playwright', err);
      html = await this.fetchHtmlWithPlaywright(url);
      mode = 'playwright';
      fallbackReason = 'fetch_failed';
      return { html, mode, fallbackReason };
    }

    if (!this.isSSR(html)) {
      log('⚠️ No SSR content → fallback Playwright');
      html = await this.fetchHtmlWithPlaywright(url);
      mode = 'playwright';
      fallbackReason = 'no_ssr';
    }

    return { html, mode, fallbackReason };
  }

  // ===== MAIN SCRAPE =====
  async scrape(url: string, extractLinks?: boolean) {
    const start = Date.now();

    log('START:', url);

    const { html, mode, fallbackReason } = await this.getHtmlSmart(url);
    log('Mode used:', mode);

    const $ = cheerio.load(html);

    // ===== REMOVE NOISE =====
    const removed = $(
      'script, style, nav, footer, header, iframe, noscript, svg',
    ).length;
    $('script, style, nav, footer, header, iframe, noscript, svg').remove();
    log('Removed elements:', removed);

    // ===== META =====
    const title = $('title').text().trim();
    const metaDescription = $('meta[name="description"]').attr('content') || '';

    // ===== HTML CONTENT =====
    let content = $('body').html() || '';
    const beforeClean = content.length;

    content = content
      .replace(/\s{2,}/g, ' ')
      .replace(/>\s+</g, '><')
      .trim();

    log('HTML cleaned:', { before: beforeClean, after: content.length });

    if (content.length > MAX_CONTENT_LENGTH) {
      content =
        content.slice(0, MAX_CONTENT_LENGTH) +
        `<!-- TRUNCATED ${content.length} -->`;
    }

    // ===== LINKS =====
    let links: Array<{ text: string; href: string; domain: string }> = [];
    if (extractLinks) {
      const base = new URL(url);

      $('a[href]').each((_, el) => {
        let href = $(el).attr('href') || '';
        const text = $(el).text().trim();

        if (
          !href ||
          !text ||
          href.startsWith('#') ||
          href.startsWith('javascript:')
        )
          return;
        if (href.startsWith('/')) href = `${base.origin}${href}`;

        const domain = (() => {
          try {
            const u = new URL(href);
            return u.hostname.replace(/^www\./, '');
          } catch {
            return '';
          }
        })();

        links.push({ text: text.substring(0, 100), href, domain });
      });

      const seen = new Set<string>();
      links = links
        .filter((l) => !seen.has(l.href) && seen.add(l.href))
        .slice(0, 50);
      log('Links extracted:', links.length);
    }

    const duration = Date.now() - start;
    log('DONE in', duration, 'ms');

    return {
      success: true,
      url,
      title,
      metaDescription,
      html: content,
      ...(extractLinks ? { links } : {}),
      meta: { mode, durationMs: duration, fallbackReason },
    };
  }
}

// ===== INSTANCE =====
const scraper = new SmartWebScraperService();

// ===== TOOL =====
export const webScraperTool = tool(
  async ({ url, extractLinks }) => {
    log(`[FLOW] ► url="${url}" extractLinks=${!!extractLinks}`);
    try {
      const result = await scraper.scrape(url, extractLinks);
      log(
        `[FLOW] ✔ mode=${result.meta.mode} html_chars=${result.html.length} duration=${result.meta.durationMs}ms fallback=${result.meta.fallbackReason ?? 'none'}`,
      );
      return JSON.stringify(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      log(`[FLOW] ✘ FAILED url="${url}" error="${msg}"`);
      return JSON.stringify({ success: false, error: true, message: msg });
    }
  },
  {
    name: 'web_scraper',
    description: `
Fetch and extract content from a webpage using a smart scraping strategy.

Use this tool when you already have a URL and need to retrieve its content for analysis.

Input:
- url: string (required) — full URL of the webpage
- extractLinks: boolean (optional, default: false) — whether to extract links from the page

Output:
- JSON object with:
  - success: boolean
  - url: string
  - title: string (page title)
  - metaDescription: string
  - html: string (cleaned HTML content, truncated if too long)
  - links: array (only if extractLinks = true), each:
    - text: string (anchor text)
    - href: string (absolute URL)
    - domain: string
  - meta:
    - mode: "fetch" | "playwright" (how the page was retrieved)
    - durationMs: number
    - fallbackReason: string | null

Behavior:
- First attempts fast HTTP fetch
- If content is missing or incomplete (no SSR), automatically falls back to Playwright
- Removes scripts, styles, navigation, and other non-content elements
- Normalizes and cleans HTML for easier parsing

Rules:
- Always use this tool AFTER discovering a valid URL (e.g. from web_search)
- Do NOT attempt to extract structured data directly from raw HTML
- Always pass the returned html to parse_html_structured before analysis
- Use extractLinks = true when you need to discover pricing, affiliate, or navigation URLs
`,
    schema: z.object({
      url: z.string(),
      extractLinks: z.boolean().optional(),
    }),
  },
);
