import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import * as cheerio from 'cheerio';

const MAX_RESULTS = 1;
const GOOGLE_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

type SearchResult = { title: string; url: string; snippet: string };

function normalizeGoogleUrl(href: string): string {
  if (!href) return '';
  if (href.startsWith('/url?q=')) {
    return decodeURIComponent(href.replace('/url?q=', '').split('&')[0]);
  }
  return href;
}

function parseGoogleHtml(html: string, limit: number): SearchResult[] {
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];

  $('div.g').each((_, element) => {
    if (results.length >= limit) return false;
    const titleEl = $(element).find('h3').first();
    const linkEl = $(element).find('a').first();
    const snippetEl = $(element).find('.VwiC3b, .IsZvec, .s3v9rd').first();

    const title = titleEl.text().trim();
    const href = linkEl.attr('href') || '';
    const url = normalizeGoogleUrl(href);
    const snippet = snippetEl.text().trim();

    if (title && url && url.startsWith('http')) {
      results.push({ title, url, snippet });
    }
  });

  if (results.length > 0) return results;

  // Fallback: try alternative selectors if no results found
  $('a').each((_, element) => {
    if (results.length >= limit) return false;
    const href = $(element).attr('href') || '';
    const text = $(element).text().trim();
    if (!href || !text) return;
    if (text.length < 5) return;
    if (href.includes('google.com')) return;

    const url = normalizeGoogleUrl(href);
    if (url.startsWith('http')) {
      results.push({ title: text, url, snippet: '' });
    }
  });

  return results;
}

function parseDuckDuckGoHtml(html: string, limit: number): SearchResult[] {
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];

  $('.result, .result__body').each((_, element) => {
    if (results.length >= limit) return false;
    const titleEl = $(element)
      .find('.result__title a, a.result__a')
      .first();
    const snippetEl = $(element).find('.result__snippet').first();
    const title = titleEl.text().trim();
    const url = titleEl.attr('href') || '';
    const snippet = snippetEl.text().trim();
    if (title && url && url.startsWith('http')) {
      results.push({ title, url, snippet });
    }
  });

  return results;
}

function parseDuckDuckGoLiteHtml(html: string, limit: number): SearchResult[] {
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];

  $('a.result-link').each((_, element) => {
    if (results.length >= limit) return false;
    const linkEl = $(element);
    const title = linkEl.text().trim();
    const url = linkEl.attr('href') || '';
    if (title && url && url.startsWith('http')) {
      results.push({ title, url, snippet: '' });
    }
  });

  return results;
}

function parseBingHtml(html: string, limit: number): SearchResult[] {
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];

  $('li.b_algo').each((_, element) => {
    if (results.length >= limit) return false;
    const titleEl = $(element).find('h2 a').first();
    const snippetEl = $(element).find('p').first();
    const title = titleEl.text().trim();
    const url = titleEl.attr('href') || '';
    const snippet = snippetEl.text().trim();
    if (title && url && url.startsWith('http')) {
      results.push({ title, url, snippet });
    }
  });

  return results;
}

export const webSearchTool = tool(
  async ({ query, numResults }) => {
    try {
      const limit = numResults || MAX_RESULTS;
      console.log(`[WebSearch] Searching: "${query}" (limit: ${limit})`);

      // Google search via HTML scraping (basic mode to avoid JS rendering)
      const encodedQuery = encodeURIComponent(query);
      const searchUrl = `https://www.google.com/search?q=${encodedQuery}&num=${limit}&hl=en&gbv=1&pws=0`;

      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': GOOGLE_UA,
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(15000),
      });

      let results: SearchResult[] = [];
      let source = 'google';

      if (response.ok) {
        const html = await response.text();
        results = parseGoogleHtml(html, limit);
      }

      // Fallback 1: DuckDuckGo HTML
      if (results.length === 0) {
        const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;
        const ddgResponse = await fetch(ddgUrl, {
          headers: {
            'User-Agent': GOOGLE_UA,
            Accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          signal: AbortSignal.timeout(15000),
        });
        if (ddgResponse.ok) {
          const ddgHtml = await ddgResponse.text();
          results = parseDuckDuckGoHtml(ddgHtml, limit);
          if (results.length > 0) source = 'duckduckgo-html';
        }
      }

      // Fallback 2: DuckDuckGo Lite
      if (results.length === 0) {
        const ddgLiteUrl = `https://duckduckgo.com/lite/?q=${encodedQuery}`;
        const ddgLiteResponse = await fetch(ddgLiteUrl, {
          headers: {
            'User-Agent': GOOGLE_UA,
            Accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          signal: AbortSignal.timeout(15000),
        });
        if (ddgLiteResponse.ok) {
          const ddgLiteHtml = await ddgLiteResponse.text();
          results = parseDuckDuckGoLiteHtml(ddgLiteHtml, limit);
          if (results.length > 0) source = 'duckduckgo-lite';
        }
      }

      // Fallback 3: Bing HTML
      if (results.length === 0) {
        const bingUrl = `https://www.bing.com/search?q=${encodedQuery}&count=${limit}`;
        const bingResponse = await fetch(bingUrl, {
          headers: {
            'User-Agent': GOOGLE_UA,
            Accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          signal: AbortSignal.timeout(15000),
        });
        if (bingResponse.ok) {
          const bingHtml = await bingResponse.text();
          results = parseBingHtml(bingHtml, limit);
          if (results.length > 0) source = 'bing';
        }
      }

      if (results.length === 0) {
        return JSON.stringify({
          error: true,
          message:
            'Search returned 0 results from Google, DuckDuckGo (HTML/Lite), and Bing.',
        });
      }

      return JSON.stringify({
        query,
        source,
        totalResults: results.length,
        results,
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
    name: 'web_search',
    description:
      'Searches the web using Google to find relevant URLs, articles, and information. Use this to find affiliate pages, pricing pages, reviews, or any topic. Returns a list of URLs with titles and snippets.',
    schema: z.object({
      query: z
        .string()
        .describe(
          'The search query, e.g. "example.com affiliate program" or "best SaaS pricing page"',
        ),
      numResults: z
        .number()
        .optional()
        .describe('Number of results to return (default: 10, max: 10)'),
    }),
  },
);
