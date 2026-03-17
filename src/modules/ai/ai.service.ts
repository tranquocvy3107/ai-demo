import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatOllama } from '@langchain/ollama';
import { createResearchGraph } from './workflows/research.graph';
import { HumanMessage } from '@langchain/core/messages';
import { staticTools } from './tools';
import { createSaveDataTool } from './tools/save-data.tool';
import { createReadDataTool } from './tools/read-data.tool';
import { ResearchData } from './entities/research-data.entity';
import { RagService } from '../rag/rag.service';
type StreamEvent = {
  event: string;
  name: string;
  data: {
    input?: unknown;
    output?: unknown;
    chunk?: unknown;
  };
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private llm: ChatOllama;

  constructor(
    private configService: ConfigService,
    @InjectRepository(ResearchData)
    private researchDataRepo: Repository<ResearchData>,
    private ragService: RagService,
  ) {
    const baseUrl = this.configService.get<string>('ai.ollamaBaseUrl');

    // Initialize the base LLM
    this.llm = new ChatOllama({
      baseUrl,
      model: 'qwen2.5:7b',
      temperature: 0,
    });
  }

  // Standalone chat API
  async generateResponse(prompt: string): Promise<string> {
    const response = await this.llm.invoke(prompt);
    return response.content as string;
  }

  private getResearchApp() {
    const tools = this.getAllTools();
    return createResearchGraph(this.llm, { tools });
  }

  private extractChunkText(chunk: unknown): string {
    if (!chunk) return '';
    if (typeof chunk === 'string') return chunk;

    if (typeof chunk === 'object' && chunk !== null) {
      const typedChunk = chunk as { content?: unknown; text?: unknown };
      if (typeof typedChunk.content === 'string') return typedChunk.content;
      if (Array.isArray(typedChunk.content)) {
        return typedChunk.content
          .map((item) => {
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object') {
              const typedItem = item as { text?: unknown; content?: unknown };
              if (typeof typedItem.text === 'string') return typedItem.text;
              if (typeof typedItem.content === 'string') return typedItem.content;
            }
            return '';
          })
          .join('');
      }
      if (typeof typedChunk.text === 'string') return typedChunk.text;
    }

    return '';
  }

  private summarizeValue(value: unknown, maxLength = 300): string {
    if (value === null || value === undefined) return '';
    let text: string;
    if (typeof value === 'string') {
      text = value;
    } else {
      try {
        text = JSON.stringify(value);
      } catch {
        text = String(value);
      }
    }
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength)}...`;
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.round(ms / 100) / 10;
    return `${seconds}s`;
  }

  private logEvent(threadId: string, message: string) {
    this.logger.log(`[Research:${threadId}] ${message}`);
  }

  async *streamDomainResearch(
    threadId: string,
    domain: string,
    prompt: string,
    options?: { tokenMode?: 'chunk' | 'char'; signal?: AbortSignal },
  ): AsyncGenerator<
    { type: 'status'; data: Record<string, unknown> } |
    { type: 'tool'; data: Record<string, unknown> } |
    { type: 'token'; data: Record<string, unknown> } |
    { type: 'final'; data: Record<string, unknown> } |
    { type: 'error'; data: Record<string, unknown> }
  > {
    const tokenMode = options?.tokenMode ?? 'char';
    const startedAt = Date.now();
    this.logEvent(threadId, `Start research for ${domain}`);

    const ragContext = await this.ragService.getActiveContext();
    yield {
      type: 'status',
      data: {
        message: 'RAG context loaded',
        ragChars: ragContext.length,
      },
    };

    const researchApp = this.getResearchApp();

    const initialState = {
      messages: [new HumanMessage(prompt)],
      domain,
      goal: prompt,
      ragContext,
    };

    const toolStats: Record<string, number> = {};
    let finalAnswer = '';

    try {
      const eventStream = researchApp.streamEvents(
        initialState,
        {
          configurable: { thread_id: threadId },
          signal: options?.signal,
          version: 'v2',
        },
      );

      for await (const event of eventStream) {
        const streamEvent = event as StreamEvent;
        const eventName = streamEvent.event;

        if (eventName === 'on_tool_start') {
          const toolName = streamEvent.name || 'unknown';
          toolStats[toolName] = (toolStats[toolName] ?? 0) + 1;
          this.logEvent(threadId, `Tool start: ${toolName}`);
          yield {
            type: 'tool',
            data: {
              phase: 'start',
              tool: toolName,
              input: this.summarizeValue(streamEvent.data?.input),
            },
          };
          continue;
        }

        if (eventName === 'on_tool_end') {
          const toolName = streamEvent.name || 'unknown';
          this.logEvent(threadId, `Tool end: ${toolName}`);
          yield {
            type: 'tool',
            data: {
              phase: 'end',
              tool: toolName,
              output: this.summarizeValue(streamEvent.data?.output),
            },
          };
          continue;
        }

        if (eventName === 'on_chat_model_stream' || eventName === 'on_llm_stream') {
          const chunkText = this.extractChunkText(streamEvent.data?.chunk);
          if (!chunkText) continue;
          finalAnswer += chunkText;
          if (tokenMode === 'char') {
            for (const char of chunkText) {
              yield { type: 'token', data: { value: char } };
            }
          } else {
            yield { type: 'token', data: { value: chunkText } };
          }
          continue;
        }
      }

      const durationMs = Date.now() - startedAt;
      this.logEvent(threadId, `Completed in ${this.formatDuration(durationMs)}`);
      yield {
        type: 'final',
        data: {
          message: 'Research complete',
          threadId,
          durationMs,
          toolsUsed: Object.entries(toolStats).map(([tool, count]) => ({
            tool,
            count,
          })),
          answer: finalAnswer.trim(),
        },
      };
    } catch (error) {
      if (options?.signal?.aborted) {
        this.logEvent(threadId, 'Stream aborted by client');
        return;
      }
      const err = error as Error;
      this.logEvent(threadId, `Failed: ${err.message}`);
      yield { type: 'error', data: { message: err.message } };
    }
  }

  // Build the full tool list including dynamic (DB-backed) tools
  private getAllTools() {
    const saveDataTool = createSaveDataTool(this.researchDataRepo);
    const readDataTool = createReadDataTool(this.researchDataRepo);
    return [...staticTools, saveDataTool, readDataTool];
  }

  // Trigger the LangGraph domain research workflow
  async startDomainResearch(
    threadId: string,
    domain: string,
    prompt: string,
    options?: { verbose?: boolean },
  ) {
    const startedAt = Date.now();
    const verbose = options?.verbose ?? false;
    const events: Array<Record<string, unknown>> = [];
    let answer = '';
    let finalMeta: Record<string, unknown> = {};

    for await (const event of this.streamDomainResearch(
      threadId,
      domain,
      prompt,
      { tokenMode: 'chunk' },
    )) {
      if (event.type === 'token') {
        answer += String(event.data.value ?? '');
      } else if (event.type === 'final') {
        finalMeta = event.data;
      }

      if (verbose) {
        events.push(event);
      }
    }

    const durationMs = Date.now() - startedAt;

    return {
      message: 'Research complete',
      threadId,
      durationMs,
      answer: answer.trim(),
      toolsUsed: (finalMeta.toolsUsed as unknown) ?? [],
      ...(verbose ? { events } : {}),
    };
  }
}
