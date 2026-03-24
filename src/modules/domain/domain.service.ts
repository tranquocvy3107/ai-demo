import { Injectable } from '@nestjs/common';
import { ClassifiledDomain, InvestmentSignal } from './type/domain.type';

const domainsDData = [
  {
    domain: 'firecrawl.dev',
    homepageUrl: 'https://www.firecrawl.dev',
    pageType: 'landing',
    productType: 'digital',
    products: [
      {
        name: 'Firecrawl Pro Plan',
        price: '99.00',
        currency: 'USD',
        url: 'https://www.firecrawl.dev/pricing',
        trustScore: 95,
        trustReason: 'Official pricing page',
      },
    ],
    affiliateProgram: {
      found: true,
      signupUrl: 'https://www.firecrawl.dev/affiliate',
      commissionRate: '25%',
      commissionType: 'recurring',
      cookieDuration: '60 days',
      payoutMethod: 'Stripe, PayPal',
      trustScore: 88,
    },
    overallTrustScore: 92,
    exitReason: null,
  },
  {
    domain: 'webscraper.io',
    homepageUrl: 'https://webscraper.io',
    pageType: 'store',
    productType: 'digital',
    products: [
      {
        name: 'Cloud Scraper Browser Extension',
        price: '50.00',
        currency: 'USD',
        url: 'https://webscraper.io/pricing',
        trustScore: 98,
        trustReason: 'Long-standing industry tool',
      },
    ],
    affiliateProgram: {
      found: true,
      signupUrl: 'https://webscraper.io/affiliate-program',
      commissionRate: '20%',
      commissionType: 'one-time',
      cookieDuration: '30 days',
      payoutMethod: 'PayPal',
      trustScore: 90,
    },
    overallTrustScore: 95,
    exitReason: null,
  },
  {
    domain: 'browse.ai',
    homepageUrl: 'https://www.browse.ai',
    pageType: 'landing',
    productType: 'digital',
    products: [
      {
        name: 'Starter Plan',
        price: '19.00',
        currency: 'USD',
        url: 'https://www.browse.ai/pricing',
        trustScore: 92,
        trustReason: 'Modern UI and clear subscription paths',
      },
    ],
    affiliateProgram: {
      found: true,
      signupUrl: 'https://www.browse.ai/affiliates',
      commissionRate: '20%',
      commissionType: 'recurring',
      cookieDuration: '60 days',
      payoutMethod: 'Stripe',
      trustScore: 85,
    },
    overallTrustScore: 89,
    exitReason: null,
  },
];
const semrushData = {
  traffic: {
    totalTraffic: 27348,
    organicTraffic: 24333,
    organicTrafficBranded: 17414,
    organicTrafficNonBranded: 6919,
    organicTrafficCost: 105185,
    adwordsTraffic: 3015,
    adwordsTrafficCost: 13192,
  },
  authority: {
    authorityScore: 42,
    domainHealth: 44,
    backlinks: 71276,
    referringDomains: 4612,
  },
  aiSources: {
    sources: [
      { domain: 'medium.com', mentions_count: 165 },
      { domain: 'reddit.com', mentions_count: 128 },
      { domain: 'youtube.com', mentions_count: 149 },
    ],
  },
  marketContext: {
    competitionLvl: 1,
    topCompetitor: 'webscraper.io',
    competitorTrafficCost: 768163,
  },
};
@Injectable()
export class DomainService {
  constructor() {}
  private getDomains() {
    return domainsDData;
  }

  private getTrafficUrlData(url: string) {
    return semrushData;
  }
  classifyDomain(): ClassifiledDomain[] {
    const domains = this.getDomains();

    return domains.map((domainInfo) => {
      // 1. Lấy dữ liệu traffic tương ứng cho domain này
      const trafficInfo = this.getTrafficUrlData(domainInfo.domain);

      // 2. Tính toán các chỉ số phụ trợ (Helper Metrics)
      const organicTraffic = trafficInfo.traffic.organicTraffic;
      const nonBrandedTraffic = trafficInfo.traffic.organicTrafficNonBranded;
      const nonBrandedRatio = (nonBrandedTraffic / organicTraffic) * 100;

      const isRecurring =
        domainInfo.affiliateProgram.commissionType === 'recurring';
      const authorityScore = trafficInfo.authority.authorityScore;
      const competitionLvl = trafficInfo.marketContext.competitionLvl;

      // 3. Logic phân loại (Decision Matrix)
      let signal: InvestmentSignal = InvestmentSignal.WATCHLIST;
      let reason = 'Dữ liệu chưa đủ đột phá để xếp hạng cao.';

      if (authorityScore > 35 && nonBrandedRatio > 20 && isRecurring) {
        signal = InvestmentSignal.ALL_IN;
        reason =
          'Authority cao, ngách từ khóa mở (Non-branded > 20%), hoa hồng trọn đời.';
      } else if (competitionLvl > 0.8) {
        signal = InvestmentSignal.HIGH_BARRIER;
        reason =
          'Thị trường quá bão hòa, đối thủ lớn chiếm lĩnh hầu hết traffic.';
      } else if (organicTraffic < 1000) {
        signal = InvestmentSignal.AVOID;
        reason = 'Traffic quá thấp, không bõ công đầu tư SEO hay Ads.';
      }

      // 4. Trả về thực thể Intelligence cuối cùng
      return {
        domain: domainInfo.domain,
        homepageUrl: domainInfo.homepageUrl,
        estimatedMonthlyRevenue: trafficInfo.traffic.organicTrafficCost * 0.02, // Giả định CR 2%
        commissionPotential: {
          rate: domainInfo.affiliateProgram.commissionRate,
          type: domainInfo.affiliateProgram.commissionType,
          avgOrderValue: this.calculateAvgPrice(domainInfo.products),
        },
        authorityScore: authorityScore,
        competitionLevel: competitionLvl,
        isMarketSaturated: competitionLvl > 0.7,
        trafficHealth: {
          total: trafficInfo.traffic.totalTraffic,
          organicRatio:
            (organicTraffic / trafficInfo.traffic.totalTraffic) * 100,
          nonBrandedRatio: nonBrandedRatio,
          trafficValue: trafficInfo.traffic.organicTrafficCost,
        },
        socialMentions: {
          topPlatform: trafficInfo.aiSources.sources[0]?.domain || 'N/A',
          totalMentions: trafficInfo.aiSources.sources.reduce(
            (sum, s) => sum + s.mentions_count,
            0,
          ),
        },
        investmentSignal: signal,
        recommendationReason: reason,
      };
    });
  }

  private calculateAvgPrice(products: any[]): number {
    const prices = products
      .map((p) => parseFloat(p.price))
      .filter((p) => !isNaN(p));
    return prices.length > 0
      ? prices.reduce((a, b) => a + b, 0) / prices.length
      : 0;
  }
}
