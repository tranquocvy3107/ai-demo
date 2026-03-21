import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
  type: 'thought' | 'tool_start' | 'tool_end' | 'final_answer' | 'error' | 'status';
  data: any;
  threadId?: string;
};

export type ThinkingMode = 'auto' | 'on' | 'off';

type StreamResearchOptions = {
  tokenMode?: 'char' | 'word';
  signal?: AbortSignal;
  includeThinking?: ThinkingMode;
  enableMemorySummary?: boolean;
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly llm: ChatOpenAI;
  private static readonly THINKING_AUTO_LIMIT_CHARS = 800;
  private static readonly WORD_STREAM_BATCH = 6;
  private static readonly CHAR_STREAM_BATCH = 80;

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

  async startDomainResearch(
    threadId: string,
    domain: string,
    prompt: string,
    options?: { verbose?: boolean; includeThinking?: ThinkingMode; tokenMode?: 'char' | 'word'; enableMemorySummary?: boolean },
  ) {
    const events: ResearchEvent[] = [];
    for await (const event of this.streamDomainResearch(threadId, domain, prompt, {
      tokenMode: options?.tokenMode,
      includeThinking: options?.includeThinking,
      enableMemorySummary: options?.enableMemorySummary,
    })) {
      events.push(event);
    }
    const finalAnswer = events.find(e => e.type === 'final_answer')?.data?.content || '';
    return { answer: finalAnswer, events: options?.verbose ? events : undefined };
  }

  async *streamDomainResearch(threadId: string, domain: string, prompt: string, options?: StreamResearchOptions) {
    const traceId = uuidv4();
    const startedAt = Date.now();
    const tokenMode = options?.tokenMode || 'word';
    const includeThinking = options?.includeThinking || 'auto';
    const enableMemorySummary = options?.enableMemorySummary ?? true;

    this.logProgress('research_start', { traceId, threadId, domain, tokenMode, includeThinking });
    yield this.createStatusEvent(threadId, {
      code: 'research_start',
      message: `Bắt đầu research domain ${domain}`,
      traceId,
    });

    const ragStartedAt = Date.now();
    const ragContext = await this.ragService.getActiveContext();
    this.logProgress('rag_loaded', {
      traceId,
      threadId,
      ragLength: ragContext?.length || 0,
      elapsedMs: Date.now() - ragStartedAt,
    });
    yield this.createStatusEvent(threadId, {
      code: 'rag_loaded',
      message: 'Đã nạp cấu hình hệ thống, chuẩn bị lập kế hoạch dùng tool.',
      traceId,
      elapsedMs: Date.now() - ragStartedAt,
    });

    const memoryLoadStartedAt = Date.now();
    let memoryEntity = await this.agentMemoryRepo.findOne({ where: { threadId } });
    if (!memoryEntity) {
      memoryEntity = this.agentMemoryRepo.create({ threadId, memory: [] });
    }
    this.logProgress('memory_loaded', {
      traceId,
      threadId,
      memoryItems: memoryEntity.memory?.length || 0,
      elapsedMs: Date.now() - memoryLoadStartedAt,
    });

    const tools = this.getAllTools();
    const researchApp = createResearchGraph(this.llm, { tools });
    yield this.createStatusEvent(threadId, {
      code: 'planning',
      message: `Đã sẵn sàng ${tools.length} tools. AI đang lập kế hoạch tác vụ.`,
      traceId,
    });

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
    let thoughtBuffer = '';
    let thoughtAutoChars = 0;
    let hasStartedToolPhase = false;
    const toolDurations = new Map<string, number[]>();

    const eventStream = researchApp.streamEvents(initialState, {
      version: 'v2',
      signal: options?.signal,
    });

    for await (const event of eventStream) {
      const eventName = event.event;
      const streamEvent = event;

      if (eventName === 'on_chat_model_stream' || eventName === 'on_llm_stream') {
        const chunk = streamEvent.data?.chunk;
        const content = typeof chunk === 'string' ? chunk : chunk?.content;
        if (content) {
          finalAnswer += content;

          if (includeThinking === 'off') {
            continue;
          }

          if (includeThinking === 'auto') {
            if (hasStartedToolPhase) {
              continue;
            }
            if (thoughtAutoChars >= AiService.THINKING_AUTO_LIMIT_CHARS) {
              continue;
            }
          }

          thoughtBuffer += content;
          thoughtAutoChars += content.length;

          if (this.shouldFlushThoughtBuffer(thoughtBuffer, tokenMode)) {
            yield { type: 'thought', data: { content: thoughtBuffer }, threadId } as ResearchEvent;
            thoughtBuffer = '';
          }
        }
        continue;
      }

      if (eventName === 'on_tool_start') {
        const toolName = streamEvent.name;
        hasStartedToolPhase = true;
        const queue = toolDurations.get(toolName) || [];
        queue.push(Date.now());
        toolDurations.set(toolName, queue);
        const parsedInput = this.normalizeToolInput(streamEvent.data?.input);

        if (thoughtBuffer) {
          yield { type: 'thought', data: { content: thoughtBuffer }, threadId } as ResearchEvent;
          thoughtBuffer = '';
        }

        yield this.createStatusEvent(threadId, {
          code: 'tool_start',
          tool: toolName,
          message: `Đã nhận yêu cầu cho ${toolName}, đang thu thập dữ liệu đầu vào.`,
          traceId,
        });
        yield {
          type: 'tool_start',
          data: {
            tool: toolName,
            input: parsedInput,
            message: `Calling tool: ${toolName}...`,
            traceId,
          },
          threadId,
        } as ResearchEvent;
        this.logProgress('tool_start', { traceId, threadId, tool: toolName, input: parsedInput });
        continue;
      }

      if (eventName === 'on_tool_end') {
        const toolName = streamEvent.name;
        const output = streamEvent.data?.output;
        const parsedOutput = this.normalizeToolOutput(output);
        const queue = toolDurations.get(toolName) || [];
        const toolStartedAt = queue.shift();
        toolDurations.set(toolName, queue);
        const elapsedMs = toolStartedAt ? Date.now() - toolStartedAt : undefined;

        yield {
          type: 'tool_end',
          data: {
            tool: toolName,
            output: parsedOutput,
            status: 'success',
            elapsedMs,
            traceId,
            message:
              toolName === 'domain_traffic_semrush'
                ? ((parsedOutput as Record<string, unknown>)?.message || 'Traffic data saved.')
                : `Tool ${toolName} finished.`,
          },
          threadId,
        } as ResearchEvent;
        yield this.createStatusEvent(threadId, {
          code: 'tool_end',
          tool: toolName,
          message: `Đã nhận kết quả từ ${toolName}${elapsedMs ? ` sau ${elapsedMs}ms` : ''}.`,
          traceId,
          elapsedMs,
        });
        this.logProgress('tool_end', { traceId, threadId, tool: toolName, elapsedMs });
        continue;
      }

      if (eventName === 'on_chain_end' && streamEvent.name === 'LangGraph') {
        if (thoughtBuffer && includeThinking !== 'off') {
          yield { type: 'thought', data: { content: thoughtBuffer }, threadId } as ResearchEvent;
          thoughtBuffer = '';
        }

        const cleanAnswer = this.stripThinking(finalAnswer);
        if (enableMemorySummary) {
          try {
            const summary = this.buildFastMemorySummary(domain, prompt, cleanAnswer);
            memoryEntity.memory = [...(memoryEntity.memory || []), summary].slice(-20);
            await this.agentMemoryRepo.save(memoryEntity);
            this.logProgress('memory_saved', { traceId, threadId, memoryItems: memoryEntity.memory.length });
          } catch (err) {
            this.logger.error(`[Memory] Failed to save memory for threadId ${threadId}`, err);
          }
        }

        const totalElapsedMs = Date.now() - startedAt;
        yield this.createStatusEvent(threadId, {
          code: 'research_done',
          message: `Hoàn tất research cho ${domain}.`,
          traceId,
          elapsedMs: totalElapsedMs,
        });

        yield {
          type: 'final_answer',
          data: { content: cleanAnswer, domain, threadId },
          threadId,
        } as ResearchEvent;
        this.logProgress('research_done', { traceId, threadId, domain, elapsedMs: totalElapsedMs });
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

  private createStatusEvent(threadId: string, payload: Record<string, unknown>): ResearchEvent {
    return { type: 'status', data: payload, threadId };
  }

  private shouldFlushThoughtBuffer(buffer: string, tokenMode: 'char' | 'word'): boolean {
    if (!buffer) return false;
    if (tokenMode === 'char') {
      return buffer.length >= AiService.CHAR_STREAM_BATCH;
    }
    const words = buffer.trim().split(/\s+/).filter(Boolean).length;
    return words >= AiService.WORD_STREAM_BATCH || /[.!?]\s*$/.test(buffer);
  }

  private normalizeToolInput(input: unknown): unknown {
    if (input && typeof input === 'object' && 'input' in (input as Record<string, unknown>)) {
      const nestedInput = (input as Record<string, unknown>).input;
      if (typeof nestedInput === 'string') {
        const parsedNested = this.tryParseJson(nestedInput);
        return parsedNested ?? nestedInput;
      }
    }
    return input;
  }

  private normalizeToolOutput(output: unknown): unknown {
    const directParsed = this.tryParseJson(output);
    if (directParsed !== null) {
      return directParsed;
    }

    if (output && typeof output === 'object' && 'kwargs' in (output as Record<string, unknown>)) {
      const kwargs = (output as Record<string, unknown>).kwargs as Record<string, unknown> | undefined;
      const content = kwargs?.content;
      if (typeof content === 'string') {
        const parsedContent = this.tryParseJson(content);
        return parsedContent ?? content;
      }
    }

    return output;
  }

  private tryParseJson(data: unknown): any | null {
    if (typeof data !== 'string') {
      return null;
    }
    const trimmed = data.trim();
    if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) {
      return null;
    }
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }

  private buildFastMemorySummary(domain: string, prompt: string, answer: string): string {
    const goal = prompt.length > 180 ? `${prompt.slice(0, 177)}...` : prompt;
    const output = answer.replace(/\s+/g, ' ').trim();
    const clippedOutput = output.length > 260 ? `${output.slice(0, 257)}...` : output;
    return `Domain ${domain} | Goal: ${goal} | Result: ${clippedOutput}`;
  }

  private logProgress(stage: string, payload: Record<string, unknown>): void {
    this.logger.log(JSON.stringify({ stage, ...payload }));
  }

  private stripThinking(text: string): string {
    return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  }
}
