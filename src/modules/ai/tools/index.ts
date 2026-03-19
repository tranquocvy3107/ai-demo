export * from './http-request.tool';
export * from './web-search.tool';
export * from './web-scraper.tool';
export * from './domain-traffic.tool';
export * from './semrush-traffic.tool';
export * from './save-data.tool';
export * from './read-data.tool';

import { httpRequestTool } from './http-request.tool';
import { webSearchTool } from './web-search.tool';
import { webScraperTool } from './web-scraper.tool';

/**
 * Static tools that don't require dependency injection.
 * Tools like save_data, read_data and semrush_traffic_tool are created dynamically
 * via factory functions in ai.service.ts because they need a TypeORM repository.
 */
export const staticTools = [
  httpRequestTool,
  webSearchTool,
  webScraperTool,
];
