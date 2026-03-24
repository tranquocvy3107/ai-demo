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
import { webSearchGGTool } from './tools/web-search-gg.tool';
import { webScraperTool } from './tools/web-scraper.tool';
import { parseHtmlFromFileTool } from './tools/html-to-rsm-json.tool';
import { ResearchData } from './entities/research-data.entity';
import { RagService } from '../rag/rag.service';

type StreamEvent = {
  event: string;
  name: string;
  data: { input?: unknown; output?: unknown; chunk?: unknown };
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private llm: ChatOllama;

  // Compiled once — MemorySaver lives here so threadId memory persists across requests
  private affiliateApp: ReturnType<typeof createAffiliateGraph>;

  constructor(
    private configService: ConfigService,
    @InjectRepository(ResearchData)
    private researchDataRepo: Repository<ResearchData>,
    private ragService: RagService,
  ) {
    const baseUrl = this.configService.get<string>('ai.ollamaBaseUrl');
    const start = Date.now();

    try {
      console.log('🚀 BEFORE LLM');
      // numCtx 32768: system prompt alone is ~3500 chars; 8000 overflows by turn 2
      this.llm = new ChatOllama({
        baseUrl,
        model: 'qwen2.5:7b',
        temperature: 0,
        numCtx: 32768,
        keepAlive: '10s',
      });
      console.log('✅   AFTER LLM', Date.now() - start);
    } catch (err) {
      console.error('❌ LLM ERROR AFTER', Date.now() - start);
      throw err;
    }
    // Build affiliate graph once — reuse across all requests
    const save = createSaveDataTool(this.researchDataRepo);
    const read = createReadDataTool(this.researchDataRepo);
    this.affiliateApp = createAffiliateGraph(this.llm, {
      tools: [
        webSearchGGTool,
        webScraperTool,
        parseHtmlFromFileTool,
        save,
        read,
      ],
    });

    this.logger.log('AiService ready — affiliateApp compiled, LLM connected');
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
    return createResearchGraph(this.llm, { tools: this.getAllTools() });
  }

  private getAllTools() {
    const save = createSaveDataTool(this.researchDataRepo);
    const read = createReadDataTool(this.researchDataRepo);
    return [...staticTools, save, read];
  }

  // =========================================================
  // STREAM CORE
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
    const toolStats: Record<string, number> = {};

    // rawAnswer accumulates every token the LLM produces, including [THINKING] blocks.
    // At the end we split by [THINKING] and take the last segment as the true answer.
    let rawAnswer = '';

    // thinkingBuffer accumulates the current chunk window so we can detect
    // [THINKING] markers that may span multiple chunks.
    let thinkingBuffer = '';

    this.logger.log(
      `[${threadId}] ── ${label} START ─────────────────────────`,
    );

    try {
      const stream = app.streamEvents(initialState, {
        configurable: { thread_id: threadId },
        signal: options?.signal,
        version: 'v2',
      });

      for await (const event of stream) {
        const e = event as StreamEvent;

        // ── TOOL START ───────────────────────────────────────────────────
        if (e.event === 'on_tool_start') {
          const name = e.name || 'unknown';
          toolStats[name] = (toolStats[name] ?? 0) + 1;

          this.logger.log(
            `[${threadId}] 🛠  TOOL_START  name="${name}"  call#${toolStats[name]}`,
          );
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

        // ── TOOL END ─────────────────────────────────────────────────────
        if (e.event === 'on_tool_end') {
          const output = e.data?.output;

          try {
            const parsed =
              typeof output === 'string' ? JSON.parse(output) : output;
            if (parsed?.success === false) {
              // Tool returned a soft failure — LLM sees this error and may retry or stop
              this.logger.warn(
                `[${threadId}] ⚠  TOOL_FAIL   name="${e.name}"  reason="${parsed.message ?? parsed.error ?? 'unknown'}"`,
              );
            } else {
              this.logger.log(`[${threadId}] ✔  TOOL_END    name="${e.name}"`);
            }
          } catch {
            this.logger.log(`[${threadId}] ✔  TOOL_END    name="${e.name}"`);
          }

          yield {
            type: 'tool',
            data: {
              phase: 'end',
              tool: e.name || 'unknown',
              output: this.summarize(output),
            },
          };
          continue;
        }

        // ── TOKEN STREAM ─────────────────────────────────────────────────
        if (e.event === 'on_chat_model_stream' || e.event === 'on_llm_stream') {
          const text = this.extractChunk(e.data?.chunk);
          if (!text) continue;

          rawAnswer += text;
          thinkingBuffer += text;

          // Detect [THINKING] markers that may arrive across chunk boundaries.
          // Each [THINKING] toggles between thinking mode and answer mode.
          // We yield thinking blocks as separate events so clients can display them.
          if (thinkingBuffer.includes('[THINKING]')) {
            const parts = thinkingBuffer.split('[THINKING]');
            thinkingBuffer = parts.pop() || ''; // keep remainder after last marker

            for (const block of parts) {
              const trimmed = block.trim();
              if (!trimmed) continue;
              const formatted = this.formatThinking(trimmed);
              this.logger.debug(`[${threadId}] 🧠 THINKING:\n  ${formatted}`);
              yield { type: 'thinking', data: { text: formatted } };
            }
          }

          // Yield token to the client regardless of thinking state —
          // the client can filter thinking events itself if needed
          if (tokenMode === 'char') {
            for (const c of text) {
              yield { type: 'token', data: { value: c } };
            }
          } else {
            yield { type: 'token', data: { value: text } };
          }
        }
      }

      // Fix #3: flush remaining thinkingBuffer content after stream ends.
      // This handles the case where the stream ended without a closing [THINKING] marker.
      if (thinkingBuffer.trim()) {
        const formatted = this.formatThinking(thinkingBuffer.trim());
        this.logger.debug(
          `[${threadId}] 🧠 THINKING (flushed):\n  ${formatted}`,
        );
        yield { type: 'thinking', data: { text: formatted } };
      }

      // Fix #2: strip [THINKING] blocks from the final answer.
      // Split by [THINKING] and take the last segment — that is always the true JSON output.
      const answerParts = rawAnswer.split('[THINKING]');
      const trueAnswer = answerParts[answerParts.length - 1].trim();

      const durationMs = Date.now() - startedAt;
      const toolList = Object.entries(toolStats).map(([tool, count]) => ({
        tool,
        count,
      }));

      this.logger.log(
        `[${threadId}] ── ${label} END   duration=${this.formatDuration(durationMs)}  tools=[${toolList.map((t) => `${t.tool}×${t.count}`).join(', ') || 'none'}]`,
      );

      // Read typed AffiliateResult that the finalize node stored in graph state
      let structuredResult: unknown = null;
      try {
        const finalState = await app.getState({
          configurable: { thread_id: threadId },
        });
        structuredResult = finalState?.values?.result ?? null;

        if (structuredResult) {
          this.logger.log(
            `[${threadId}] ✔  RESULT parsed  domain="${(structuredResult as any).domain}"  trustScore=${(structuredResult as any).overallTrustScore}`,
          );
        } else {
          this.logger.warn(
            `[${threadId}] ⚠  RESULT is null — LLM may not have produced valid JSON`,
          );
        }
      } catch {
        this.logger.warn(
          `[${threadId}] ⚠  getState failed — structured result unavailable`,
        );
      }

      yield {
        type: 'final',
        data: {
          message: `${label} complete`,
          threadId,
          durationMs,
          toolsUsed: toolList,
          answer: trueAnswer,
          result: structuredResult,
        },
      };
    } catch (err) {
      if (options?.signal?.aborted) {
        this.logger.log(`[${threadId}] ── ${label} ABORTED by client`);
        return;
      }
      this.logger.error(
        `[${threadId}] ── ${label} ERROR: ${(err as Error).message}`,
      );
      yield { type: 'error', data: { message: (err as Error).message } };
    }
  }

  // =========================================================
  // AFFILIATE STREAM
  // =========================================================

  async *streamAffiliateResearch(
    threadId: string,
    prompt: string,
    options?: { tokenMode?: 'chunk' | 'char'; signal?: AbortSignal },
  ) {
    this.logger.log(
      `[${threadId}] affiliateResearch  prompt="${prompt.slice(0, 80)}"`,
    );

    const rag = await this.ragService.getActiveContext();

    yield {
      type: 'status',
      data: { message: 'RAG loaded', ragChars: rag.length },
    };

    yield* this.handleStream({
      threadId,
      app: this.affiliateApp,
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
  // DOMAIN STREAM
  // =========================================================

  async *streamDomainResearch(
    threadId: string,
    domain: string,
    prompt: string,
    options?: { tokenMode?: 'chunk' | 'char'; signal?: AbortSignal },
  ) {
    this.logger.log(
      `[${threadId}] domainResearch  domain="${domain}"  prompt="${prompt.slice(0, 80)}"`,
    );

    const rag = await this.ragService.getActiveContext();
    this.logger.log(`[${threadId}] RAG loaded  chars=${rag.length}`);

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
  // NON-STREAM WRAPPERS
  // =========================================================

  async startAffiliateResearch(threadId: string, prompt: string) {
    this.logger.log(`[${threadId}] startAffiliateResearch (blocking)`);
    return this.collectStream(
      this.streamAffiliateResearch(threadId, prompt, { tokenMode: 'chunk' }),
    );
  }

  async startDomainResearch(threadId: string, domain: string, prompt: string) {
    this.logger.log(
      `[${threadId}] startDomainResearch (blocking)  domain="${domain}"`,
    );
    return this.collectStream(
      this.streamDomainResearch(threadId, domain, prompt, {
        tokenMode: 'chunk',
      }),
    );
  }

  // Drains an event stream into a plain object for the REST endpoint
  private async collectStream(stream: AsyncGenerator<any>) {
    let answer = '';
    let meta: any = {};

    for await (const e of stream) {
      if (e.type === 'token') answer += e.data.value;
      if (e.type === 'final') meta = e.data;
    }

    return {
      message: meta.message,
      threadId: meta.threadId,
      durationMs: meta.durationMs,
      answer: answer.trim(),
      toolsUsed: meta.toolsUsed ?? [],
      result: meta.result ?? null, // typed AffiliateResult from finalize node
    };
  }

  // =========================================================
  // UTILS
  // =========================================================

  private formatThinking(text: string) {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n  ');
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
    const text =
      typeof value === 'string' ? value : (JSON.stringify(value) ?? '');
    return text.length > max ? text.slice(0, max) + '...' : text;
  }
}
