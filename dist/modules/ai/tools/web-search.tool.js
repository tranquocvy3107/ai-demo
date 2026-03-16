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
exports.webSearchTool = void 0;
const tools_1 = require("@langchain/core/tools");
const zod_1 = require("zod");
const cheerio = __importStar(require("cheerio"));
const MAX_RESULTS = 10;
exports.webSearchTool = (0, tools_1.tool)(async ({ query, numResults }) => {
    try {
        const limit = numResults || MAX_RESULTS;
        console.log(`[WebSearch] Searching: "${query}" (limit: ${limit})`);
        const encodedQuery = encodeURIComponent(query);
        const searchUrl = `https://www.google.com/search?q=${encodedQuery}&num=${limit}&hl=en`;
        const response = await fetch(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
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
        const results = [];
        $('div.g').each((_, element) => {
            if (results.length >= limit)
                return false;
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
        if (results.length === 0) {
            $('a').each((_, element) => {
                if (results.length >= limit)
                    return false;
                const href = $(element).attr('href') || '';
                const text = $(element).text().trim();
                if (href.startsWith('/url?q=') &&
                    text.length > 5 &&
                    !href.includes('google.com')) {
                    const cleanUrl = decodeURIComponent(href.replace('/url?q=', '').split('&')[0]);
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
    }
    catch (error) {
        return JSON.stringify({
            error: true,
            message: error instanceof Error ? error.message : 'Unknown error occurred',
        });
    }
}, {
    name: 'web_search',
    description: 'Searches the web using Google to find relevant URLs, articles, and information. Use this to find affiliate pages, pricing pages, reviews, or any topic. Returns a list of URLs with titles and snippets.',
    schema: zod_1.z.object({
        query: zod_1.z
            .string()
            .describe('The search query, e.g. "example.com affiliate program" or "best SaaS pricing page"'),
        numResults: zod_1.z
            .number()
            .optional()
            .describe('Number of results to return (default: 10, max: 10)'),
    }),
});
//# sourceMappingURL=web-search.tool.js.map