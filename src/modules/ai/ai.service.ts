import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatOllama } from '@langchain/ollama';
import { createResearchGraph } from './workflows/research.graph';
import { createAffiliateGraph } from './workflows/affiliate.graph';
import { HumanMessage } from '@langchain/core/messages';
import { staticTools } from './tools';
import { createSaveDataTool } from './tools/save-data.tool';
import { createReadDataTool } from './tools/read-data.tool';
import { webSearchDDGTool } from './tools/web-search-ddg.tool';
import { webScraperTool } from './tools/web-scraper.tool';
import { parseHtmlToStructuredTool } from './tools/html-to-rsm-json.tool';
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

    this.llm = new ChatOllama({
      baseUrl,
      model: 'qwen2.5:7b',
      temperature: 0,
      numCtx: 8000,
    });
  }

  private formatThinking(text: string) {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n  ');
  }
  // =========================================================
  // BASIC API
  // =========================================================

  async generateResponse(prompt: string): Promise<string> {
    const res = await this.llm.invoke(prompt);
    return res.content as string;
  }

  // =========================================================
  // GRAPH BUILDERS
  // =========================================================

  private getResearchApp() {
    console.log('');
    return createResearchGraph(this.llm, {
      tools: this.getAllTools(),
    });
  }

  private getAffiliateApp() {
    const save = createSaveDataTool(this.researchDataRepo);
    const read = createReadDataTool(this.researchDataRepo);

    return createAffiliateGraph(this.llm, {
      tools: [
        webSearchDDGTool,
        webScraperTool,
        parseHtmlToStructuredTool,
        save,
        read,
      ],
    });
  }

  private getAllTools() {
    const save = createSaveDataTool(this.researchDataRepo);
    const read = createReadDataTool(this.researchDataRepo);
    return [...staticTools, save, read];
  }

  // =========================================================
  // STREAM CORE (REUSABLE)
  // =========================================================

  private formatDuration(ms: number) {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }
  private async *handleStream({
    threadId,
    app,
    initialState,
    label,
    options,
  }: {
    threadId: string;
    app: any;
    initialState: any;
    label: string;
    options?: { tokenMode?: 'chunk' | 'char'; signal?: AbortSignal };
  }) {
    const tokenMode = options?.tokenMode ?? 'char';
    const startedAt = Date.now();

    this.log(threadId, `[${label}] Start`);

    const toolStats: Record<string, number> = {};
    let finalAnswer = '';

    // 🧠 buffer để bắt THINKING
    let thinkingBuffer = '';

    try {
      const stream = app.streamEvents(initialState, {
        configurable: { thread_id: threadId },
        signal: options?.signal,
        version: 'v2',
      });

      for await (const event of stream) {
        const e = event as StreamEvent;

        // ===== TOOL START =====
        if (e.event === 'on_tool_start') {
          const name = e.name || 'unknown';
          toolStats[name] = (toolStats[name] ?? 0) + 1;

          this.log(threadId, `🛠️ Tool start: ${name}`);

          yield {
            type: 'tool',
            data: {
              phase: 'start',
              tool: name,
              input: this.summarize(e.data?.input),
            },
          };
          continue;
        }

        // ===== TOOL END =====
        if (e.event === 'on_tool_end') {
          this.log(threadId, `✅ Tool end: ${e.name}`);

          yield {
            type: 'tool',
            data: {
              phase: 'end',
              tool: e.name || 'unknown',
              output: this.summarize(e.data?.output),
            },
          };
          continue;
        }

        // ===== TOKEN STREAM =====
        if (e.event === 'on_chat_model_stream' || e.event === 'on_llm_stream') {
          const text = this.extractChunk(e.data?.chunk);
          if (!text) continue;

          finalAnswer += text;

          // ================================
          // 🧠 CAPTURE THINKING BLOCK
          // ================================
          thinkingBuffer += text;

          if (thinkingBuffer.includes('[THINKING]')) {
            const parts = thinkingBuffer.split('[THINKING]');
            thinkingBuffer = parts.pop() || '';

            for (const block of parts) {
              const cleaned = block.trim();
              if (!cleaned) continue;

              const formatted = this.formatThinking(cleaned);

              this.log(threadId, `🧠 THINKING:\n${formatted}`);

              yield {
                type: 'thinking',
                data: { text: formatted },
              };
            }
          }

          // ===== NORMAL TOKEN =====
          if (tokenMode === 'char') {
            for (const c of text) {
              yield { type: 'token', data: { value: c } };
            }
          } else {
            yield { type: 'token', data: { value: text } };
          }
        }
      }

      const durationMs = Date.now() - startedAt;

      this.log(
        threadId,
        `[${label}] Done in ${this.formatDuration(durationMs)}`,
      );

      yield {
        type: 'final',
        data: {
          message: `${label} complete`,
          threadId,
          durationMs,
          toolsUsed: Object.entries(toolStats).map(([tool, count]) => ({
            tool,
            count,
          })),
          answer: finalAnswer.trim(),
        },
      };
    } catch (err) {
      if (options?.signal?.aborted) {
        this.log(threadId, `[${label}] Aborted`);
        return;
      }

      this.log(threadId, `[${label}] Error: ${(err as Error).message}`);

      yield {
        type: 'error',
        data: { message: (err as Error).message },
      };
    }
  }

  // =========================================================
  // DOMAIN STREAM
  // =========================================================

  async *streamDomainResearch(
    threadId: string,
    domain: string,
    prompt: string,
    options?: { tokenMode?: 'chunk' | 'char'; signal?: AbortSignal },
  ) {
    const rag = await this.ragService.getActiveContext();

    yield {
      type: 'status',
      data: { message: 'RAG loaded', ragChars: rag.length },
    };

    const app = this.getResearchApp();

    yield* this.handleStream({
      threadId,
      app,
      label: 'Research',
      options,
      initialState: {
        messages: [new HumanMessage(prompt)],
        domain,
        goal: prompt,
        ragContext: rag,
      },
    });
  }

  // =========================================================
  // AFFILIATE STREAM
  // =========================================================

  async *streamAffiliateResearch(
    threadId: string,
    prompt: string,
    options?: { tokenMode?: 'chunk' | 'char'; signal?: AbortSignal },
  ) {
    const rag = await this.ragService.getActiveContext();
    console.log('steeam affeliate rr');
    yield {
      type: 'status',
      data: { message: 'RAG loaded', ragChars: rag.length },
    };

    const app = this.getAffiliateApp();

    yield* this.handleStream({
      threadId,
      app,
      label: 'Affiliate',
      options,
      initialState: {
        messages: [new HumanMessage(prompt)],
        goal: prompt,
        ragContext: rag,
      },
    });
  }

  // =========================================================
  // WRAPPERS (NON-STREAM)
  // =========================================================

  async startAffiliateResearch(threadId: string, prompt: string) {
    console.log('start testing affeliate ');
    return this.collectStream(
      this.streamAffiliateResearch(threadId, prompt, { tokenMode: 'chunk' }),
    );
  }

  async startDomainResearch(threadId: string, domain: string, prompt: string) {
    return this.collectStream(
      this.streamDomainResearch(threadId, domain, prompt, {
        tokenMode: 'chunk',
      }),
    );
  }

  private async collectStream(stream: AsyncGenerator<any>) {
    const startedAt = Date.now();
    let answer = '';
    let meta: any = {};

    for await (const e of stream) {
      if (e.type === 'token') answer += e.data.value;
      if (e.type === 'final') meta = e.data;
    }

    return {
      message: meta.message,
      threadId: meta.threadId,
      durationMs: Date.now() - startedAt,
      answer: answer.trim(),
      toolsUsed: meta.toolsUsed ?? [],
    };
  }

  // =========================================================
  // UTILS
  // =========================================================

  private log(threadId: string, msg: string) {
    this.logger.log(`[${threadId}] ${msg}`);
  }

  private extractChunk(chunk: unknown): string {
    if (!chunk) return '';
    if (typeof chunk === 'string') return chunk;

    if (typeof chunk === 'object') {
      const c = chunk as any;
      if (typeof c.content === 'string') return c.content;
      if (typeof c.text === 'string') return c.text;
      if (Array.isArray(c.content)) {
        return c.content.map((x: any) => x?.text || x?.content || '').join('');
      }
    }
    return '';
  }

  private summarize(value: unknown, max = 300) {
    if (!value) return '';
    let text =
      typeof value === 'string' ? value : (JSON.stringify(value) ?? '');
    return text.length > max ? text.slice(0, max) + '...' : text;
  }
}
