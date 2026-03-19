// import { tool } from '@langchain/core/tools';
// import { z } from 'zod';
// import * as cheerio from 'cheerio';

// const UA =
//   'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// type KeywordItem = { keyword: string; share?: number };
// type CountryItem = { country: string; share?: number };

// type TrafficResult = {
//   domain: string;
//   sources: Array<{ name: string; url: string; method: string }>;
//   traffic?: {
//     monthlyVisits?: number;
//     visitsSeries?: Array<{ date: string; visits: number }>;
//   };
//   engagement?: {
//     bounceRate?: number;
//     pagesPerVisit?: number;
//     avgVisitDuration?: number;
//   };
//   topCountries?: CountryItem[];
//   topKeywords?: KeywordItem[];
//   note?: string;
// };

// function safeJsonParse(input: string): unknown | null {
//   try {
//     return JSON.parse(input);
//   } catch {
//     return null;
//   }
// }

// function extractJsonFromScripts(html: string): unknown | null {
//   const $ = cheerio.load(html);
//   let found: unknown | null = null;

//   $('script').each((_, el) => {
//     if (found) return false;
//     const script = $(el).html() || '';

//     if (script.includes('__SW_APP_STATE__')) {
//       const match = script.match(/__SW_APP_STATE__\s*=\s*({[\s\S]+?});/);
//       if (match) {
//         const parsed = safeJsonParse(match[1]);
//         if (parsed) {
//           found = parsed;
//           return false;
//         }
//       }
//     }

//     if (script.includes('__NEXT_DATA__')) {
//       const match = script.match(/__NEXT_DATA__\s*=\s*({[\s\S]+?});/);
//       if (match) {
//         const parsed = safeJsonParse(match[1]);
//         if (parsed) {
//           found = parsed;
//           return false;
//         }
//       }
//     }
//   });

//   return found;
// }

// function walkObject(
//   value: unknown,
//   visitor: (key: string, val: unknown) => void,
// ) {
//   if (!value || typeof value !== 'object') return;
//   if (Array.isArray(value)) {
//     for (const item of value) walkObject(item, visitor);
//     return;
//   }
//   for (const [key, val] of Object.entries(value)) {
//     visitor(key, val);
//     walkObject(val, visitor);
//   }
// }

// function extractTrafficData(state: unknown): Partial<TrafficResult> {
//   const traffic: TrafficResult['traffic'] = {};
//   const engagement: TrafficResult['engagement'] = {};
//   const topCountries: CountryItem[] = [];
//   const topKeywords: KeywordItem[] = [];

//   walkObject(state, (key, val) => {
//     const lower = key.toLowerCase();

//     if (lower.includes('monthlyvisits') && typeof val === 'number') {
//       if (!traffic.monthlyVisits) traffic.monthlyVisits = val;
//     }

//     if (lower.includes('visits') && Array.isArray(val)) {
//       const series = val
//         .filter((item) => item && typeof item === 'object')
//         .map((item) => {
//           const typed = item as { date?: string; visits?: number; value?: number };
//           const visits = typeof typed.visits === 'number' ? typed.visits : typed.value;
//           if (!typed.date || typeof visits !== 'number') return null;
//           return { date: typed.date, visits };
//         })
//         .filter(Boolean) as Array<{ date: string; visits: number }>;
//       if (series.length > 0 && !traffic.visitsSeries) {
//         traffic.visitsSeries = series;
//       }
//     }

//     if (lower.includes('bouncerate') && typeof val === 'number') {
//       engagement.bounceRate = val;
//     }
//     if (lower.includes('pagespervisit') && typeof val === 'number') {
//       engagement.pagesPerVisit = val;
//     }
//     if (lower.includes('avgvisitduration') && typeof val === 'number') {
//       engagement.avgVisitDuration = val;
//     }

//     if (
//       lower.includes('topcountries') &&
//       Array.isArray(val) &&
//       topCountries.length === 0
//     ) {
//       for (const item of val) {
//         if (!item || typeof item !== 'object') continue;
//         const typed = item as { country?: string; countryName?: string; share?: number; value?: number };
//         const country = typed.countryName || typed.country;
//         const share = typeof typed.share === 'number' ? typed.share : typed.value;
//         if (country) {
//           topCountries.push({ country, share });
//         }
//       }
//     }

//     if (
//       lower.includes('topkeywords') &&
//       Array.isArray(val) &&
//       topKeywords.length === 0
//     ) {
//       for (const item of val) {
//         if (!item || typeof item !== 'object') continue;
//         const typed = item as { keyword?: string; share?: number; value?: number };
//         const keyword = typed.keyword;
//         const share = typeof typed.share === 'number' ? typed.share : typed.value;
//         if (keyword) {
//           topKeywords.push({ keyword, share });
//         }
//       }
//     }
//   });

//   const result: Partial<TrafficResult> = {};
//   if (traffic.monthlyVisits || traffic.visitsSeries) result.traffic = traffic;
//   if (
//     engagement.bounceRate ||
//     engagement.pagesPerVisit ||
//     engagement.avgVisitDuration
//   ) {
//     result.engagement = engagement;
//   }
//   if (topCountries.length > 0) result.topCountries = topCountries;
//   if (topKeywords.length > 0) result.topKeywords = topKeywords;

//   return result;
// }

// function extractTextFallback(html: string): Partial<TrafficResult> {
//   const $ = cheerio.load(html);
//   const text = $('body').text().replace(/\s+/g, ' ');
//   const result: Partial<TrafficResult> = {};

//   const monthlyMatch = text.match(/Monthly Visits\s*([\d,.]+[KMB]?)/i);
//   if (monthlyMatch) {
//     const raw = monthlyMatch[1];
//     const value = normalizeAbbrevNumber(raw);
//     if (value) {
//       result.traffic = { monthlyVisits: value };
//     }
//   }

//   return result;
// }

// function normalizeAbbrevNumber(input: string): number | undefined {
//   const trimmed = input.replace(/,/g, '').trim().toUpperCase();
//   const match = trimmed.match(/^([\d.]+)([KMB])?$/);
//   if (!match) return undefined;
//   const num = Number(match[1]);
//   if (Number.isNaN(num)) return undefined;
//   const suffix = match[2];
//   if (suffix === 'K') return Math.round(num * 1_000);
//   if (suffix === 'M') return Math.round(num * 1_000_000);
//   if (suffix === 'B') return Math.round(num * 1_000_000_000);
//   return Math.round(num);
// }

// export const domainTrafficTool = tool(
//   async ({ domain }) => {
//     const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
//     const url = `https://www.similarweb.com/website/${cleanDomain}/`;

//     try {
//       const response = await fetch(url, {
//         headers: {
//           'User-Agent': UA,
//           Accept:
//             'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
//           'Accept-Language': 'en-US,en;q=0.9',
//         },
//         signal: AbortSignal.timeout(20000),
//       });

//       if (!response.ok) {
//         return JSON.stringify({
//           error: true,
//           message: `HTTP ${response.status} ${response.statusText}`,
//         });
//       }

//       const html = await response.text();
//       const sources: TrafficResult['sources'] = [
//         { name: 'similarweb', url, method: 'html' },
//       ];

//       const state = extractJsonFromScripts(html);
//       let parsed: Partial<TrafficResult> = {};
//       if (state) {
//         parsed = extractTrafficData(state);
//       }

//       if (
//         !parsed.traffic &&
//         !parsed.engagement &&
//         !parsed.topCountries &&
//         !parsed.topKeywords
//       ) {
//         parsed = extractTextFallback(html);
//       }

//       const result: TrafficResult = {
//         domain: cleanDomain,
//         sources,
//         ...parsed,
//       };

//       if (
//         !result.traffic &&
//         !result.engagement &&
//         !result.topCountries &&
//         !result.topKeywords
//       ) {
//         result.note =
//           'No structured traffic data was found on the public page. Try again later or use another source.';
//       }

//       return JSON.stringify(result);
//     } catch (error) {
//       return JSON.stringify({
//         error: true,
//         message: error instanceof Error ? error.message : 'Unknown error occurred',
//       });
//     }
//   },
//   {
//     name: 'domain_traffic',
//     description:
//       'Fetches public traffic, engagement, and keyword signals for a domain without using Similarweb API keys. It scrapes public Similarweb pages and extracts available metrics.',
//     schema: z.object({
//       domain: z
//         .string()
//         .describe('Domain to analyze, e.g. "example.com" or "https://example.com"'),
//     }),
//   },
// );
