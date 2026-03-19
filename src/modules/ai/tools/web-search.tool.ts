import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import * as cheerio from 'cheerio';

const MAX_RESULTS = 4; // Tăng lên 5 để AI có nhiều sự lựa chọn hơn
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

type SearchResult = { title: string; url: string; snippet: string };

/**
 * Phân tích HTML từ DuckDuckGo Lite để trích xuất kết quả tìm kiếm.
 * Cấu trúc Lite: 
 * - Link nằm trong thẻ <a class="result-link">
 * - Snippet nằm trong thẻ <td class="result-snippet"> ngay sau dòng chứa link.
 */
function parseDuckDuckGoLite(html: string, limit: number): SearchResult[] {
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];

  // DuckDuckGo Lite sử dụng table cấu trúc: 
  // 1 row cho tiêu đề/link, 1 row tiếp theo cho snippet
  $('a.result-link').each((_, element) => {
    if (results.length >= limit) return false;

    const linkEl = $(element);
    const title = linkEl.text().trim();
    let rawUrl = linkEl.attr('href') || '';

    // DuckDuckGo lite encode URL qua /l/?uddg=...
    let url = rawUrl;
    if (rawUrl.includes('uddg=')) {
      try {
        const urlParams = new URLSearchParams(rawUrl.split('?')[1]);
        url = urlParams.get('uddg') || rawUrl;
      } catch (e) {
        // Fallback if URL parsing fails
      }
    } else if (rawUrl.startsWith('//')) {
      url = 'https:' + rawUrl;
    }

    // Tìm snippet ở hàng tiếp theo (tr.result-snippet)
    // Cấu trúc: <tr><td>link</td></tr> <tr><td></td><td class="result-snippet">snippet</td></tr>
    const parentRow = linkEl.closest('tr');
    const snippetRow = parentRow.next('tr');
    const snippet = snippetRow.find('.result-snippet').text().trim();

    if (title && url && url.startsWith('http')) {
      // Loại bỏ các URL nội bộ của DuckDuckGo (help, settings, v.v.)
      if (!url.includes('duckduckgo.com') || url.includes('q=')) {
        results.push({ title, url, snippet });
      }
    }
  });

  return results;
}

export const webSearchTool = tool(
  async ({ query, numResults }) => {
    try {
      const limit = numResults || MAX_RESULTS;
      console.log(`[WebSearch] DuckDuckGo Lite: "${query}" (limit: ${limit})`);

      const encodedQuery = encodeURIComponent(query);
      // Sử dụng DuckDuckGo Lite làm engine chính theo yêu cầu
      const searchUrl = `https://duckduckgo.com/lite/?q=${encodedQuery}`;

      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': UA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        return JSON.stringify({
          error: true,
          message: `DuckDuckGo Lite error: ${response.status} ${response.statusText}`,
        });
      }

      const html = await response.text();
      const results = parseDuckDuckGoLite(html, limit);

      if (results.length === 0) {
        return JSON.stringify({
          error: true,
          message: 'Zero results found on DuckDuckGo Lite. Please try a different query.',
        });
      }

      return JSON.stringify({
        query,
        source: 'duckduckgo-lite',
        totalResults: results.length,
        results,
      });
    } catch (error) {
      return JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error during search',
      });
    }
  },
  {
    name: 'web_search',
    description: 'Searches the web using DuckDuckGo to find relevant URLs, articles, and information. Returns titles, URLs, and snippets. Use this for finding affiliate programs, pricing, and domain reviews.',
    schema: z.object({
      query: z.string().describe('The search query'),
      numResults: z.number().optional().describe('Number of results (1-10)'),
    }),
  }
);
