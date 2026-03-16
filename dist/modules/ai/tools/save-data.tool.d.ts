import { z } from 'zod';
import { Repository } from 'typeorm';
import { ResearchData } from '../entities/research-data.entity';
export declare function createSaveDataTool(repository: Repository<ResearchData>): import("@langchain/core/tools").DynamicStructuredTool<z.ZodObject<{
    domain: z.ZodString;
    category: z.ZodString;
    key: z.ZodString;
    value: z.ZodString;
}, "strip", z.ZodTypeAny, {
    key: string;
    domain: string;
    value: string;
    category: string;
}, {
    key: string;
    domain: string;
    value: string;
    category: string;
}>, {
    key: string;
    domain: string;
    value: string;
    category: string;
}, {
    key: string;
    domain: string;
    value: string;
    category: string;
}, string, unknown, "save_data">;
