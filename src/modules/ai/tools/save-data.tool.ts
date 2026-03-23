import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { Repository } from 'typeorm';
import { ResearchData } from '../entities/research-data.entity';

const DEBUG = process.env.DEBUG === 'true';
function log(...args: any[]) {
  if (DEBUG) console.log('[SaveData]', ...args);
}

/**
 * Factory function: creates save_data tool with injected repository.
 * Call this from ai.service.ts after getting the repository.
 */
export function createSaveDataTool(repository: Repository<ResearchData>) {
  return tool(
    async ({ domain, category, key, value }) => {
      try {
        log(`[FLOW] ► saving ${domain}/${category}/${key}`);

        // Upsert: update if same domain+category+key exists
        const existing = await repository.findOne({
          where: { domain, category, key },
        });

        let valueToSave: any;
        try {
          valueToSave = typeof value === 'string' ? JSON.parse(value) : value;
        } catch {
          valueToSave = { text: value };
        }

        if (existing) {
          existing.value = valueToSave;
          await repository.save(existing);
          log(`[FLOW] ✔ updated id=${existing.id}`);
          return JSON.stringify({
            success: true,
            action: 'updated',
            id: existing.id,
          });
        }

        const entity = repository.create({
          domain,
          category,
          key,
          value: valueToSave,
        });
        const saved = await repository.save(entity);
        log(`[FLOW] ✔ created id=${saved.id}`);

        return JSON.stringify({
          success: true,
          action: 'created',
          id: saved.id,
        });
      } catch (error) {
        return JSON.stringify({
          error: true,
          message:
            error instanceof Error ? error.message : 'Failed to save data',
        });
      }
    },
    {
      name: 'save_data',
      description:
        'Saves research data to the database for later retrieval. Use this to persist important findings like affiliate program details, pricing info, evaluation scores, etc. Data is organized by domain, category, and key.',
      schema: z.object({
        domain: z
          .string()
          .describe('The domain this data belongs to, e.g. "example.com"'),
        category: z
          .string()
          .describe(
            'Category of data, e.g. "affiliate_info", "pricing", "evaluation", "general"',
          ),
        key: z
          .string()
          .describe(
            'Specific key for this data, e.g. "commission_rate", "program_url", "terms"',
          ),
        value: z
          .string()
          .describe(
            'The data to save. Can be a JSON string or plain text.',
          ),
      }),
    },
  );
}
