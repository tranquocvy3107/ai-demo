import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import * as cheerio from 'cheerio';

const MAX_CONTENT_LENGTH = 5000; // Giảm xuống 4000 để an toàn cho context window (tổng token) của AI

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

      // Extract metadata
      const title = $('title').text().trim();
      const metaDescription =
        $('meta[name="description"]').attr('content') || '';

      // Tối ưu hóa việc bóc tách nội dung chính
      let content = '';
      if (selector) {
        content = $(selector)
          .map((_, el) => $(el).text().trim())
          .get()
          .join('\n\n');
      } else {
        // Tự động tìm kiếm các thẻ chứa nội dung quan trọng
        const contentSelectors = [
          'main',
          'article',
          '[role="main"]',
          '.content',
          '#content',
          '.post-content',
          '.entry-content',
        ];
        let foundContent = false;
        for (const sel of contentSelectors) {
          const el = $(sel);
          if (el.length > 0 && el.text().trim().length > 150) {
            content = el.text().trim();
            foundContent = true;
            break;
          }
        }
        if (!foundContent) {
          content = $('body').text().trim();
        }
      }

      // Xử lý làm sạch văn bản: xóa khoảng trắng thừa, xóa dòng rỗng
      content = content
        .replace(/\t/g, ' ')
        .replace(/ {2,}/g, ' ')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 5) // Chỉ giữ các dòng có nội dung thực sự
        .join('\n');

      // Tối ưu hóa việc trích xuất liên kết: Chỉ lấy các link tiềm năng
      let links: Array<{ text: string; href: string }> = [];
      if (extractLinks) {
        const baseUrl = new URL(url);
        $('a[href]').each((_, el) => {
          const href = $(el).attr('href') || '';
          const text = $(el).text().trim().substring(0, 100);
          if (text && href && !href.startsWith('#') && !href.startsWith('javascript:')) {
            let fullUrl = href;
            try {
              if (href.startsWith('/')) {
                fullUrl = `${baseUrl.origin}${href}`;
              } else if (!href.startsWith('http')) {
                fullUrl = new URL(href, baseUrl.origin).toString();
              }
            } catch (e) {
              // ignore invalid URLs
            }
            links.push({ text, href: fullUrl });
          }
        });

        // Chỉ ưu tiên các links liên quan đến pricing/affiliate/about
        const priorityKeywords = ['affiliate', 'pricing', 'partner', 'plan', 'price', '/sign-up', '/register'];
        links = links.filter((l, index, self) =>
          self.findIndex(t => t.href === l.href) === index // Deduplicate
        ).sort((a, b) => {
          const aHas = priorityKeywords.some(kw => a.href.toLowerCase().includes(kw) || a.text.toLowerCase().includes(kw));
          const bHas = priorityKeywords.some(kw => b.href.toLowerCase().includes(kw) || b.text.toLowerCase().includes(kw));
          return aHas === bHas ? 0 : aHas ? -1 : 1;
        }).slice(0, 30);
      }

      if (content.length > MAX_CONTENT_LENGTH) {
        content = content.substring(0, MAX_CONTENT_LENGTH) +
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
        message: error instanceof Error ? error.message : 'Unknown error during scraping',
      });
    }
  },
  {
    name: 'web_scraper',
    description: 'Scrapes a web page to extract readable text content. Can also extract all links (prioritizing affiliate/pricing links). Use this to read page details or discover signup pages.',
    schema: z.object({
      url: z.string().describe('The full URL of the page'),
      selector: z.string().optional().describe('Optional CSS selector'),
      extractLinks: z.boolean().optional().describe('If true, discover links in prioritized order'),
    }),
  }
);
