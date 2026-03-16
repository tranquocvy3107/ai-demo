import { z } from 'zod';
export declare const webSearchTool: import("@langchain/core/tools").DynamicStructuredTool<z.ZodObject<{
    query: z.ZodString;
    numResults: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    query: string;
    numResults?: number | undefined;
}, {
    query: string;
    numResults?: number | undefined;
}>, {
    query: string;
    numResults?: number | undefined;
}, {
    query: string;
    numResults?: number | undefined;
}, string, unknown, "web_search">;
