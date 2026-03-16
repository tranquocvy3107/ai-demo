import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import * as cheerio from 'cheerio';

const MAX_RESULTS = 10;

export const webSearchTool = tool(
  async ({ query, numResults }) => {
    try {
      const limit = numResults || MAX_RESULTS;
      console.log(`[WebSearch] Searching: "${query}" (limit: ${limit})`);

      // Google search via HTML scraping
      const encodedQuery = encodeURIComponent(query);
      const searchUrl = `https://www.google.com/search?q=${encodedQuery}&num=${limit}&hl=en`;

      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        return JSON.stringify({
          error: true,
          message: `Google returned HTTP ${response.status}`,
        });
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      const results: Array<{ title: string; url: string; snippet: string }> = [];

      // Parse Google search result items
      $('div.g').each((_, element) => {
        if (results.length >= limit) return false;

        const titleEl = $(element).find('h3').first();
        const linkEl = $(element).find('a').first();
        const snippetEl = $(element).find('.VwiC3b, .IsZvec, .s3v9rd').first();

        const title = titleEl.text().trim();
        const url = linkEl.attr('href') || '';
        const snippet = snippetEl.text().trim();

        if (title && url && url.startsWith('http')) {
          results.push({ title, url, snippet });
        }
      });

      // Fallback: try alternative selectors if no results found
      if (results.length === 0) {
        $('a').each((_, element) => {
          if (results.length >= limit) return false;
          const href = $(element).attr('href') || '';
          const text = $(element).text().trim();

          // Filter for actual search result links
          if (
            href.startsWith('/url?q=') &&
            text.length > 5 &&
            !href.includes('google.com')
          ) {
            const cleanUrl = decodeURIComponent(
              href.replace('/url?q=', '').split('&')[0],
            );
            results.push({
              title: text,
              url: cleanUrl,
              snippet: '',
            });
          }
        });
      }

      return JSON.stringify({
        query,
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
