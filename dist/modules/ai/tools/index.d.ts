export * from './http-request.tool';
export * from './web-search.tool';
export * from './web-scraper.tool';
export * from './save-data.tool';
export * from './read-data.tool';
export declare const staticTools: (import("@langchain/core/tools").DynamicStructuredTool<import("zod").ZodObject<{
    url: import("zod").ZodString;
    method: import("zod").ZodDefault<import("zod").ZodEnum<["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"]>>;
    headers: import("zod").ZodOptional<import("zod").ZodString>;
    body: import("zod").ZodOptional<import("zod").ZodString>;
}, "strip", import("zod").ZodTypeAny, {
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
}, string, unknown, "http_request"> | import("@langchain/core/tools").DynamicStructuredTool<import("zod").ZodObject<{
    query: import("zod").ZodString;
    numResults: import("zod").ZodOptional<import("zod").ZodNumber>;
}, "strip", import("zod").ZodTypeAny, {
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
}, string, unknown, "web_search"> | import("@langchain/core/tools").DynamicStructuredTool<import("zod").ZodObject<{
    url: import("zod").ZodString;
    selector: import("zod").ZodOptional<import("zod").ZodString>;
    extractLinks: import("zod").ZodOptional<import("zod").ZodBoolean>;
}, "strip", import("zod").ZodTypeAny, {
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
}, string, unknown, "web_scraper">)[];
