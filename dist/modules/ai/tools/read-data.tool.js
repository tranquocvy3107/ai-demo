"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createReadDataTool = createReadDataTool;
const tools_1 = require("@langchain/core/tools");
const zod_1 = require("zod");
function createReadDataTool(repository) {
    return (0, tools_1.tool)(async ({ domain, category, key }) => {
        try {
            console.log(`[ReadData] Querying: domain=${domain || '*'}, category=${category || '*'}, key=${key || '*'}`);
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
        }
        catch (error) {
            return JSON.stringify({
                error: true,
                message: error instanceof Error
                    ? error.message
                    : 'Failed to read data',
            });
        }
    }, {
        name: 'read_data',
        description: 'Reads previously saved research data from the database. Query by domain, category, and/or key. Use this to check what data has already been collected for a domain or to retrieve past research results.',
        schema: zod_1.z.object({
            domain: zod_1.z
                .string()
                .optional()
                .describe('Filter by domain name, e.g. "example.com"'),
            category: zod_1.z
                .string()
                .optional()
                .describe('Filter by category, e.g. "affiliate_info", "pricing", "evaluation"'),
            key: zod_1.z
                .string()
                .optional()
                .describe('Filter by specific key, e.g. "commission_rate"'),
        }),
    });
}
//# sourceMappingURL=read-data.tool.js.map