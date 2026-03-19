import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatOllama } from '@langchain/ollama';
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

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly llm: ChatOllama;

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
    this.llm = new ChatOllama({
      baseUrl: this.configService.get<string>('ai.ollamaBaseUrl'),
      model: 'qwen2.5:7b',
      temperature: 0,
      numCtx: 32768, // Tăng context window lên 32k để xử lý được nhiều content web & RAG context mà không bị truncate
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
    const tokenMode = options?.tokenMode || 'char';

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
          finalAnswer += content;
          yield { type: 'thought', data: { content }, threadId } as ResearchEvent;
        }
        continue;
      }

      // 2. Tool Start
      if (eventName === 'on_tool_start') {
        const toolName = streamEvent.name;
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
        try { if (typeof output === 'string' && output.startsWith('{')) parsedOutput = JSON.parse(output); } catch {}
        
        yield {
          type: 'tool_end',
          data: { 
            tool: toolName, 
            output: parsedOutput, 
            status: 'success',
            message: toolName === 'domain_traffic_semrush' ? (parsedOutput?.message || 'Traffic data saved.') : `Tool ${toolName} finished.`
          },
          threadId,
        } as ResearchEvent;
        continue;
      }

      // 4. Final Answer Metadata (internal status)
      // Khi quá trình Graph chạy xong hoàn toàn
      if (eventName === 'on_chain_end' && streamEvent.name === 'LangGraph') {
        const cleanAnswer = this.stripThinking(finalAnswer);

        // 5. Tóm tắt lại hành động AI vừa làm và lưu vào Memory Repository
        // Điều chỉnh này giúp lưu thông tin qua các lần gọi Agent một cách ngắn gọn, không bị context limit
        const summarizePrompt = `Bạn vừa thực hiện xong một tác vụ thay vì người dùng.
Mục tiêu tác vụ (Goal): ${prompt}
Kết quả đầu ra của bạn: ${cleanAnswer}

Hãy tóm tắt ngắn gọn trong 1-2 câu những gì bạn đã làm được ở bước này bằng tiếng Việt. CHỈ trả về phần tóm tắt, không giải thích gì thêm.`;
        
        try {
          // Gọi nhanh LLM để tóm tắt kết quả
          const summaryRes = await this.llm.invoke([new HumanMessage(summarizePrompt)]);
          const summaryContent = typeof summaryRes.content === 'string' ? summaryRes.content : JSON.stringify(summaryRes.content);
          const finalSummary = this.stripThinking(summaryContent);

          // Thêm tóm tắt mới vào cuối mảng Memory
          memoryEntity.memory.push(finalSummary);
          await this.agentMemoryRepo.save(memoryEntity);
          this.logger.log(`[Memory] Updated summary for threadId ${threadId}: ${finalSummary}`);
        } catch (err) {
          this.logger.error(`[Memory] Failed to summarize and save memory for threadId ${threadId}`, err);
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
    return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  }
}
