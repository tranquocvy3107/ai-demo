import { z } from 'zod';
export declare const webScraperTool: import("@langchain/core/tools").DynamicStructuredTool<z.ZodObject<{
    url: z.ZodString;
    selector: z.ZodOptional<z.ZodString>;
    extractLinks: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    url: string;
    selector?: string | undefined;
    extractLinks?: boolean | undefined;
}, {
    url: string;
    selector?: string | undefined;
    extractLinks?: boolean | undefined;
}>, {
    url: string;
    selector?: string | undefined;
    extractLinks?: boolean | undefined;
}, {
    url: string;
    selector?: string | undefined;
    extractLinks?: boolean | undefined;
}, string, unknown, "web_scraper">;
