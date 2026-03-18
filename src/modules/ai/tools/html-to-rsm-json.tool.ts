import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import * as cheerio from 'cheerio';

// ===== CONFIG =====
const MAX_ITEMS = 50;

// ===== PARSER =====
function parseHtml(html: string, baseUrl: string) {
  const $ = cheerio.load(html);

  // remove noise
  $('script, style, nav, footer, header, iframe, noscript, svg').remove();

  const links: any[] = [];
  const products: any[] = [];
  const texts: any[] = [];

  // ===== LINKS =====
  $('a').each((_, el) => {
    let href = $(el).attr('href');
    if (!href) return;

    try {
      href = new URL(href, baseUrl).href;
    } catch {
      return;
    }

    if (
      href.startsWith('javascript:') ||
      href.startsWith('#') ||
      href.includes('mailto:')
    )
      return;

    const anchorText = $(el).text().trim();

    const parent = $(el).closest('div, p, li, section');
    const context = parent.text().trim().slice(0, 300);

    links.push({
      url: href,
      anchorText,
      context,
    });
  });

  // dedupe links
  const seen = new Set();
  const cleanLinks = links
    .filter((l) => !seen.has(l.url) && seen.add(l.url))
    .slice(0, MAX_ITEMS);

  // ===== PRODUCTS / PRICE =====
  const priceRegex = /(\$|€|£)?\s?\d+([.,]\d{1,2})?/;

  $('[class*="price"], [id*="price"], body *').each((_, el) => {
    const text = $(el).text().trim();

    if (!text || text.length > 200) return;

    if (priceRegex.test(text)) {
      const price = text.match(priceRegex)?.[0];

      products.push({
        price,
        context: text,
      });
    }
  });

  const cleanProducts = products.slice(0, MAX_ITEMS);

  // ===== TEXT =====
  $('p, li, div').each((_, el) => {
    const content = $(el).text().trim();

    if (content.length > 40 && content.length < 500) {
      texts.push({ content });
    }
  });

  const cleanTexts = texts.slice(0, MAX_ITEMS);

  return {
    title: $('title').text(),
    metaDescription: $('meta[name="description"]').attr('content') || '',

    links: cleanLinks,
    products: cleanProducts,
    texts: cleanTexts,
  };
}

// ===== TOOL =====
export const parseHtmlToStructuredTool = tool(
  ({ html, url }) => {
    try {
      const data = parseHtml(html, url);

      return JSON.stringify({
        success: true,
        url,
        ...data,
      });
    } catch (err) {
      return JSON.stringify({
        success: false,
        message: err instanceof Error ? err.message : 'Parse error',
      });
    }
  },
  {
    name: 'parse_html_structured',
    description:
      'Parse cleaned HTML into structured JSON (links, products, texts) for affiliate and product analysis',
    schema: z.object({
      html: z.string().describe('Raw HTML content from scraper'),
      url: z.string().describe('Base URL for resolving relative links'),
    }),
  },
);
