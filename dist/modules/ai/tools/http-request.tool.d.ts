import { z } from 'zod';
export declare const httpRequestTool: import("@langchain/core/tools").DynamicStructuredTool<z.ZodObject<{
    url: z.ZodString;
    method: z.ZodDefault<z.ZodEnum<["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"]>>;
    headers: z.ZodOptional<z.ZodString>;
    body: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    url: string;
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD";
    headers?: string | undefined;
    body?: string | undefined;
}, {
    url: string;
    method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | undefined;
    headers?: string | undefined;
    body?: string | undefined;
}>, {
    url: string;
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD";
    headers?: string | undefined;
    body?: string | undefined;
}, {
    url: string;
    method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | undefined;
    headers?: string | undefined;
    body?: string | undefined;
}, string, unknown, "http_request">;
