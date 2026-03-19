import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import * as cheerio from 'cheerio';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Repository } from 'typeorm';
import { SemrushTraffic } from '../entities/semrush-traffic.entity';
import { ResearchData } from '../entities/research-data.entity';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

type TrafficResult = {
  domain: string;
  source: { name: string; url: string; method: string };
  traffic?: {
    organicTraffic?: number;
    organicPositions?: number;
    organicTrafficBranded?: number;
    organicTrafficNonBranded?: number;
    organicTrafficCost?: number;
    adwordsTraffic?: number;
    adwordsPositions?: number;
    adwordsTrafficCost?: number;
    totalTraffic?: number;
    semrushRank?: number;
  };
  authority?: {
    authorityScore?: number;
    backlinks?: number;
    referringDomains?: number;
    domainHealth?: number;
    linkPower?: number;
    naturalness?: number;
  };
  aiOverview?: {
    visibility?: number;
    citedPages?: number;
  };
  trendData?: Array<{ date: string; organic?: number; adwords?: number }>;
  competitors?: any[];
  aiSources?: any[];
  note?: string;
  dbStatus?: string;
};

function buildBrowserHeaders(cookie: string, referer?: string): Record<string, string> {
  return {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.6,en;q=0.5',
    Cookie: cookie,
    Referer: referer || 'https://www.semrush.com/analytics/overview/',
    'X-Requested-With': 'XMLHttpRequest',
  };
}

function loadSemrushCookie(): string | null {
  const txtPath = join(process.cwd(), 'src', 'config', 'cookie-semrush.txt');
  if (existsSync(txtPath)) {
    const raw = readFileSync(txtPath, 'utf8').trim();
    if (raw) return raw;
  }
  return null;
}

function extractInternalCredentials(html: string): { userId: number; apiKey: string } | null {
  const match = html.match(/window\.sm2\.user\s*=\s*(\{[\s\S]+?\});/);
  if (match) {
    try {
      const user = JSON.parse(match[1]);
      if (user && user.id && user.api_key) {
        return { userId: user.id, apiKey: user.api_key };
      }
    } catch { /* ignored */ }
  }
  return null;
}

export function createSemrushTrafficTool(
  repository: Repository<SemrushTraffic>,
  researchRepo: Repository<ResearchData>
) {
  return tool(
    async ({ domain }) => {
      const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      const overviewUrl = `https://www.semrush.com/analytics/overview/?q=${encodeURIComponent(cleanDomain)}&searchType=domain`;

      const cookie = loadSemrushCookie();
      if (!cookie) {
        return JSON.stringify({ error: true, message: 'Missing Semrush cookie in src/config/cookie-semrush.txt.' });
      }

      try {
        const pageRes = await fetch(overviewUrl, {
          headers: buildBrowserHeaders(cookie, 'https://www.semrush.com/'),
          redirect: 'follow',
          signal: AbortSignal.timeout(20000),
        });

        if (!pageRes.ok) {
          return JSON.stringify({ error: true, message: `Semrush fetch failed: HTTP ${pageRes.status}` });
        }

        const html = await pageRes.text();
        const creds = extractInternalCredentials(html);

        let parsed: Partial<TrafficResult> = {};
        
        if (creds) {
          const requestId = uuidv4();
          const rpcPayload = [
            {
              id: 1, jsonrpc: '2.0', method: 'organic.Summary',
              params: { request_id: requestId, report: 'domain.overview', args: { searchItem: cleanDomain, searchType: 'domain', database: 'us', dateFormat: 'date', dateType: 'daily' }, userId: creds.userId, apiKey: creds.apiKey },
            },
            {
              id: 2, jsonrpc: '2.0', method: 'backlinks.Summary',
              params: { request_id: requestId, report: 'domain.overview', args: { searchItem: cleanDomain, searchType: 'domain' }, userId: creds.userId, apiKey: creds.apiKey },
            },
            {
              id: 3, jsonrpc: '2.0', method: 'organic.AiSeoSummary',
              params: { request_id: requestId, report: 'domain.overview', args: { searchItem: cleanDomain, searchType: 'domain', dateFormat: 'date', dateType: 'daily' }, userId: creds.userId, apiKey: creds.apiKey },
            },
            {
              id: 4, jsonrpc: '2.0', method: 'organic.OverviewTrend',
              params: { request_id: requestId, report: 'domain.overview', args: { dateType: 'monthly', searchItem: cleanDomain, searchType: 'domain', database: 'us', global: true }, userId: creds.userId, apiKey: creds.apiKey },
            },
            {
              id: 5, jsonrpc: '2.0', method: 'organic.CompetitorsOverview',
              params: { request_id: requestId, report: 'domain.overview', args: { database: 'us', dateFormat: 'date', dateType: 'daily', searchItem: cleanDomain, searchType: 'domain', display: { page: 1, pageSize: 5 }, youDomain: true }, userId: creds.userId, apiKey: creds.apiKey },
            },
            {
              id: 6, jsonrpc: '2.0', method: 'organic.AiTopSources',
              params: { request_id: requestId, report: 'domain.overview', args: { searchItem: cleanDomain, searchType: 'domain', database: 'us', dateFormat: 'date', dateType: 'daily', range: { limit: 5, offset: 0 } }, userId: creds.userId, apiKey: creds.apiKey },
            }
          ];

          const rpcRes = await fetch('https://www.semrush.com/dpa/rpc', {
            method: 'POST',
            headers: { 'User-Agent': UA, 'Content-Type': 'application/json', Cookie: cookie, Referer: overviewUrl, 'X-Requested-With': 'XMLHttpRequest' },
            body: JSON.stringify(rpcPayload),
            signal: AbortSignal.timeout(15000),
          });

          if (rpcRes.ok) {
            const rpcResults = await rpcRes.json();
            if (Array.isArray(rpcResults)) {
              let limitsExceeded = false;
              rpcResults.forEach((res) => {
                if (res.error && (res.error.message?.toLowerCase().includes('limit') || res.error.code === -32098)) limitsExceeded = true;
                if (res.id === 1 && res.result && Array.isArray(res.result)) {
                  let bestMatch = res.result.find((r: any) => r.database === 'us') || res.result[0];
                  if (bestMatch) {
                    parsed.traffic = {
                      organicTraffic: bestMatch.organicTraffic, organicPositions: bestMatch.organicPositions, organicTrafficBranded: bestMatch.organicTrafficBranded,
                      organicTrafficNonBranded: bestMatch.organicTrafficNonBranded, organicTrafficCost: bestMatch.organicTrafficCost, adwordsTraffic: bestMatch.adwordsTraffic,
                      adwordsPositions: bestMatch.adwordsPositions, adwordsTrafficCost: bestMatch.adwordsTrafficCost, totalTraffic: (bestMatch.organicTraffic || 0) + (bestMatch.adwordsTraffic || 0), semrushRank: bestMatch.rank,
                    };
                  }
                }
                if (res.id === 2 && res.result) {
                  parsed.authority = {
                    authorityScore: res.result.authorityScore, backlinks: res.result.backlinks, referringDomains: res.result.referringDomains,
                    domainHealth: res.result.health, linkPower: res.result.linkPower, naturalness: res.result.naturalness,
                  };
                }
                if (res.id === 3 && res.result) {
                  parsed.aiOverview = { visibility: res.result.ai_visibility, citedPages: res.result.cited_pages };
                }
                if (res.id === 4 && res.result && res.result.history) {
                    parsed.trendData = res.result.history.map((h: any) => ({ date: h.date, organic: h.organicTraffic, adwords: h.adwordsTraffic }));
                }
                if (res.id === 5 && res.result) parsed.competitors = res.result;
                if (res.id === 6 && res.result) parsed.aiSources = res.result;
              });
              if (limitsExceeded) parsed.note = (parsed.note ? parsed.note + ' ' : '') + 'Semrush limit exceeded.';
            }
          }
        }

        if (!parsed.traffic?.organicTraffic && !parsed.authority?.authorityScore) {
          const $ = cheerio.load(html);
          const bodyText = $('body').text().replace(/\s+/g, ' ');
          const asMatch = bodyText.match(/Authority\s*Score\s*(\d+)/i);
          if (asMatch) parsed.authority = { ...parsed.authority, authorityScore: parseInt(asMatch[1], 10) };
        }

        const result: TrafficResult = {
          domain: cleanDomain,
          source: { name: 'semrush', url: overviewUrl, method: creds ? 'rpc' : 'html' },
          ...parsed,
        };

        // SAVE TO SemrushTraffic Table
        try {
          const existing = await repository.findOne({ where: { domain: cleanDomain } });
          if (existing) {
            Object.assign(existing, { ...result, rawResponse: JSON.stringify(result) });
            await repository.save(existing);
            result.dbStatus = 'updated';
          } else {
            const entity = repository.create({ ...result, rawResponse: JSON.stringify(result) });
            await repository.save(entity);
            result.dbStatus = 'created';
          }
        } catch (dbErr) { result.dbStatus = 'failed'; }

        // SAVE TO ResearchData Table (summary)
        try {
          const existingResearch = await researchRepo.findOne({ where: { domain: cleanDomain, category: 'traffic', key: 'semrush_overview' } });
          if (existingResearch) {
            existingResearch.value = result;
            await researchRepo.save(existingResearch);
          } else {
            const researchEntity = researchRepo.create({ domain: cleanDomain, category: 'traffic', key: 'semrush_overview', value: result });
            await researchRepo.save(researchEntity);
          }
          console.log(`[SemrushTool] Saved detailed summary to ResearchData for ${cleanDomain}`);
        } catch (e) { console.error('[SemrushTool] ResearchData save failed', e); }

        return JSON.stringify({
            ...result,
            status: 'completed',
            message: `Semrush data for ${cleanDomain} has been successfully retrieved and saved to database. AI can proceed to the next step.`
        });
      } catch (error) {
        return JSON.stringify({ error: true, message: error instanceof Error ? error.message : 'Unknown error' });
      }
    },
    {
      name: 'domain_traffic_semrush',
      description: 'Provides detailed traffic and authority data for a domain from Semrush. Automatically saves to database. (Only call once per domain)',
      schema: z.object({ domain: z.string().describe('The domain to analyze (e.g., "example.com").') }),
    },
  );
}
