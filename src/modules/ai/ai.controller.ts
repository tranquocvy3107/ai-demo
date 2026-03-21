import { Controller, Post, Body, HttpCode, HttpStatus, Req, Res, Get, Query } from '@nestjs/common';
import { AiService } from './ai.service';
import type { ThinkingMode } from './ai.service';
import { v4 as uuidv4 } from 'uuid';
import type { Request, Response } from 'express';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  async chat(@Body('prompt') prompt: string) {
    if (!prompt) return { error: 'Prompt is required' };

    const response = await this.aiService.generateResponse(prompt);
    return { response };
  }

  @Post('research-domain')
  @HttpCode(HttpStatus.ACCEPTED)
  async researchDomain(
    @Body('domain') domain: string,
    @Body('prompt') prompt: string,
    @Body('threadId') existingThreadId?: string,
    @Body('verbose') verbose?: boolean,
    @Body('tokenMode') tokenMode?: 'char' | 'word',
    @Body('thinkingMode') thinkingMode?: ThinkingMode,
    @Body('enableMemorySummary') enableMemorySummary?: boolean,
  ) {
    if (!domain || !prompt) {
      return { error: 'Domain and prompt are required' };
    }

    // Assign a unique thread ID to persist history over graph invocations
    const threadId = existingThreadId || uuidv4();

    // Typically, you might kick this off asynchronously or via a queue so as not to hang the HTTP request.
    // For demonstration, we await it.
    try {
      const result = await this.aiService.startDomainResearch(
        threadId,
        domain,
        prompt,
        {
          verbose: Boolean(verbose),
          tokenMode,
          includeThinking: thinkingMode || 'auto',
          enableMemorySummary,
        },
      );

      return {
        ...result,
        threadId,
      };
    } catch (e) {
      return { error: 'Research failed', details: e.message };
    }
  }

  @Post('tools/run')
  @HttpCode(HttpStatus.OK)
  async runTool(
    @Body('tool') tool: string,
    @Body('input') input: Record<string, unknown>,
  ) {
    if (!tool) return { error: 'Tool name is required' };
    try {
      const result = await this.aiService.runTool(tool, input || {});
      return result;
    } catch (e) {
      return { error: 'Tool run failed', details: e.message };
    }
  }

  @Post('research-domain/stream')
  @HttpCode(HttpStatus.OK)
  async researchDomainStream(
    @Body('domain') domain: string,
    @Body('prompt') prompt: string,
    @Body('threadId') existingThreadId: string | undefined,
    @Body('tokenMode') tokenMode: 'char' | 'word' | undefined,
    @Body('thinkingMode') thinkingMode: ThinkingMode | undefined,
    @Body('enableMemorySummary') enableMemorySummary: boolean | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await this.handleResearchStream(
      domain,
      prompt,
      existingThreadId,
      tokenMode,
      thinkingMode,
      enableMemorySummary,
      req,
      res,
    );
  }

  @Get('research-domain/stream')
  async researchDomainStreamGet(
    @Query('domain') domain: string,
    @Query('prompt') prompt: string,
    @Query('threadId') existingThreadId: string | undefined,
    @Query('tokenMode') tokenMode: 'char' | 'word' | undefined,
    @Query('thinkingMode') thinkingMode: ThinkingMode | undefined,
    @Query('enableMemorySummary') enableMemorySummary: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const memoryFlag =
      enableMemorySummary === undefined ? undefined : enableMemorySummary === 'true';
    await this.handleResearchStream(
      domain,
      prompt,
      existingThreadId,
      tokenMode,
      thinkingMode,
      memoryFlag,
      req,
      res,
    );
  }

  private async handleResearchStream(
    domain: string,
    prompt: string,
    existingThreadId: string | undefined,
    tokenMode: 'char' | 'word' | undefined,
    thinkingMode: ThinkingMode | undefined,
    enableMemorySummary: boolean | undefined,
    req: Request,
    res: Response,
  ) {
    if (!domain || !prompt) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'Domain and prompt are required' });
      return;
    }

    const threadId = existingThreadId || uuidv4();
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const abortController = new AbortController();
    let isClosed = false;

    req.on('close', () => {
      isClosed = true;
      abortController.abort();
    });

    const writeEvent = (event: string, data: Record<string, unknown>) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    writeEvent('status', { message: 'Stream connected', threadId });

    try {
      for await (const event of this.aiService.streamDomainResearch(
        threadId,
        domain,
        prompt,
        {
          tokenMode: tokenMode || 'word',
          includeThinking: thinkingMode || 'auto',
          enableMemorySummary,
          signal: abortController.signal,
        },
      )) {
        if (isClosed) break;
        writeEvent(event.type, event.data);
      }
    } catch (error) {
      const err = error as Error;
      writeEvent('error', { message: err.message });
    } finally {
      res.end();
    }
  }
}
