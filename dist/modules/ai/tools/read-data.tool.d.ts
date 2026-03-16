import { z } from 'zod';
import { Repository } from 'typeorm';
import { ResearchData } from '../entities/research-data.entity';
export declare function createReadDataTool(repository: Repository<ResearchData>): import("@langchain/core/tools").DynamicStructuredTool<z.ZodObject<{
    domain: z.ZodOptional<z.ZodString>;
    category: z.ZodOptional<z.ZodString>;
    key: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    key?: string | undefined;
    domain?: string | undefined;
    category?: string | undefined;
}, {
    key?: string | undefined;
    domain?: string | undefined;
    category?: string | undefined;
}>, {
    key?: string | undefined;
    domain?: string | undefined;
    category?: string | undefined;
}, {
    key?: string | undefined;
    domain?: string | undefined;
    category?: string | undefined;
}, string, unknown, "read_data">;
