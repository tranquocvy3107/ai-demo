export * from './http-request.tool';
export * from './web-search.tool';
export * from './web-scraper.tool';
export * from './save-data.tool';
export * from './read-data.tool';
export * from './html-to-rsm-json.tool';
export * from './html-to-plaintext.tool';
export * from './web-search-gg.tool';

import { httpRequestTool } from './http-request.tool';
// import { webSearchTool } from './web-search.tool';
import { webScraperTool } from './web-scraper.tool';
import { parseHtmlFromFileTool } from './html-to-rsm-json.tool';
import { htmlToTextTool } from './html-to-plaintext.tool';
import { webSearchGGTool } from './web-search-gg.tool';

/**
 * Static tools that don't require dependency injection.
 * The save_data and read_data tools are created dynamically
 * via factory functions in ai.service.ts (they need a TypeORM repository).
 */
export const staticTools = [
  webSearchGGTool,
  htmlToTextTool,
  parseHtmlFromFileTool,
  httpRequestTool,
  webScraperTool,
];
