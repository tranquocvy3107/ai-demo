"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.webScraperTool = void 0;
const tools_1 = require("@langchain/core/tools");
const zod_1 = require("zod");
const cheerio = __importStar(require("cheerio"));
const MAX_CONTENT_LENGTH = 6000;
exports.webScraperTool = (0, tools_1.tool)(async ({ url, selector, extractLinks }) => {
    try {
        console.log(`[WebScraper] Scraping: ${url}${selector ? ` (selector: ${selector})` : ''}`);
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
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
        $('script, style, nav, footer, header, iframe, noscript, svg, img, [role="banner"], [role="navigation"], .cookie-banner, .popup').remove();
        const title = $('title').text().trim();
        const metaDescription = $('meta[name="description"]').attr('content') || '';
        let content = '';
        if (selector) {
            content = $(selector)
                .map((_, el) => $(el).text().trim())
                .get()
                .join('\n\n');
        }
        else {
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
        content = content.replace(/\s+/g, ' ').replace(/\n\s*\n/g, '\n');
        let links = [];
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
            const seen = new Set();
            links = links.filter((l) => {
                if (seen.has(l.href))
                    return false;
                seen.add(l.href);
                return true;
            }).slice(0, 50);
        }
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
    }
    catch (error) {
        return JSON.stringify({
            error: true,
            message: error instanceof Error ? error.message : 'Unknown error occurred',
        });
    }
}, {
    name: 'web_scraper',
    description: 'Scrapes a web page and extracts readable text content. Use this to read the full content of a page, extract specific sections with CSS selectors, or discover all links on a page. Good for reading affiliate program details, pricing pages, terms, etc.',
    schema: zod_1.z.object({
        url: zod_1.z.string().describe('The full URL of the page to scrape'),
        selector: zod_1.z
            .string()
            .optional()
            .describe('Optional CSS selector to extract specific elements (e.g. ".pricing-table", "#affiliate-info", "article")'),
        extractLinks: zod_1.z
            .boolean()
            .optional()
            .describe('If true, also extracts all links from the page. Useful for discovering affiliate signup pages, subpages, etc.'),
    }),
});
//# sourceMappingURL=web-scraper.tool.js.map