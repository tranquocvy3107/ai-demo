import { tool } from '@langchain/core/tools';
import { Repository } from 'typeorm';
import { z } from 'zod';
import { ResearchData } from '../entities/research-data.entity';

/**
 * Factory function: creates read_data tool with injected repository.
 * Call this from ai.service.ts after getting the repository.
 */
export function createReadDataTool(repository: Repository<ResearchData>) {
  return tool(
    async ({ domain, category, key }) => {
      try {
        console.log(
          `[ReadData] Querying: domain=${domain || '*'}, category=${category || '*'}, key=${key || '*'}`,
        );

        const queryBuilder = repository.createQueryBuilder('rd');

        if (domain) {
          queryBuilder.andWhere('rd.domain = :domain', { domain });
        }
        if (category) {
          queryBuilder.andWhere('rd.category = :category', { category });
        }
        if (key) {
          queryBuilder.andWhere('rd.key = :key', { key });
        }

        queryBuilder.orderBy('rd.updatedAt', 'DESC').take(20);

        const results = await queryBuilder.getMany();

        if (results.length === 0) {
          return JSON.stringify({
            found: false,
            message: 'No data found matching the query.',
          });
        }

        return JSON.stringify({
          found: true,
          count: results.length,
          data: results.map((r) => ({
            domain: r.domain,
            category: r.category,
            key: r.key,
            value: r.value,
            updatedAt: r.updatedAt,
          })),
        });
      } catch (error) {
        return JSON.stringify({
          error: true,
          message:
            error instanceof Error
              ? error.message
              : 'Failed to read data',
        });
      }
    },
    {
      name: 'read_data',
      description:
        'Reads previously saved research data from the database. Query by domain, category, and/or key. Use this to check what data has already been collected for a domain or to retrieve past research results.',
      schema: z.object({
        domain: z
          .string()
          .optional()
          .describe('Filter by domain name, e.g. "example.com"'),
        category: z
          .string()
          .optional()
          .describe(
            'Filter by category, e.g. "affiliate_info", "pricing", "evaluation"',
          ),
        key: z
          .string()
          .optional()
          .describe('Filter by specific key, e.g. "commission_rate"'),
      }),
    },
  );
}
