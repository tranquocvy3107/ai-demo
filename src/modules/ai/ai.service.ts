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

  // Build the full tool list including dynamic (DB-backed) tools
  private getAllTools() {
    const saveDataTool = createSaveDataTool(this.researchDataRepo);
    const readDataTool = createReadDataTool(this.researchDataRepo);
    return [...staticTools, saveDataTool, readDataTool];
  }

  // Trigger the LangGraph domain research workflow
  async startDomainResearch(threadId: string, domain: string, prompt: string) {
    this.logger.log(`Starting research for ${domain} with thread ${threadId}`);

    // Fetch RAG context from knowledge base
    const ragContext = await this.ragService.getActiveContext();
    this.logger.debug(`RAG context loaded: ${ragContext.length} chars`);

    // Build tools and create graph for this run
    const tools = this.getAllTools();
    const researchApp = createResearchGraph(this.llm, { tools });

    const initialState = {
      messages: [new HumanMessage(prompt)],
      domain,
      goal: prompt,
      ragContext,
    };

    // We stream the graph event steps to observe reasoning
    const stream = await researchApp.stream(initialState, {
      configurable: { thread_id: threadId },
    });

    const steps = [];
    for await (const chunk of stream) {
      this.logger.debug(JSON.stringify(chunk));
      steps.push(chunk);
    }

    return steps;
  }
}
