import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AiService } from './ai.service';
import { v4 as uuidv4 } from 'uuid';

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
  ) {
    if (!domain || !prompt) {
      return { error: 'Domain and prompt are required' };
    }

    // Assign a unique thread ID to persist history over graph invocations
    const threadId = existingThreadId || uuidv4();

    // Typically, you might kick this off asynchronously or via a queue so as not to hang the HTTP request.
    // For demonstration, we await it.
    try {
      const resultSteps = await this.aiService.startDomainResearch(
        threadId,
        domain,
        prompt,
      );

      return {
        message: 'Research complete',
        threadId,
        stepsReceived: resultSteps.length,
        data: resultSteps,
      };
    } catch (e) {
      return { error: 'Research failed', details: e.message };
    }
  }
}
