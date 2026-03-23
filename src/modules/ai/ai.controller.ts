import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Req,
  Res,
  Get,
  Query,
} from '@nestjs/common';
import { AiService } from './ai.service';
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
      );

      return {
        ...result,
        threadId,
      };
    } catch (e) {
      return { error: 'Research failed', details: e.message };
    }
  }

  @Post('research-domain/stream')
  @HttpCode(HttpStatus.OK)
  async researchDomainStream(
    @Body('domain') domain: string,
    @Body('prompt') prompt: string,
    @Body('threadId') existingThreadId: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await this.handleResearchStream(domain, prompt, existingThreadId, req, res);
  }

  @Get('research-domain/stream')
  async researchDomainStreamGet(
    @Query('domain') domain: string,
    @Query('prompt') prompt: string,
    @Query('threadId') existingThreadId: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await this.handleResearchStream(domain, prompt, existingThreadId, req, res);
  }

  // ── Affiliate & Pricing Research (v2) ────────────────────────────────────

  @Post('affiliate-research')
  @HttpCode(HttpStatus.OK)
  async affiliateResearch(
    @Body('prompt') prompt: string,
    @Body('threadId') existingThreadId?: string,
    @Body('verbose') verbose?: boolean,
  ) {
    if (!prompt) return { error: 'Prompt is required' };

    const threadId = existingThreadId || uuidv4();
    try {
      const result = await this.aiService.startAffiliateResearch(
        threadId,
        prompt,
      );
      return { ...result, threadId };
    } catch (e) {
      return { error: 'Affiliate research failed', details: e.message };
    }
  }

  @Post('affiliate-research/stream')
  @HttpCode(HttpStatus.OK)
  async affiliateResearchStream(
    @Body('prompt') prompt: string,
    @Body('threadId') existingThreadId: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await this.handleAffiliateStream(prompt, existingThreadId, req, res);
  }

  @Get('affiliate-research/stream')
  async affiliateResearchStreamGet(
    @Query('prompt') prompt: string,
    @Query('threadId') existingThreadId: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await this.handleAffiliateStream(prompt, existingThreadId, req, res);
  }

  private async handleAffiliateStream(
    prompt: string,
    existingThreadId: string | undefined,
    req: Request,
    res: Response,
  ) {
    if (!prompt) {
      res.statusCode = HttpStatus.BAD_REQUEST;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Prompt is required' }));
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
      for await (const event of this.aiService.streamAffiliateResearch(
        threadId,
        prompt,
        { tokenMode: 'char', signal: abortController.signal },
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

  // ─────────────────────────────────────────────────────────────────────────

  private async handleResearchStream(
    domain: string,
    prompt: string,
    existingThreadId: string | undefined,
    req: Request,
    res: Response,
  ) {
    if (!domain || !prompt) {
      res
        .status(HttpStatus.BAD_REQUEST)
        .json({ error: 'Domain and prompt are required' });
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
        { tokenMode: 'char', signal: abortController.signal },
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
