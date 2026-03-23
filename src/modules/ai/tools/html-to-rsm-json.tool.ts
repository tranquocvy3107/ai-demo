import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import * as cheerio from 'cheerio';
import type { AnyNode, Element } from 'domhandler';

// Max markdown length before truncation
const MAX_MARKDOWN_LENGTH = 12000;
const MAX_LINKS = 80;

const DEBUG = process.env.DEBUG === 'true';
function log(...args: any[]) {
  if (DEBUG) console.log('[ParseHtml]', ...args);
}
const description = `
Convert raw HTML into structured, readable Markdown for analysis.

Use this tool after web_scraper to transform HTML into a format that is easy to read and reason about.

Input:
- html: string (required) — cleaned HTML content from web_scraper
- url: string (required) — base URL of the page

Output:
- JSON object with:
  - success: boolean
  - url: string
  - title: string
  - metaDescription: string
  - markdown: string (full page content converted to Markdown)
  - links: array of:
    - text: string (anchor text)
    - url: string (absolute URL)
  - jsonLd: array (structured schema.org data if present)
  - truncated: boolean (true if content was shortened)

Behavior:
- Converts full HTML into Markdown (headings, paragraphs, lists, tables, links preserved)
- Keeps all visible content — nothing is filtered out
- Extracts all links for navigation and follow-up scraping
- Extracts JSON-LD structured data (often contains pricing, product, or affiliate info)
- Truncates content if too long, with a note indicating how to refine extraction

Rules:
- Always use this tool immediately after web_scraper
- Do NOT analyze raw HTML directly — always convert to Markdown first
- Use markdown content to classify the page and extract data
- Use links to discover pricing, affiliate, or related pages
- Prefer jsonLd data when available, as it is the most reliable structured source
`;

// ===== HTML → MARKDOWN =====
// Converts cleaned HTML into readable markdown so the LLM sees all content.
// Nothing is filtered out — uncertain content is kept for the LLM to review.

function nodeToMarkdown($: cheerio.CheerioAPI, node: AnyNode): string {
  if (node.type === 'text') {
    return (node as { data: string }).data.replace(/\s+/g, ' ');
  }

  if (node.type !== 'tag') return '';

  const el = node as Element;
  const tag = el.tagName?.toLowerCase() ?? '';
  const children = () => el.children.map((c) => nodeToMarkdown($, c)).join('');

  switch (tag) {
    // Headings
    case 'h1':
      return `\n# ${children().trim()}\n`;
    case 'h2':
      return `\n## ${children().trim()}\n`;
    case 'h3':
      return `\n### ${children().trim()}\n`;
    case 'h4':
      return `\n#### ${children().trim()}\n`;
    case 'h5':
      return `\n##### ${children().trim()}\n`;
    case 'h6':
      return `\n###### ${children().trim()}\n`;

    // Block elements
    case 'p':
    case 'div':
    case 'section':
    case 'article':
    case 'main':
    case 'aside':
    case 'blockquote': {
      const inner = children().trim();
      return inner ? `\n${inner}\n` : '';
    }

    // Lists
    case 'ul':
    case 'ol':
      return `\n${children()}\n`;
    case 'li':
      return `\n- ${children().trim()}`;

    // Inline elements
    case 'strong':
    case 'b':
      return `**${children()}**`;
    case 'em':
    case 'i':
      return `_${children()}_`;
    case 'code':
      return `\`${children()}\``;
    case 'pre':
      return `\n\`\`\`\n${children()}\n\`\`\`\n`;

    // Links — keep inline so LLM sees URL in context
    case 'a': {
      const href = $(el).attr('href') || '';
      const text = children().trim();
      if (!href || !text) return text;
      return `[${text}](${href})`;
    }

    // Line break
    case 'br':
      return '\n';
    case 'hr':
      return '\n---\n';

    // Tables → markdown table
    case 'table':
      return tableToMarkdown($, el);

    // Skip entirely — these are noise even after web_scraper cleanup
    case 'script':
    case 'style':
    case 'noscript':
    case 'iframe':
    case 'svg':
    case 'img':
      return '';

    // Span and unknown inline tags — just render children
    default:
      return children();
  }
}

function tableToMarkdown($: cheerio.CheerioAPI, tableEl: Element): string {
  const rows: string[][] = [];

  $(tableEl)
    .find('tr')
    .each((_, tr) => {
      const cells: string[] = [];
      $(tr)
        .find('th, td')
        .each((_, cell) => {
          cells.push($(cell).text().replace(/\s+/g, ' ').trim());
        });
      if (cells.length > 0) rows.push(cells);
    });

  if (rows.length === 0) return '';

  const colCount = Math.max(...rows.map((r) => r.length));
  const pad = (row: string[]) =>
    Array.from({ length: colCount }, (_, i) => row[i] ?? '').join(' | ');

  const header = pad(rows[0]);
  const separator = Array(colCount).fill('---').join(' | ');
  const body = rows.slice(1).map(pad).join('\n');

  return `\n| ${header} |\n| ${separator} |\n${rows.slice(1).length > 0 ? '| ' + body.split('\n').join(' |\n| ') + ' |' : ''}\n`;
}

// ===== LINKS =====
function extractLinks(
  $: cheerio.CheerioAPI,
  baseUrl: string,
): { text: string; url: string }[] {
  const seen = new Set<string>();
  const links: { text: string; url: string }[] = [];

  $('a[href]').each((_, el) => {
    let href = $(el).attr('href') || '';
    if (
      !href ||
      href.startsWith('#') ||
      href.startsWith('javascript:') ||
      href.includes('mailto:')
    )
      return;

    try {
      href = new URL(href, baseUrl).href;
    } catch {
      return;
    }

    if (seen.has(href)) return;
    seen.add(href);

    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text) links.push({ text, url: href });
  });

  return links.slice(0, MAX_LINKS);
}

// ===== JSON-LD =====
function extractJsonLd($: cheerio.CheerioAPI): unknown[] {
  const results: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      results.push(JSON.parse($(el).html() || '{}'));
    } catch {
      // ignore malformed
    }
  });
  return results;
}

// ===== MAIN PARSER =====
function parseHtml(html: string, baseUrl: string) {
  const $ = cheerio.load(html);

  const title = $('title').text().trim();
  const metaDescription = $('meta[name="description"]').attr('content') || '';
  const links = extractLinks($, baseUrl);
  const jsonLd = extractJsonLd($);

  // Convert full body to markdown — nothing excluded
  const rawMarkdown = ($('body').get(0)?.children ?? [])
    .map((c) => nodeToMarkdown($, c))
    .join('')
    .replace(/\n{3,}/g, '\n\n') // collapse excessive blank lines
    .trim();

  let markdown = rawMarkdown;
  let truncated = false;

  if (markdown.length > MAX_MARKDOWN_LENGTH) {
    markdown = markdown.slice(0, MAX_MARKDOWN_LENGTH);
    // cut at last complete line to avoid mid-sentence truncation
    const lastNewline = markdown.lastIndexOf('\n');
    if (lastNewline > MAX_MARKDOWN_LENGTH * 0.8) {
      markdown = markdown.slice(0, lastNewline);
    }
    markdown += `\n\n...[TRUNCATED — ${rawMarkdown.length} total chars. Use a CSS selector with web_scraper to target a specific section if needed.]`;
    truncated = true;
  }

  return { title, metaDescription, markdown, links, jsonLd, truncated };
}

// ===== TOOL =====
export const parseHtmlToStructuredTool = tool(
  ({ html, url }) => {
    log(`[FLOW] ► url="${url}" html_chars=${html.length}`);
    try {
      const data = parseHtml(html, url);
      log(
        `[FLOW] ✔ markdown_chars=${data.markdown.length} links=${data.links.length} jsonLd=${data.jsonLd.length} truncated=${data.truncated}`,
      );
      return JSON.stringify({ success: true, url, ...data });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Parse error';
      log(`[FLOW] ✘ FAILED url="${url}" error="${msg}"`);
      return JSON.stringify({ success: false, message: msg });
    }
  },
  {
    name: 'parse_html_structured',
    description,
    schema: z.object({
      html: z.string().describe('Cleaned HTML returned by web_scraper'),
      url: z
        .string()
        .describe('Base URL of the page for resolving relative links'),
    }),
  },
);
