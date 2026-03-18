import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import * as cheerio from 'cheerio';

// ===== CLEAN TEXT =====
function cleanText(text: string, preserveLineBreaks: boolean) {
  let result = text;

  if (!preserveLineBreaks) {
    result = result.replace(/\s+/g, ' ');
  } else {
    result = result
      .replace(/\n\s*\n/g, '\n') // remove empty lines
      .replace(/[ \t]+/g, ' '); // clean spaces
  }

  return result.trim();
}

// ===== HTML → TEXT =====
function htmlToPlainText(
  html: string,
  options: {
    preserveLineBreaks?: boolean;
    maxLength?: number;
  },
) {
  const { preserveLineBreaks = true, maxLength } = options;

  const $ = cheerio.load(html);

  // remove noise
  $('script, style, noscript').remove();

  // convert block elements to line breaks
  $('br').replaceWith('\n');
  $('p').prepend('\n').append('\n');
  $('div').prepend('\n').append('\n');
  $('li').prepend('\n- ');

  let text = $.text();

  text = cleanText(text, preserveLineBreaks);

  if (maxLength && text.length > maxLength) {
    text = text.slice(0, maxLength) + '...';
  }

  return text;
}

// ===== TOOL =====
export const htmlToTextTool = tool(
  ({ html, preserveLineBreaks, maxLength }) => {
    try {
      const text = htmlToPlainText(html, {
        preserveLineBreaks,
        maxLength,
      });

      return JSON.stringify({
        success: true,
        length: text.length,
        text,
      });
    } catch (err) {
      return JSON.stringify({
        success: false,
        error: true,
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  },
  {
    name: 'html_to_text',
    description:
      'Convert HTML content into clean plain text for LLM processing',
    schema: z.object({
      html: z.string().describe('Raw HTML content'),
      preserveLineBreaks: z.boolean().optional(),
      maxLength: z.number().optional(),
    }),
  },
);
