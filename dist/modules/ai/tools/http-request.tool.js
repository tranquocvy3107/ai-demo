"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.httpRequestTool = void 0;
const tools_1 = require("@langchain/core/tools");
const zod_1 = require("zod");
const MAX_BODY_LENGTH = 4000;
exports.httpRequestTool = (0, tools_1.tool)(async ({ url, method, headers, body }) => {
    try {
        console.log(`[HTTP] ${method} ${url}`);
        const reqHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            ...(headers ? JSON.parse(headers) : {}),
        };
        if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
            if (!reqHeaders['Content-Type']) {
                reqHeaders['Content-Type'] = 'application/json';
            }
        }
        const options = {
            method,
            headers: reqHeaders,
            signal: AbortSignal.timeout(15000),
            ...(body && ['POST', 'PUT', 'PATCH'].includes(method) ? { body } : {}),
        };
        const response = await fetch(url, options);
        const contentType = response.headers.get('content-type') || '';
        let responseBody;
        if (contentType.includes('application/json')) {
            const json = await response.json();
            responseBody = JSON.stringify(json, null, 2);
        }
        else {
            responseBody = await response.text();
        }
        if (responseBody.length > MAX_BODY_LENGTH) {
            responseBody =
                responseBody.substring(0, MAX_BODY_LENGTH) +
                    `\n...[TRUNCATED, total ${responseBody.length} chars]`;
        }
        return JSON.stringify({
            status: response.status,
            statusText: response.statusText,
            contentType,
            body: responseBody,
        });
    }
    catch (error) {
        return JSON.stringify({
            error: true,
            message: error instanceof Error ? error.message : 'Unknown error occurred',
        });
    }
}, {
    name: 'http_request',
    description: 'Makes an HTTP request to any URL. Use this to check if a domain is alive, call APIs, or fetch raw data. Supports GET, POST, PUT, DELETE methods.',
    schema: zod_1.z.object({
        url: zod_1.z.string().describe('The full URL to request, e.g. https://example.com'),
        method: zod_1.z
            .enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'])
            .default('GET')
            .describe('HTTP method'),
        headers: zod_1.z
            .string()
            .optional()
            .describe('Optional JSON string of additional headers'),
        body: zod_1.z
            .string()
            .optional()
            .describe('Optional request body (for POST/PUT/PATCH)'),
    }),
});
//# sourceMappingURL=http-request.tool.js.map