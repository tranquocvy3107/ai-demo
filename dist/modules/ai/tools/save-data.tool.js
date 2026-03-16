"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSaveDataTool = createSaveDataTool;
const tools_1 = require("@langchain/core/tools");
const zod_1 = require("zod");
function createSaveDataTool(repository) {
    return (0, tools_1.tool)(async ({ domain, category, key, value }) => {
        try {
            console.log(`[SaveData] Saving: ${domain}/${category}/${key}`);
            const existing = await repository.findOne({
                where: { domain, category, key },
            });
            let valueToSave;
            try {
                valueToSave = typeof value === 'string' ? JSON.parse(value) : value;
            }
            catch {
                valueToSave = { text: value };
            }
            if (existing) {
                existing.value = valueToSave;
                await repository.save(existing);
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
            return JSON.stringify({
                success: true,
                action: 'created',
                id: saved.id,
            });
        }
        catch (error) {
            return JSON.stringify({
                error: true,
                message: error instanceof Error ? error.message : 'Failed to save data',
            });
        }
    }, {
        name: 'save_data',
        description: 'Saves research data to the database for later retrieval. Use this to persist important findings like affiliate program details, pricing info, evaluation scores, etc. Data is organized by domain, category, and key.',
        schema: zod_1.z.object({
            domain: zod_1.z
                .string()
                .describe('The domain this data belongs to, e.g. "example.com"'),
            category: zod_1.z
                .string()
                .describe('Category of data, e.g. "affiliate_info", "pricing", "evaluation", "general"'),
            key: zod_1.z
                .string()
                .describe('Specific key for this data, e.g. "commission_rate", "program_url", "terms"'),
            value: zod_1.z
                .string()
                .describe('The data to save. Can be a JSON string or plain text.'),
        }),
    });
}
//# sourceMappingURL=save-data.tool.js.map