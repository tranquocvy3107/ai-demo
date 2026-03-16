import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import * as cheerio from 'cheerio';

const MAX_CONTENT_LENGTH = 6000;

export const webScraperTool = tool(
  async ({ url, selector, extractLinks }) => {
    try {
      console.log(`[WebScraper] Scraping: ${url}${selector ? ` (selector: ${selector})` : ''}`);

      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(20000),
      });

      if (!response.ok) {
        return JSON.stringify({
          error: true,
          message: `HTTP ${response.status} ${response.statusText}`,
        });
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Remove noise elements
      $(
        'script, style, nav, footer, header, iframe, noscript, svg, img, [role="banner"], [role="navigation"], .cookie-banner, .popup',
      ).remove();

      // Extract page metadata
      const title = $('title').text().trim();
      const metaDescription =
        $('meta[name="description"]').attr('content') || '';

      // Extract content based on selector or default to main content
      let content = '';
      if (selector) {
        content = $(selector)
          .map((_, el) => $(el).text().trim())
          .get()
          .join('\n\n');
      } else {
        // Try common content containers, fall back to body
        const contentSelectors = [
          'main',
          'article',
          '[role="main"]',
          '.content',
          '#content',
          '.post-content',
          '.entry-content',
        ];
        let found = false;
        for (const sel of contentSelectors) {
          const el = $(sel);
          if (el.length > 0 && el.text().trim().length > 100) {
            content = el.text().trim();
            found = true;
            break;
          }
        }
        if (!found) {
          content = $('body').text().trim();
        }
      }

      // Clean up whitespace
      content = content.replace(/\s+/g, ' ').replace(/\n\s*\n/g, '\n');

      // Extract links if requested
      let links: Array<{ text: string; href: string }> = [];
      if (extractLinks) {
        const baseUrl = new URL(url);
        $('a[href]').each((_, el) => {
          const href = $(el).attr('href') || '';
          const text = $(el).text().trim();
          if (text && href && !href.startsWith('#') && !href.startsWith('javascript:')) {
            let fullUrl = href;
            if (href.startsWith('/')) {
              fullUrl = `${baseUrl.protocol}//${baseUrl.host}${href}`;
            }
            links.push({ text: text.substring(0, 100), href: fullUrl });
          }
        });

        // Dedupe and limit
        const seen = new Set<string>();
        links = links.filter((l) => {
          if (seen.has(l.href)) return false;
          seen.add(l.href);
          return true;
        }).slice(0, 50);
      }

      // Truncate content
      if (content.length > MAX_CONTENT_LENGTH) {
        content =
          content.substring(0, MAX_CONTENT_LENGTH) +
          `\n...[TRUNCATED, total ${content.length} chars]`;
      }

      return JSON.stringify({
        url,
        title,
        metaDescription,
        content,
        ...(extractLinks ? { links } : {}),
      });
    } catch (error) {
      return JSON.stringify({
        error: true,
        message:
          error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  },
  {
    name: 'web_scraper',
    description:
      'Scrapes a web page and extracts readable text content. Use this to read the full content of a page, extract specific sections with CSS selectors, or discover all links on a page. Good for reading affiliate program details, pricing pages, terms, etc.',
    schema: z.object({
      url: z.string().describe('The full URL of the page to scrape'),
      selector: z
        .string()
        .optional()
        .describe(
          'Optional CSS selector to extract specific elements (e.g. ".pricing-table", "#affiliate-info", "article")',
        ),
      extractLinks: z
        .boolean()
        .optional()
        .describe(
          'If true, also extracts all links from the page. Useful for discovering affiliate signup pages, subpages, etc.',
        ),
    }),
  },
);
