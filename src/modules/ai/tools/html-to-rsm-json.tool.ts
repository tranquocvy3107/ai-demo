import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import * as cheerio from 'cheerio';
import fs from 'fs/promises';
import type { AnyNode, Element } from 'domhandler';

const MAX_MARKDOWN_LENGTH = 12000;
const MAX_LINKS = 80;
const DEBUG = process.env.DEBUG === 'true';

function log(...args: any[]) {
  if (DEBUG) console.log('[ParseHtml]', ...args);
}

const name = 'parse_html_from_file';

const description = `
Convert HTML from a saved file into structured, readable Markdown for analysis.

Use this tool immediately after web_scraper writes the HTML content to a file. The tool
reads the file content, converts it into Markdown, extracts links, and JSON-LD structured data.

Input:
- filePath: string (required) — path to the HTML file saved by web_scraper
- url: string (required) — base URL of the page

Output:
- JSON object with:
  - success: boolean
  - url: string
  - title: string
  - metaDescription: string
  - markdown: string (full page content converted to Markdown)
  - links: array of objects { text: string, url: string }
  - jsonLd: array (structured schema.org data if present)
  - truncated: boolean (true if content was shortened due to length)

Behavior:
- Reads the HTML content from the file
- Converts HTML into readable Markdown (headings, paragraphs, lists, tables, links preserved)
- Keeps all visible content — nothing is filtered out
- Extracts all links for navigation or follow-up scraping
- Extracts JSON-LD structured data (often contains pricing, product, or affiliate info)
- Truncates Markdown content if too long, with a note indicating total characters

Rules:
- Always use this tool immediately after web_scraper writes the HTML to a file
- Do NOT analyze raw HTML strings directly — always read from the file
- Use Markdown content to classify pages and extract data
- Use links to discover pricing, affiliate, or related pages
- Prefer JSON-LD data when available, as it is the most reliable structured source
`;

function nodeToMarkdown($: cheerio.CheerioAPI, node: AnyNode): string {
  if (node.type === 'text')
    return (node as { data: string }).data.replace(/\s+/g, ' ');
  if (node.type !== 'tag') return '';

  const el = node as Element;
  const tag = el.tagName?.toLowerCase() ?? '';
  const children = () => el.children.map((c) => nodeToMarkdown($, c)).join('');

  switch (tag) {
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
    case 'ul':
    case 'ol':
      return `\n${children()}\n`;
    case 'li':
      return `\n- ${children().trim()}`;
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
    case 'a': {
      const href = $(el).attr('href') || '';
      const text = children().trim();
      if (!href || !text) return text;
      return `[${text}](${href})`;
    }
    case 'br':
      return '\n';
    case 'hr':
      return '\n---\n';
    case 'table':
      return tableToMarkdown($, el);
    case 'script':
    case 'style':
    case 'noscript':
    case 'iframe':
    case 'svg':
    case 'img':
      return '';
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

function extractJsonLd($: cheerio.CheerioAPI): unknown[] {
  const results: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      results.push(JSON.parse($(el).html() || '{}'));
    } catch {}
  });
  return results;
}

function parseHtml(html: string, baseUrl: string) {
  const $ = cheerio.load(html);
  const title = $('title').text().trim();
  const metaDescription = $('meta[name="description"]').attr('content') || '';
  const links = extractLinks($, baseUrl);
  const jsonLd = extractJsonLd($);

  const rawMarkdown = ($('body').get(0)?.children ?? [])
    .map((c) => nodeToMarkdown($, c))
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  let markdown = rawMarkdown;
  let truncated = false;

  if (markdown.length > MAX_MARKDOWN_LENGTH) {
    markdown = markdown.slice(0, MAX_MARKDOWN_LENGTH);
    const lastNewline = markdown.lastIndexOf('\n');
    if (lastNewline > MAX_MARKDOWN_LENGTH * 0.8)
      markdown = markdown.slice(0, lastNewline);
    markdown += `\n\n...[TRUNCATED — ${rawMarkdown.length} total chars]`;
    truncated = true;
  }

  return { title, metaDescription, markdown, links, jsonLd, truncated };
}

// ===== TOOL =====
export const parseHtmlFromFileTool = tool(
  async ({ filePath, url }) => {
    log(`[FLOW] ► filePath="${filePath}" url="${url}"`);
    try {
      const html = await fs.readFile(filePath, 'utf-8');
      const data = parseHtml(html, url);
      log(
        `[FLOW] ✔ markdown_chars=${data.markdown.length} links=${data.links.length} jsonLd=${data.jsonLd.length} truncated=${data.truncated}`,
      );
      return JSON.stringify({ success: true, url, ...data });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Parse error';
      log(`[FLOW] ✘ FAILED filePath="${filePath}" error="${msg}"`);
      return JSON.stringify({ success: false, message: msg });
    }
  },
  {
    name,
    description,
    schema: z.object({
      filePath: z.string().describe('Path to HTML file saved by web_scraper'),
      url: z
        .string()
        .describe('Base URL of the page for resolving relative links'),
    }),
  },
);
