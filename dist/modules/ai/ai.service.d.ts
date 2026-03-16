import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { ResearchData } from './entities/research-data.entity';
import { RagService } from '../rag/rag.service';
export declare class AiService {
    private configService;
    private researchDataRepo;
    private ragService;
    private readonly logger;
    private llm;
    constructor(configService: ConfigService, researchDataRepo: Repository<ResearchData>, ragService: RagService);
    generateResponse(prompt: string): Promise<string>;
    private getAllTools;
    startDomainResearch(threadId: string, domain: string, prompt: string): Promise<{
        agent?: {
            messages: import("@langchain/core/messages").AIMessageChunk<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>>[];
        } | undefined;
        tools?: any;
    }[]>;
}
