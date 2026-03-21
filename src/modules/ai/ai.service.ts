import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ChatOpenAI } from '@langchain/openai';
import { createResearchGraph } from './workflows/research.graph';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { staticTools } from './tools';
import { createSaveDataTool } from './tools/save-data.tool';
import { createReadDataTool } from './tools/read-data.tool';
import { createSemrushTrafficTool } from './tools/semrush-traffic.tool';
import { buildSystemPrompt } from './agents/prompts';
import { ResearchData } from './entities/research-data.entity';
import { SemrushTraffic } from './entities/semrush-traffic.entity';
import { AgentMemory } from './entities/agent-memory.entity';
import { RagService } from '../rag/rag.service';
import { v4 as uuidv4 } from 'uuid';

export type ResearchEvent = {
  type:
    | 'thinking'
    | 'thought'
    | 'tool_start'
    | 'tool_end'
    | 'final_answer'
    | 'error'
    | 'status';
  data: any;
  threadId?: string;
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly llm: ChatOpenAI;

  constructor(
    private readonly configService: ConfigService,
    private readonly ragService: RagService,
    @InjectRepository(ResearchData)
    private readonly researchDataRepo: Repository<ResearchData>,
    @InjectRepository(SemrushTraffic)
    private readonly semrushTrafficRepo: Repository<SemrushTraffic>,
    @InjectRepository(AgentMemory)
    private readonly agentMemoryRepo: Repository<AgentMemory>,
  ) {
    this.llm = new ChatOpenAI({
      configuration: {
        baseURL: this.configService.get<string>('ai.ollamaBaseUrl'),
      },
      modelName: this.configService.get<string>('ai.modelName'),
      temperature: 0,
      apiKey: 'ollama', // Placeholder for local server
    });
  }

  async generateResponse(prompt: string): Promise<string> {
    const response = await this.llm.invoke([new HumanMessage(prompt)]);
    return typeof response.content === 'string'
      ? this.stripThinking(response.content)
      : JSON.stringify(response.content);
  }

  async startDomainResearch(threadId: string, domain: string, prompt: string, options?: { verbose?: boolean }) {
    const events: ResearchEvent[] = [];
    for await (const event of this.streamDomainResearch(threadId, domain, prompt)) {
      events.push(event);
    }
    const finalAnswer = events.find(e => e.type === 'final_answer')?.data?.content || '';
    return { answer: finalAnswer, events: options?.verbose ? events : undefined };
  }

  async *streamDomainResearch(threadId: string, domain: string, prompt: string, options?: { tokenMode?: 'char' | 'word'; signal?: AbortSignal }) {
    const logJSON = (payload: Record<string, unknown>) => {
      // Keep log lines simple: one JSON object per line.
      this.logger.log(JSON.stringify({ service: 'AiService', ...payload }));
    };

    const normalizeValue = (v: any): string => {
      if (v === null || v === undefined) return '';
      if (typeof v === 'string') return v;
      if (typeof v === 'object' && typeof v.text === 'string') return v.text;
      try {
        return JSON.stringify(v);
      } catch {
        return String(v);
      }
    };

    // Fast path: if DB already has enough affiliate info, skip the whole agent.
    // This removes many minutes of "LLM + tools" when the domain was researched before.
    const requiredKeys = ['commission_rate', 'program_url', 'details'];
    const existingAffiliateRows = await this.researchDataRepo.find({
      where: {
        domain,
        category: 'affiliate_info',
        key: In(requiredKeys),
      },
    });

    if (existingAffiliateRows.length === requiredKeys.length) {
      const byKey = new Map(existingAffiliateRows.map((r) => [r.key, r.value]));
      const commissionRate = byKey.get('commission_rate');
      const programUrl = byKey.get('program_url');
      const details = byKey.get('details');

      if (commissionRate != null && programUrl != null && details != null) {
        const answerObj = {
          commission_rate: normalizeValue(commissionRate),
          program_url: normalizeValue(programUrl),
          details: normalizeValue(details),
        };

        // Keep memory small but still track that we served cached response.
        let memoryEntity = await this.agentMemoryRepo.findOne({ where: { threadId } });
        if (!memoryEntity) memoryEntity = this.agentMemoryRepo.create({ threadId, memory: [] });
        memoryEntity.memory = [...(memoryEntity.memory || []), `Cached affiliate answer for ${domain}`];
        await this.agentMemoryRepo.save(memoryEntity);

        yield {
          type: 'status',
          data: { message: `Using cached affiliate data for ${domain}.`, domain, threadId },
          threadId,
        } as ResearchEvent;
        yield {
          type: 'final_answer',
          data: { content: JSON.stringify(answerObj, null, 2), domain, threadId },
          threadId,
        } as ResearchEvent;
        logJSON({ event: 'cache_hit', domain, threadId });
        return;
      }
    }

    // 1. Fetch System Configurations (Tools, Rules, Workflows via RAG)
    // Cải tiến: Load tất cả các document cấu hình (ví dụ category = system_config, tool_descriptions)
    // Để AI hiểu cách thức làm việc một cách linh hoạt không qua hardcode.
    const ragContext = await this.ragService.getActiveContext();

    // 2. Tối ưu Memory của Agent
    // Tìm hoặc khởi tạo Memory dạng summary (không nạp toàn bộ lịch sử tin nhắn thô, giúp chống tràn context)
    let memoryEntity = await this.agentMemoryRepo.findOne({ where: { threadId } });
    if (!memoryEntity) {
      memoryEntity = this.agentMemoryRepo.create({ threadId, memory: [] });
    }

    const tools = this.getAllTools();
    const researchApp = createResearchGraph(this.llm, { tools });

    // 3. Build System Prompt với RAG context và Memory (Summary) hiện tại
    const systemPrompt = buildSystemPrompt({
      domain,
      goal: prompt,
      ragContext,
      previousMemory: memoryEntity.memory,
    });

    const initialState = {
      messages: [new SystemMessage(systemPrompt), new HumanMessage(prompt)],
      domain,
      goal: prompt,
      ragContext,
    };

    let finalAnswer = '';
    const tokenMode = options?.tokenMode || 'word';
    const START_NARRATION = '<narration>';
    const END_NARRATION = '</narration>';
    const START_THINK = '<think>';
    const END_THINK = '</think>';

    // Stream parser state:
    // - Everything inside <narration>...</narration> becomes `thinking` events.
    // - Everything outside becomes `thought` token stream + finalAnswer.
    let parseBuffer = '';
    let inNarration = false;
    let inThink = false;
    let narrationBuffer = '';
    let answerThoughtBuffer = '';
    let lastNarrationEmittedAt = 0;

    let toolStack: Array<{ toolName: string; startedAt: number }> = [];

    // Xóa việc truyền checkpointer thread_id vì LangGraph hiện tại được cho chạy stateless (không checkpointer)
    const eventStream = researchApp.streamEvents(initialState, {
      version: 'v2',
      signal: options?.signal,
    });

    for await (const event of eventStream) {
      const eventName = event.event;
      const streamEvent = event;

      // 1. Thought / Streaming Tokens
      if (eventName === 'on_chat_model_stream' || eventName === 'on_llm_stream') {
        const chunk = streamEvent.data?.chunk;
        const content = typeof chunk === 'string' ? chunk : chunk?.content;
        if (content) {
          parseBuffer += content;

          const shouldFlushAnswer = () =>
            tokenMode === 'char'
              ? true
              : answerThoughtBuffer.length >= 20 ||
                /[\s\n]+$/.test(answerThoughtBuffer) ||
                /[.,:;!?]\s*$/.test(answerThoughtBuffer) ||
                /\n$/.test(answerThoughtBuffer);

          while (true) {
            // Drop chain-of-thought completely while streaming.
            if (inThink) {
              const endThinkIdx = parseBuffer.indexOf(END_THINK);
              if (endThinkIdx === -1) {
                // Keep a tail that could be prefix of END_THINK
                const keepLen = Math.max(0, Math.min(parseBuffer.length, END_THINK.length - 1));
                parseBuffer = parseBuffer.slice(parseBuffer.length - keepLen);
                break;
              }

              parseBuffer = parseBuffer.slice(endThinkIdx + END_THINK.length);
              inThink = false;
              continue;
            }

            if (!inNarration) {
              const thinkStartIdx = parseBuffer.indexOf(START_THINK);
              if (thinkStartIdx !== -1) {
                const before = parseBuffer.slice(0, thinkStartIdx);
                if (before) {
                  finalAnswer += before;
                  answerThoughtBuffer += before;
                  if (shouldFlushAnswer() && answerThoughtBuffer.trim().length > 0) {
                    yield { type: 'thought', data: { content: answerThoughtBuffer }, threadId } as ResearchEvent;
                    answerThoughtBuffer = '';
                  }
                }
                parseBuffer = parseBuffer.slice(thinkStartIdx + START_THINK.length);
                inThink = true;
                continue;
              }

              const startIdx = parseBuffer.indexOf(START_NARRATION);
              if (startIdx === -1) {
                // Keep a tail that could be prefix of START_NARRATION
                const keepLen = Math.max(0, Math.min(parseBuffer.length, START_NARRATION.length - 1));
                const emit = parseBuffer.slice(0, parseBuffer.length - keepLen);
                if (emit) {
                  finalAnswer += emit;
                  answerThoughtBuffer += emit;
                }
                parseBuffer = parseBuffer.slice(parseBuffer.length - keepLen);
                if (shouldFlushAnswer() && answerThoughtBuffer.trim().length > 0) {
                  yield { type: 'thought', data: { content: answerThoughtBuffer }, threadId } as ResearchEvent;
                  answerThoughtBuffer = '';
                }
                break;
              }

              const before = parseBuffer.slice(0, startIdx);
              if (before) {
                finalAnswer += before;
                answerThoughtBuffer += before;
                if (shouldFlushAnswer() && answerThoughtBuffer.trim().length > 0) {
                  yield { type: 'thought', data: { content: answerThoughtBuffer }, threadId } as ResearchEvent;
                  answerThoughtBuffer = '';
                }
              }
              parseBuffer = parseBuffer.slice(startIdx + START_NARRATION.length);
              inNarration = true;
              narrationBuffer = '';
              // continue parsing with remaining buffer
              continue;
            }

            // inNarration == true
            const endIdx = parseBuffer.indexOf(END_NARRATION);
            if (endIdx === -1) {
              const keepLen = Math.max(0, Math.min(parseBuffer.length, END_NARRATION.length - 1));
              const narrationPart = parseBuffer.slice(0, parseBuffer.length - keepLen);
              if (narrationPart) narrationBuffer += narrationPart;
              parseBuffer = parseBuffer.slice(parseBuffer.length - keepLen);
              break;
            }

            const narrationPart = parseBuffer.slice(0, endIdx);
            narrationBuffer += narrationPart;

            const narrated = narrationBuffer
              .replace(/<think>[\s\S]*?<\/think>/g, '')
              .trim();
            if (narrated.length > 0) {
              lastNarrationEmittedAt = Date.now();
              yield {
                type: 'thinking',
                data: { message: narrated, domain, threadId },
                threadId,
              } as ResearchEvent;
            }

            narrationBuffer = '';
            parseBuffer = parseBuffer.slice(endIdx + END_NARRATION.length);
            inNarration = false;
            continue;
          }
        }
        continue;
      }

      // 2. Tool Start
      if (eventName === 'on_tool_start') {
        const toolName = streamEvent.name;
        toolStack.push({ toolName, startedAt: Date.now() });

        logJSON({ event: 'tool_start', domain, threadId, tool: toolName });

        yield {
          type: 'tool_start',
          data: { tool: toolName, input: streamEvent.data?.input, message: `Calling tool: ${toolName}...` },
          threadId,
        } as ResearchEvent;
        continue;
      }

      // 3. Tool End
      if (eventName === 'on_tool_end') {
        const toolName = streamEvent.name;
        const output = streamEvent.data?.output;
        let parsedOutput = output;
        try { if (typeof output === 'string' && output.startsWith('{')) parsedOutput = JSON.parse(output); } catch { }

        const stackIdxFromEnd = (() => {
          for (let i = toolStack.length - 1; i >= 0; i--) {
            if (toolStack[i].toolName === toolName) return i;
          }
          return -1;
        })();

        const matched = stackIdxFromEnd >= 0 ? toolStack[stackIdxFromEnd] : undefined;
        const durationMs = matched ? Date.now() - matched.startedAt : undefined;
        if (matched) toolStack.splice(stackIdxFromEnd, 1);

        const messageFromTool = (() => {
          if (typeof parsedOutput === 'string') return `Tool ${toolName} finished.`;

          if (toolName === 'domain_traffic_semrush') {
            return parsedOutput?.message || 'Traffic data saved.';
          }

          if (toolName === 'read_data') {
            if (parsedOutput?.found === true) {
              const count = typeof parsedOutput?.count === 'number' ? parsedOutput.count : parsedOutput?.data?.length;
              return `Đã đọc dữ liệu cũ thành công${count ? ` (count: ${count})` : ''}.`;
            }
            return parsedOutput?.message || 'Không có dữ liệu phù hợp trong DB.';
          }

          if (toolName === 'web_search') {
            const total = parsedOutput?.totalResults ?? parsedOutput?.results?.length ?? 0;
            return `Đã tìm thấy ${total} kết quả. Chuẩn bị mở trang phù hợp để trích nội dung...`;
          }

          if (toolName === 'web_scraper') {
            const title = parsedOutput?.title ? String(parsedOutput.title) : parsedOutput?.url ? String(parsedOutput.url) : '';
            const content = parsedOutput?.content ? String(parsedOutput.content) : '';
            const len = content ? `${content.length} chars` : '';
            return title ? `Đã crawl: ${title}${len ? ` (${len})` : ''}.` : `Đã crawl trang.`;
          }

          if (toolName === 'save_data') {
            if (parsedOutput?.success && parsedOutput?.action) return `Lưu dữ liệu: ${parsedOutput.action}.`;
            return parsedOutput?.message || 'Đã lưu dữ liệu.';
          }

          if (toolName === 'http_request') {
            if (parsedOutput?.error) return `HTTP error: ${parsedOutput.message || 'Unknown error'}`;
            const status = parsedOutput?.status ?? '';
            return status ? `HTTP request thành công (status: ${status}).` : 'HTTP request finished.';
          }

          return parsedOutput?.message || (parsedOutput?.success ? 'Saved.' : `Tool ${toolName} finished.`);
        })();

        logJSON({
          event: 'tool_end',
          domain,
          threadId,
          tool: toolName,
          durationMs,
        });

        yield {
          type: 'tool_end',
          data: {
            tool: toolName,
            output: parsedOutput,
            status: 'success',
            durationMs,
            message: messageFromTool
          },
          threadId,
        } as ResearchEvent;
        continue;
      }

      // 4. Final Answer Metadata (internal status)
      // Khi quá trình Graph chạy xong hoàn toàn
      if (eventName === 'on_chain_end' && streamEvent.name === 'LangGraph') {
        const cleanAnswer = this.stripThinking(finalAnswer);
        // Discard unfinished narration/think fragments if any.
        parseBuffer = '';
        inNarration = false;
        inThink = false;

        try {
          // Heuristic memory summary (avoid extra LLM call for speed).
          const summaryCandidate = typeof cleanAnswer === 'string' ? cleanAnswer : String(cleanAnswer);
          const finalSummary = summaryCandidate.length > 600
            ? `${summaryCandidate.slice(0, 600)}...[truncated]`
            : summaryCandidate;

          memoryEntity.memory = [...(memoryEntity.memory || []), finalSummary];
          await this.agentMemoryRepo.save(memoryEntity);
          logJSON({ event: 'memory_saved', threadId, domain, summaryLen: finalSummary.length });
        } catch (err) {
          this.logger.error(`[Memory] Failed to save memory for threadId ${threadId}`, err);
        }

        // Flush any leftover answer buffer.
        if (answerThoughtBuffer.trim().length > 0) {
          yield { type: 'thought', data: { content: answerThoughtBuffer }, threadId } as ResearchEvent;
          answerThoughtBuffer = '';
        }

        yield {
          type: 'final_answer',
          data: { content: cleanAnswer, domain, threadId },
          threadId,
        } as ResearchEvent;
      }
    }
  }

  async runTool(toolName: string, input: Record<string, unknown>) {
    const tools = this.getAllTools();
    const tool = tools.find((t) => t.name === toolName);
    if (!tool) throw new Error(`Tool not found: ${toolName}`);
    const output = await (tool as any).invoke(input);
    return { tool: toolName, input, output };
  }

  private getAllTools() {
    const saveDataTool = createSaveDataTool(this.researchDataRepo);
    const readDataTool = createReadDataTool(this.researchDataRepo);
    const semrushTool = createSemrushTrafficTool(this.semrushTrafficRepo, this.researchDataRepo);
    return [...staticTools, saveDataTool, readDataTool, semrushTool];
  }

  private stripThinking(text: string): string {
    return text
      .replace(/<think>[\s\S]*?<\/think>/g, '')
      .replace(/<narration>[\s\S]*?<\/narration>/g, '')
      .trim();
  }
}
