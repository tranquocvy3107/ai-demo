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

  // ===== SPA DETECTOR =====
  private isLikelySPA(html: string, textLength: number): boolean {
    return (
      textLength < 200 ||
      html.includes('__NEXT_DATA__') ||
      html.includes('id="root"') ||
      html.includes('id="app"') ||
      html.includes('data-reactroot') ||
      html.includes('window.__NUXT__') ||
      html.includes('webpack') ||
      html.includes('bundle.js')
    );
  }

  // ===== CONTENT VALIDATOR =====
  private isContentValid(html: string, $: cheerio.CheerioAPI): boolean {
    const text = $('body').text().trim();
    const links = $('a[href]').length;

    if (text.length < 300) {
      log('❌ Content too short');
      return false;
    }

    if (links < 5) {
      log('❌ Too few links');
      return false;
    }

    const hasMeaningfulContent =
      html.includes('₫') ||
      html.toLowerCase().includes('product') ||
      html.toLowerCase().includes('article') ||
      html.toLowerCase().includes('news');

    if (!hasMeaningfulContent) {
      log('⚠️ Weak content signal');
    }

    return true;
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

    const $ = cheerio.load(html);
    const text = $('body').text().trim();

    // ===== SPA DETECT =====
    if (this.isLikelySPA(html, text.length)) {
      log('⚠️ SPA detected → switching to Playwright');
      html = await this.fetchHtmlWithPlaywright(url);
      mode = 'playwright';
      fallbackReason = 'spa_detected';
      return { html, mode, fallbackReason };
    }

    // ===== CONTENT VALIDATION =====
    if (!this.isContentValid(html, $)) {
      log('⚠️ Content invalid → fallback Playwright');
      html = await this.fetchHtmlWithPlaywright(url);
      mode = 'playwright';
      fallbackReason = 'invalid_content';
      return { html, mode, fallbackReason };
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

    log('HTML cleaned:', {
      before: beforeClean,
      after: content.length,
    });

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
        ) {
          return;
        }

        if (href.startsWith('/')) {
          href = `${base.origin}${href}`;
        }

        const domain = (() => {
          try {
            const u = new URL(href);
            return u.hostname.replace(/^www\./, '');
          } catch {
            return '';
          }
        })();

        links.push({
          text: text.substring(0, 100),
          href,
          domain,
        });
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
      meta: {
        mode,
        durationMs: duration,
        fallbackReason,
      },
    };
  }
}

// ===== INSTANCE =====
const scraper = new SmartWebScraperService();

// ===== TOOL =====
export const webScraperTool = tool(
  async ({ url, extractLinks }) => {
    try {
      const result = await scraper.scrape(url, extractLinks);
      return JSON.stringify(result);
    } catch (err) {
      log('ERROR:', err);

      return JSON.stringify({
        success: false,
        error: true,
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  },
  {
    name: 'web_scraper',
    description:
      'Smart web scraper with SPA detection, content validation, Playwright fallback, and cleaned HTML output',
    schema: z.object({
      url: z.string(),
      extractLinks: z.boolean().optional(),
    }),
  },
);
