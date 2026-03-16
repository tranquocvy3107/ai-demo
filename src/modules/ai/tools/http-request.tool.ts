import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const MAX_BODY_LENGTH = 4000;

export const httpRequestTool = tool(
  async ({ url, method, headers, body }) => {
    try {
      console.log(`[HTTP] ${method} ${url}`);

      const reqHeaders: Record<string, string> = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ...(headers ? JSON.parse(headers) : {}),
      };

      if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
        if (!reqHeaders['Content-Type']) {
          reqHeaders['Content-Type'] = 'application/json';
        }
      }

      const options: RequestInit = {
        method,
        headers: reqHeaders,
        signal: AbortSignal.timeout(15000),
        ...(body && ['POST', 'PUT', 'PATCH'].includes(method) ? { body } : {}),
      };

      const response = await fetch(url, options);
      const contentType = response.headers.get('content-type') || '';
      let responseBody: string;

      if (contentType.includes('application/json')) {
        const json = await response.json();
        responseBody = JSON.stringify(json, null, 2);
      } else {
        responseBody = await response.text();
      }

      // Truncate if too long for LLM context
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
    } catch (error) {
      return JSON.stringify({
        error: true,
        message:
          error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  },
  {
    name: 'http_request',
    description:
      'Makes an HTTP request to any URL. Use this to check if a domain is alive, call APIs, or fetch raw data. Supports GET, POST, PUT, DELETE methods.',
    schema: z.object({
      url: z.string().describe('The full URL to request, e.g. https://example.com'),
      method: z
        .enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'])
        .default('GET')
        .describe('HTTP method'),
      headers: z
        .string()
        .optional()
        .describe('Optional JSON string of additional headers'),
      body: z
        .string()
        .optional()
        .describe('Optional request body (for POST/PUT/PATCH)'),
    }),
  },
);
